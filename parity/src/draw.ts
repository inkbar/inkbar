// Opens a fixture with core's reader and draws its pages, alone or with the form layer over them.
import { openDocument, type InkDocument, type PageInfo } from '@inkbar/core'
import {
  createPageMount,
  createPageTransform,
  normalizeRotation,
  type ViewRotation,
} from '@inkbar/core/dom'
import manifestJson from '@inkbar/fixtures/manifest.json'
import {
  browserAssets,
  FIXTURE_NAMES,
  fixtureUrl,
  type FixtureName,
} from '@inkbar/fixtures/urls'

import type { FixtureMeta } from '@inkbar/fixtures'

const manifest = manifestJson as unknown as Record<FixtureName, FixtureMeta>

/** Pages checked per fixture: the first three, or fewer when the file has fewer. */
export const PAGES_PER_FIXTURE = 3
/** CSS pixels per point of every page the suite draws, at pixel ratio 1. */
export const PIXELS_PER_POINT = 1

/** Every fixture the manifest says opens. */
export const OPENING = FIXTURE_NAMES.filter((name) => manifest[name].opens)

/**
 * Opens `name`, the manifest's password included, with the fallback fonts the test server
 * serves. Rejects if it does not open.
 */
export async function openFixture(name: FixtureName): Promise<InkDocument> {
  const password = manifest[name].password
  const doc = await openDocument(fixtureUrl(name), {
    assets: browserAssets(),
    ...(password !== undefined && { password }),
  })
  try {
    await doc.ready
  } catch (err) {
    doc.destroy()
    throw err
  }
  return doc
}

/** The number of pages of `doc` the suite draws and reads text from. */
export const pagesChecked = (doc: InkDocument): number =>
  Math.min(doc._reader.pageCount, PAGES_PER_FIXTURE)

/**
 * The canvas size core gives a whole page at `PIXELS_PER_POINT` and pixel ratio 1, turned a
 * further `turn` degrees: the page transform's CSS size, /UserUnit and /Rotate included, rounded
 * as the page canvas rounds it.
 */
export function canvasSize(
  info: PageInfo,
  turn: ViewRotation = 0
): { width: number; height: number } {
  const t = createPageTransform(info, PIXELS_PER_POINT, turn)
  return { width: Math.round(t.cssWidth), height: Math.round(t.cssHeight) }
}

/** The pixels of `canvas`, after which its backing store is freed. */
function pixelsOf(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  // Freed now rather than at the next collection.
  canvas.width = canvas.height = 0
  return data
}

/**
 * Page `page` of `doc`, drawn whole on white at `PIXELS_PER_POINT` with its own /Rotate, turned a
 * further `turn` degrees.
 */
export async function drawPage(
  doc: InkDocument,
  page: number,
  turn: ViewRotation = 0
): Promise<ImageData> {
  const info = await doc._reader.pageInfo(page)
  const { width, height } = canvasSize(info, turn)
  const canvas = document.createElement('canvas')
  await doc._reader.draw(
    {
      page,
      rotation: normalizeRotation(info.rotate + turn),
      zoom: PIXELS_PER_POINT,
      pixelRatio: 1,
      width,
      height,
      hide: [],
    },
    canvas
  )
  return pixelsOf(canvas)
}

/** The pages among the first `pages` of `doc` that hold a widget of one of its form fields. */
export function pagesWithFields(doc: InkDocument, pages: number): number[] {
  return [
    ...new Set(
      doc.form.fields
        .get()
        .flatMap((f) => f.widgets.map((w) => w.page))
        .filter((page) => page < pages)
    ),
  ].sort((a, b) => a - b)
}

/**
 * Page `page` of `doc` as a person sees a form: mounted as the viewer mounts it, at
 * `PIXELS_PER_POINT`, pixel ratio 1 and its own /Rotate, once its canvas and the appearances the
 * form layer shows have painted. The page canvas leaves the fields' widgets out; each appearance
 * canvas the layer shows is drawn over it where the layer places it, in the layer's order. Only
 * canvases are captured: a widget whose look the layer hands to its HTML control (a value a
 * script changed) or hides shows no appearance canvas, and the HTML controls and every other DOM
 * layer are left out. Rejects when either the page or the form layer fails to draw.
 */
export async function drawWithFields(doc: InkDocument, page: number): Promise<ImageData> {
  const info = await doc._reader.pageInfo(page)
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
  try {
    await mount.renderer.rendered
    await mount.form?.rendered
    if (failures.length > 0) throw failures[0]
    const { width, height } = canvasSize(info)
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
    for (const canvas of host.querySelectorAll<HTMLCanvasElement>(
      '[data-ink-form-appearance] [data-ink-appearance] canvas'
    )) {
      // A canvas the layer hides, itself or through its box, is not seen.
      if (!canvas.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
        continue
      // At pixel ratio 1 the layer places each canvas at whole device pixels.
      ctx.drawImage(canvas, parseFloat(canvas.style.left), parseFloat(canvas.style.top))
    }
    return pixelsOf(out)
  } finally {
    mount.destroy()
    host.remove()
  }
}
