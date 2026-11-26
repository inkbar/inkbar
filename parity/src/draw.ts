// Draws a fixture's pages with both readers, through core's internal reader, at one size.
import {
  openDocument,
  type EngineLoader,
  type InkDocument,
  type PageInfo,
} from '@inkbar/core'
import { createPageMount, createPageTransform } from '@inkbar/core/dom'
import manifest from '@inkbar/fixtures/manifest.json'
import { browserAssets, fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import { fontUrls } from '@inkbar/fonts'

export { PAGES_PER_FIXTURE } from './pages'
export const PIXELS_PER_POINT = 2

export type ReaderKind = 'pdfjs' | 'engine'

/** Where the test server serves the `@inkbar/fonts` files. */
const FONTS_BASE = '/inkbar-fonts/'

/** The real engine, with the fallback fonts the sandbox gives it. */
const engineWithFonts: EngineLoader = async () => {
  const real = await import('@inkbar/engine')
  return {
    createEngine: () => real.createEngine({ fallbackFonts: fontUrls(FONTS_BASE) }),
  }
}

/** The core switch that makes `openDocument` read with the engine. Never public. */
const flag = globalThis as { __INKBAR_READER__?: unknown }

/** Opens `name` with one reader, the manifest's password included. Rejects if it does not open. */
export async function openWith(
  name: FixtureName,
  kind: ReaderKind
): Promise<InkDocument> {
  const password = (manifest as Record<string, { password?: string }>)[name]?.password
  if (kind === 'engine') flag.__INKBAR_READER__ = 'engine'
  let doc: InkDocument
  try {
    doc = await openDocument(fixtureUrl(name), {
      assets: browserAssets(),
      engine: engineWithFonts,
      ...(password !== undefined && { password }),
    })
  } finally {
    delete flag.__INKBAR_READER__
  }
  try {
    await doc.ready
  } catch (err) {
    doc.destroy()
    throw err
  }
  if (doc._reader.kind !== kind) {
    doc.destroy()
    throw new Error(`${name} opened with ${doc._reader.kind}, not ${kind}`)
  }
  return doc
}

/** Where `a` and `b` disagree on a page's box, rotation or user unit; empty when they agree. */
export function geometryDifference(a: PageInfo, b: PageInfo): string[] {
  const out: string[] = []
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (Math.abs(a.box[key] - b.box[key]) > 0.01) {
      out.push(`box ${key}: PDF.js ${a.box[key]}, engine ${b.box[key]}`)
    }
  }
  if (a.rotate !== b.rotate) out.push(`rotate: PDF.js ${a.rotate}, engine ${b.rotate}`)
  if (Math.abs(a.userUnit - b.userUnit) > 1e-6) {
    out.push(`user unit: PDF.js ${a.userUnit}, engine ${b.userUnit}`)
  }
  return out
}

/**
 * The canvas size core gives a whole page at `PIXELS_PER_POINT` and pixel ratio 1: the page
 * transform's CSS size, /UserUnit and /Rotate included, rounded as the page canvas rounds it.
 */
export function canvasSize(info: PageInfo): { width: number; height: number } {
  const t = createPageTransform(info, PIXELS_PER_POINT, 0)
  return { width: Math.round(t.cssWidth), height: Math.round(t.cssHeight) }
}

/**
 * Page `page` of `doc`, drawn whole on white at `PIXELS_PER_POINT` with the /Rotate of `info`.
 * `info` is one reader's page facts, the same for both readers' draws, so both are asked for the
 * same canvas size and turn: the caller checks first that the two readers' facts agree.
 */
export async function drawPage(
  doc: InkDocument,
  page: number,
  info: PageInfo
): Promise<ImageData> {
  const { width, height } = canvasSize(info)
  const canvas = document.createElement('canvas')
  await doc._reader.draw(
    {
      page,
      rotation: info.rotate,
      zoom: PIXELS_PER_POINT,
      pixelRatio: 1,
      width,
      height,
      hide: [],
    },
    canvas
  )
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  // Free the canvas's backing store now rather than at the next collection.
  canvas.width = canvas.height = 0
  return data
}

