// Test support only, never production code: browser tests import it. It renders a page as the
// screen shows it and as the saved file draws it, so a test can hold the two side by side.
//
// The screen: the page mounted as the viewer mounts it (PDF.js's canvas, the overlay, its masks
// and loupes) at two pixels a point, photographed. The file: `save()`, then the page rendered
// with its annotations by @inkbar/engine and, as a second reader, by PDF.js.
import { browserAssets, fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import { page as browserPage } from 'vitest/browser'

import { drawingFor } from '../dom/drawing-context'
import { createPageMount } from '../dom/page-mount'
import { savePictures } from '../dom/save-pictures'
import { mountContainer, nextFrame, until } from '../dom/test-utils'
import { createPageTransform, type PageTransform } from '../dom/transform'
import { padRect, paintedRect } from '../model/annotations/drawing/extent'
import { openDocument, type InkDocument } from '../model/document'

import type { DrawItem, TextMeasure } from '../model/annotations/drawing/types'
import type { Annotation, AnnotationInput } from '../model/annotations/types'
import type { Rect } from '../model/geometry'
import type { Engine } from '@inkbar/engine'

/** Pixels per point of every render compared. */
export const PIXELS_PER_POINT = 2
/** How far past an annotation's painted bounds the comparison looks, in points. */
export const GROW = 2
/** A pixel differs when any channel is further apart than this. */
export const CHANNEL_THRESHOLD = 48
/** The most of an annotation's pixels that may differ. */
export const MAX_DIFFERING = 0.02
/**
 * The most of an annotation's pixels that may be left uncounted because the two readers already
 * differ there on the page as opened: past it, the comparison would be checking too little.
 */
export const MAX_EXCLUDED = 0.15
/**
 * The least of an annotation's pixels the pixel comparison must count (not left out for a
 * position check, not excluded for the page's sake): below it, it would be checking too little.
 */
export const MIN_COUNTED = 0.25

/** Straight RGBA, rows top to bottom, as the engine renders and `getImageData` reads. */
export interface Pixels {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** A rectangle of whole pixels from the top-left of a render. */
export interface PixelRect {
  left: number
  top: number
  right: number
  bottom: number
}

/** One annotation as compared: where it is in each render. */
export interface Compared {
  annotation: Annotation
  /** Its painted bounds grown by `GROW`, in pixels of the page it is on. */
  region: PixelRect
}

/** A page as one reader draws it, with the annotations and without them. */
export interface Reading {
  page: Pixels
  /** The page before any annotation was added, as the same reader draws it. */
  base: Pixels
}

export interface SavedPage {
  screen: Reading
  engine: Reading
  pdfjs: Reading
  transform: PageTransform
}

export interface SavedRenders {
  /** Each page rendered, by index. */
  pages: Map<number, SavedPage>
  /** Each annotation added, in order. */
  compared: Compared[]
  bytes: Uint8Array
  destroy(): void
}

const engineLoader = () => import('@inkbar/engine')

let engine: Promise<Engine> | undefined

/** One engine for the run, to render saved files with. */
function renderEngine(): Promise<Engine> {
  engine ??= engineLoader().then(({ createEngine }) => createEngine())
  return engine
}

/** Destroys the engine `renderSaved` rendered with, if it made one. */
export async function destroyRenderEngine(): Promise<void> {
  const made = engine
  engine = undefined
  if (made) await (await made).destroy()
}

function canvasPixels(canvas: HTMLCanvasElement | ImageBitmap): Pixels {
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(canvas, 0, 0)
  const data = ctx.getImageData(0, 0, out.width, out.height).data
  out.width = out.height = 0
  return { width: canvas.width, height: canvas.height, data }
}

/** Waits for the page canvas, every loupe's lens, the images in the overlay and the fonts. */
async function screenSettled(
  host: HTMLElement,
  mount: ReturnType<typeof createPageMount>
): Promise<void> {
  await mount.renderer.rendered
  await until(
    () =>
      [...host.querySelectorAll<HTMLCanvasElement>('canvas[data-ink-loupe]')].every(
        (c) => c.width > 0
      ),
    10_000
  )
  for (const img of host.querySelectorAll('image')) {
    const probe = new Image()
    probe.src = img.getAttribute('href') ?? ''
    await probe.decode().catch(() => undefined)
  }
  await document.fonts.ready
  for (let i = 0; i < 3; i++) await nextFrame()
}

/** The browser tests' frame (vitest.config.ts), put back after each photograph. */
const VIEWPORT = { width: 1280, height: 900 }

/** The page as the viewer shows it at `PIXELS_PER_POINT`, photographed. */
async function screenOf(doc: InkDocument, page: number): Promise<Pixels> {
  const info = doc.pages[page]!
  const transform = createPageTransform(info, PIXELS_PER_POINT / info.userUnit)
  // The page whole in the frame, so the photograph holds all of it.
  await browserPage.viewport(
    Math.ceil(transform.cssWidth) + 40,
    Math.ceil(transform.cssHeight) + 40
  )
  const host = mountContainer(transform.cssWidth, transform.cssHeight)
  host.style.background = '#ffffff'
  const mount = createPageMount({
    document: doc,
    page,
    host,
    transform,
    store: doc.annotations,
    devicePixelRatio: 1,
    formHighlight: false,
  })
  try {
    await screenSettled(host, mount)
    const base64 = await browserPage.screenshot({ element: host, save: false })
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const pixels = canvasPixels(bitmap)
    bitmap.close()
    return pixels
  } finally {
    mount.destroy()
    host.remove()
    await browserPage.viewport(VIEWPORT.width, VIEWPORT.height)
  }
}

/** A page as PDF.js draws it with every annotation the file holds. */
async function pdfjsOf(doc: InkDocument, page: number): Promise<Pixels> {
  const proxy = await doc._pdfjs.getPage(page)
  const viewport = proxy.getViewport({
    scale: PIXELS_PER_POINT / doc.pages[page]!.userUnit,
  })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  await proxy.render({
    canvas,
    viewport,
    background: '#ffffff',
    annotationMode: doc._pdfjs.module.AnnotationMode.ENABLE,
  }).promise
  const pixels = canvasPixels(canvas)
  canvas.width = canvas.height = 0
  return pixels
}

/** `r` in whole pixels of a render made with `t`, reaching every pixel it touches. */
export function pixelRect(r: Rect, t: PageTransform): PixelRect {
  const css = t.toCssRect(r)
  return {
    left: Math.floor(css.left),
    top: Math.floor(css.top),
    right: Math.ceil(css.left + css.width),
    bottom: Math.ceil(css.top + css.height),
  }
}

/**
 * Opens `fixture` as a browser host does, adds `inputs`, and renders each page they are on: on
 * screen, and from the saved file by the engine and by PDF.js. Each reader also draws the page
 * as it was opened, before any annotation was added.
 */
export async function renderSaved(
  fixture: FixtureName,
  inputs: readonly AnnotationInput[]
): Promise<SavedRenders> {
  const doc = await openDocument(fixtureUrl(fixture), {
    assets: browserAssets(),
    engine: engineLoader,
    pictures: savePictures(document),
  })
  let saved: InkDocument | undefined
  try {
    await doc.ready
    await doc._liftSettled
    const pageIndexes = [...new Set(inputs.map((a) => a.page))]
    const bases = new Map<number, Pixels>()
    for (const p of pageIndexes) bases.set(p, await screenOf(doc, p))
    const added = inputs.map((input) => doc.annotations.add(input))
    const screens = new Map<number, Reading>()
    for (const p of pageIndexes)
      screens.set(p, { page: await screenOf(doc, p), base: bases.get(p)! })

    const bytes = await doc.save()
    const opened = await doc.getData()
    const renderer = await renderEngine()
    const fileDoc = await renderer.open(bytes)
    const openedDoc = await renderer.open(opened)
    saved = await openDocument(bytes.slice(), { assets: browserAssets() })
    await saved.ready
    const pages = new Map<number, SavedPage>()
    try {
      for (const p of pageIndexes) {
        const info = doc.pages[p]!
        const options = { scale: PIXELS_PER_POINT, annotations: true }
        pages.set(p, {
          screen: screens.get(p)!,
          engine: {
            page: await fileDoc.renderPage(p, options),
            base: await openedDoc.renderPage(p, options),
          },
          pdfjs: { page: await pdfjsOf(saved, p), base: await pdfjsOf(doc, p) },
          transform: createPageTransform(info, PIXELS_PER_POINT / info.userUnit),
        })
      }
    } finally {
      await fileDoc.close()
      await openedDoc.close()
    }

    const compared = added.map((annotation): Compared => {
      const { transform } = pages.get(annotation.page)!
      const drawing = drawingFor(annotation, transform)
      if (!drawing) throw new Error(`${annotation.type} ${annotation.id} has no drawing`)
      return { annotation, region: pixelRect(padRect(drawing.bounds, GROW), transform) }
    })
    const done = saved
    return {
      pages,
      compared,
      bytes,
      destroy() {
        doc.destroy()
        done.destroy()
      },
    }
  } catch (error) {
    doc.destroy()
    saved?.destroy()
    throw error
  }
}

/** Whether pixel `i` of `a` and pixel `j` of `b` differ by more than the threshold in a channel. */
function apart(a: Pixels, i: number, b: Pixels, j: number): boolean {
  for (let c = 0; c < 3; c++)
    if (Math.abs(a.data[i + c]! - b.data[j + c]!) > CHANNEL_THRESHOLD) return true
  return false
}

/**
 * `share`: the part of `region`'s pixels, from 0 to 1, that differ between the two readers' pages by
 * more than `CHANNEL_THRESHOLD` in any channel. A pixel where the two already differ on the page
 * as it was opened is not counted: that is how each reader draws the page's own content (its
 * text above all), which saving does not change; `excluded` is the part left out so. Nor is a
 * pixel in `leaveOut` counted, which a caller checks another way. `counted` is the part of the
 * region the comparison did look at.
 */
export function differing(
  a: Reading,
  b: Reading,
  region: PixelRect,
  leaveOut: readonly PixelRect[] = []
): { share: number; excluded: number; counted: number } {
  for (const p of [a.base, b.base, b.page])
    if (p.width !== a.page.width || p.height !== a.page.height)
      throw new Error(
        `Renders differ in size: ${a.page.width}x${a.page.height} and ${p.width}x${p.height}`
      )
  const { width, height } = a.page
  const r = {
    left: Math.max(0, region.left),
    top: Math.max(0, region.top),
    right: Math.min(width, region.right),
    bottom: Math.min(height, region.bottom),
  }
  let total = 0
  let over = 0
  let excluded = 0
  let counted = 0
  for (let y = r.top; y < r.bottom; y++)
    for (let x = r.left; x < r.right; x++) {
      const i = (y * width + x) * 4
      total++
      if (leaveOut.some((o) => x >= o.left && x < o.right && y >= o.top && y < o.bottom))
        continue
      if (apart(a.base, i, b.base, i)) excluded++
      else {
        counted++
        if (apart(a.page, i, b.page, i)) over++
      }
    }
  // An empty region counts nothing, which the caller's floor on `counted` fails.
  return total === 0
    ? { share: 0, excluded: 0, counted: 0 }
    : { share: over / total, excluded: excluded / total, counted: counted / total }
}

type TextItem = Extract<DrawItem, { kind: 'text' }>

/** Where `a` and `b` overlap; a width or height of 0 or less for nowhere. */
function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return {
    x,
    y,
    width: Math.min(a.x + a.width, b.x + b.width) - x,
    height: Math.min(a.y + a.height, b.y + b.height) - y,
  }
}

function textItems(items: readonly DrawItem[]): TextItem[] {
  return items.flatMap((i) =>
    i.kind === 'text' ? [i] : i.kind === 'group' ? textItems(i.items) : []
  )
}

/** One line of an annotation's text: where it may ink, in pixels, and in what colour. */
export interface TextBand {
  text: string
  band: PixelRect
  color: string
}

/**
 * The lines of text `annotation` draws, each as the band its glyphs may ink: its line box (the
 * family's ascent and descent about the baseline, along its width) grown by a point, within the
 * text's clip. A line the clip hides is left out.
 */
export function textBands(annotation: Annotation, t: PageTransform): TextBand[] {
  const drawing = drawingFor(annotation, t)
  if (!drawing) return []
  return textItems(drawing.items).flatMap(({ clip: textClip, ...item }) =>
    item.lines.flatMap((line) => {
      const box = paintedRect({ ...item, lines: [line] })
      if (!box) return []
      const grown = padRect(box, 1)
      const clip = textClip?.rect
      const within = clip ? intersect(grown, clip) : grown
      if (!(within.width > 0 && within.height > 0)) return []
      return [{ text: line.text, band: pixelRect(within, t), color: item.color }]
    })
  )
}

/**
 * Pieces of a line whose start shows where the layout put it: each segment of a line with tabs
 * (from its tab stop), and the last word of a justified line (after every widened space). Upright
 * text only. Each band runs to its line's end from a piece's width before its start, so a piece
 * drawn early by up to its own width is measured where it is, but no further back than where the
 * piece before it ends, so that piece's ink is not taken for it.
 */
export function pieceBands(
  annotation: Annotation,
  t: PageTransform,
  measure: TextMeasure
): TextBand[] {
  const drawing = drawingFor(annotation, t)
  if (!drawing) return []
  return textItems(drawing.items).flatMap((item) => {
    if (item.angle !== 0) throw new Error('pieceBands takes upright text only')
    const { ascent, descent } = measure.vertical(item.font)
    const clip = item.clip?.rect
    const band = (
      x: number,
      y: number,
      width: number,
      before: number,
      end: number
    ): PixelRect => {
      const from = Math.max(x - width, before)
      const box = {
        x: from,
        y: y - descent * item.size,
        width: end - from,
        height: (ascent + descent) * item.size,
      }
      return pixelRect(clip ? intersect(box, clip) : box, t)
    }
    return item.lines.flatMap((line): TextBand[] => {
      const spacing = line.wordSpacing ?? 0
      const end =
        line.origin.x +
        line.width +
        [...line.text].filter((c) => c === ' ').length * spacing
      const gaps = (text: string) => [...text].filter((c) => c === ' ').length * spacing
      const segments = line.segments ?? []
      const pieces: TextBand[] = segments.slice(1).map((s, i) => {
        const previous = segments[i]!
        return {
          text: s.text,
          band: band(
            s.origin.x,
            s.origin.y,
            s.width + gaps(s.text),
            previous.origin.x + previous.width + gaps(previous.text),
            end
          ),
          color: item.color,
        }
      })
      if (spacing > 0 && !line.segments) {
        const cut = line.text.lastIndexOf(' ')
        const before = line.text.slice(0, cut + 1)
        const last = line.text.slice(cut + 1)
        const x =
          line.origin.x + measure.width(before, item.font, item.size).width + gaps(before)
        // The word before ends where the last space, widened, begins.
        const previousEnd = x - measure.width(' ', item.font, item.size).width - spacing
        pieces.push({
          text: last,
          band: band(
            x,
            line.origin.y,
            measure.width(last, item.font, item.size).width,
            previousEnd,
            end
          ),
          color: item.color,
        })
      }
      return pieces
    })
  })
}

/**
 * For each clipped text of `annotation`: the box its lines would ink with no clip (`around`) and
 * the clip (`inside`). Ink of the text's colour in the one and not the other means the clip was
 * lost.
 */
export function beyondClip(
  annotation: Annotation,
  t: PageTransform
): { around: PixelRect; inside: PixelRect; color: string }[] {
  const drawing = drawingFor(annotation, t)
  if (!drawing) return []
  return textItems(drawing.items).flatMap(({ clip, ...item }) => {
    const box = clip && paintedRect(item)
    return box
      ? [
          {
            around: pixelRect(box, t),
            inside: pixelRect(clip.rect, t),
            color: item.color,
          },
        ]
      : []
  })
}

/** How many pixels in `around` but not `inside` are near `color` and were not on the page as opened. */
export function inkOutside(
  reading: Reading,
  around: PixelRect,
  inside: PixelRect,
  color: string
): number {
  const near = nearColor(color)
  const { page, base } = reading
  let n = 0
  for (let y = Math.max(0, around.top); y < Math.min(page.height, around.bottom); y++)
    for (let x = Math.max(0, around.left); x < Math.min(page.width, around.right); x++) {
      if (x >= inside.left && x < inside.right && y >= inside.top && y < inside.bottom)
        continue
      const i = (y * page.width + x) * 4
      if (near(page, i) && !near(base, i)) n++
    }
  return n
}

/** Whether a pixel is within 100 of `hex` in every channel. */
const nearColor = (hex: string) => {
  const [r, g, b] = rgbOf(hex)
  return (p: Pixels, i: number) =>
    Math.max(
      Math.abs(p.data[i]! - r),
      Math.abs(p.data[i + 1]! - g),
      Math.abs(p.data[i + 2]! - b)
    ) < 100
}

const rgbOf = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) throw new Error(`Not a #rrggbb colour: ${hex}`)
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)]
}