/** Page `page` of fixture `name`, drawn by PDF.js and by the engine. Opens and closes both. */
export async function drawBoth(
  name: FixtureName,
  page: number
): Promise<{ pdfjs: ImageData; engine: ImageData }> {
  const pdfjsDoc = await openWith(name, 'pdfjs')
  try {
    const info = await pdfjsDoc._reader.pageInfo(page)
    const pdfjs = await drawPage(pdfjsDoc, page, info)
    const engineDoc = await openWith(name, 'engine')
    try {
      const apart = geometryDifference(info, await engineDoc._reader.pageInfo(page))
      if (apart.length > 0)
        throw new Error(`${name} page ${page + 1}: ${apart.join('; ')}`)
      return { pdfjs, engine: await drawPage(engineDoc, page, info) }
    } finally {
      engineDoc.destroy()
    }
  } finally {
    pdfjsDoc.destroy()
  }
}

/** The pages among the first `pages` of `doc` that hold a widget of one of its form fields. */
export function pagesWithFields(doc: InkDocument, pages: number): Set<number> {
  return new Set(
    doc.form.fields
      .get()
      .flatMap((f) => f.widgets.map((w) => w.page))
      .filter((page) => page < pages)
  )
}

/** A page mounted as the viewer mounts it, with its form layer, ready to be captured. */
export interface FieldsMount {
  /**
   * The widgets whose look the form layer leaves to its HTML control now (a value a script or a
   * person changed, a script's colour) or hides (a script hid it): these show no appearance
   * canvas.
   */
  leftToControls(): Set<string>
  /**
   * The page canvas, which leaves the fields' widgets out, with each appearance canvas the form
   * layer shows drawn over it where the layer places it, in the layer's order, but those of the
   * widgets in `leave`. Synchronous, so two mounts can be captured in one state.
   */
  capture(leave: ReadonlySet<string>): ImageData
  destroy(): void
}

/**
 * Page `page` of `doc` mounted as the viewer mounts it, form layer and all, at `PIXELS_PER_POINT`,
 * pixel ratio 1 and the /Rotate of `info`, once its canvas and the appearances the form layer
 * shows have painted. Rejects when either fails to draw. Only canvases are captured: the form
 * layer's HTML controls and every other DOM layer are not.
 */
export async function mountWithFields(
  doc: InkDocument,
  page: number,
  info: PageInfo
): Promise<FieldsMount> {
  const transform = createPageTransform(info, PIXELS_PER_POINT, 0)
  const host = document.createElement('div')
  host.style.cssText = `position:relative;width:${transform.cssWidth}px;height:${transform.cssHeight}px;`
  document.body.append(host)
  const failures: unknown[] = []
  const mount = createPageMount({
    document: doc,
    page,
    host,
    transform,
    store: doc.annotations,
    devicePixelRatio: 1,
    formHighlight: false,
    onError: (error) => failures.push(error),
  })
  const destroy = () => {
    mount.destroy()
    host.remove()
  }
  try {
    await mount.renderer.rendered
    await mount.form?.rendered
    if (failures.length > 0) throw failures[0]
  } catch (err) {
    destroy()
    throw err
  }
  const { width, height } = canvasSize(info)
  return {
    leftToControls: () =>
      new Set(
        [...host.querySelectorAll<HTMLElement>('[data-ink-widget]')].flatMap((box) =>
          box.hasAttribute('data-ink-drawn') || box.style.display === 'none'
            ? [box.dataset.inkWidget!]
            : []
        )
      ),
    capture(leave) {
      const pageCanvas = host.querySelector<HTMLCanvasElement>('canvas[data-ink-canvas]')
      if (pageCanvas === null) throw new Error(`page ${page + 1}: no page canvas`)
      if (pageCanvas.width !== width || pageCanvas.height !== height)
        throw new Error(
          `page ${page + 1}: the page canvas is ${pageCanvas.width} × ${pageCanvas.height}, not ${width} × ${height}`
        )
      const out = document.createElement('canvas')
      out.width = width
      out.height = height
      const ctx = out.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(pageCanvas, 0, 0)
      for (const box of host.querySelectorAll<HTMLElement>(
        '[data-ink-form-appearance] [data-ink-appearance]'
      )) {
        if (leave.has(box.dataset.inkAppearance!)) continue
        for (const canvas of box.querySelectorAll('canvas')) {
          if (canvas.style.display === 'none') continue
          // At pixel ratio 1 the layer places each canvas at whole device pixels.
          ctx.drawImage(
            canvas,
            parseFloat(canvas.style.left),
            parseFloat(canvas.style.top)
          )
        }
      }
      const data = ctx.getImageData(0, 0, width, height)
      out.width = out.height = 0
      return data
    },
    destroy,
  }
}