/**
 * Where a reader inks a line of text: the box of the pixels in `band` near the text's colour that
 * were not so on the page as opened (the page's own text is not the line's).
 */
export function lineInk(reading: Reading, line: TextBand): PixelRect | undefined {
  const near = nearColor(line.color)
  const { page, base } = reading
  let box: PixelRect | undefined
  const { band } = line
  for (let y = Math.max(0, band.top); y < Math.min(page.height, band.bottom); y++)
    for (let x = Math.max(0, band.left); x < Math.min(page.width, band.right); x++) {
      const i = (y * page.width + x) * 4
      if (!near(page, i) || near(base, i)) continue
      if (!box) box = { left: x, top: y, right: x + 1, bottom: y + 1 }
      else {
        box.left = Math.min(box.left, x)
        box.top = Math.min(box.top, y)
        box.right = Math.max(box.right, x + 1)
        box.bottom = Math.max(box.bottom, y + 1)
      }
    }
  return box
}

/** The box of the pixels in `region` for which `ink` holds, or undefined for none. */
export function inkBox(
  pixels: Pixels,
  region: PixelRect,
  ink: (r: number, g: number, b: number) => boolean
): PixelRect | undefined {
  let box: PixelRect | undefined
  for (let y = Math.max(0, region.top); y < Math.min(pixels.height, region.bottom); y++)
    for (
      let x = Math.max(0, region.left);
      x < Math.min(pixels.width, region.right);
      x++
    ) {
      const i = (y * pixels.width + x) * 4
      if (!ink(pixels.data[i]!, pixels.data[i + 1]!, pixels.data[i + 2]!)) continue
      if (!box) box = { left: x, top: y, right: x + 1, bottom: y + 1 }
      else {
        box.left = Math.min(box.left, x)
        box.top = Math.min(box.top, y)
        box.right = Math.max(box.right, x + 1)
        box.bottom = Math.max(box.bottom, y + 1)
      }
    }
  return box
}

/** Pixels as a PNG data URL, for looking at a comparison that failed. */
export function pngDataUrl(pixels: Pixels, region?: PixelRect): string {
  const r = region ?? { left: 0, top: 0, right: pixels.width, bottom: pixels.height }
  const canvas = document.createElement('canvas')
  canvas.width = pixels.width
  canvas.height = pixels.height
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
    0,
    0
  )
  const out = document.createElement('canvas')
  out.width = Math.max(1, r.right - r.left)
  out.height = Math.max(1, r.bottom - r.top)
  out.getContext('2d')!.drawImage(canvas, -r.left, -r.top)
  return out.toDataURL('image/png')
}
