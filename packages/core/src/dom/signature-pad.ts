// Making signature templates in the browser: a pad to draw one, a name typed in a handwriting
// font, or an image file. The pad samples like the `draw` tool (coalesced events, pen and touch
// pressure) and paints with its renderer, so a drawn signature looks the same placed.
import { readonly, writable, type Readable } from '../model/readable'
import {
  createImageTemplate,
  createInkTemplate,
  type SignatureTemplate,
} from '../model/signatures'

import { outlinePath, strokeOutline } from './ink-stroke'
import { pressureOf, reportsPressure } from './tools/freehand'

import type { Point } from '../model/geometry'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** The pad's stroke width, CSS px. */
const PAD_STROKE = 3

export interface SignaturePad {
  /** The drawing surface, `svg.ink-signature-pad`, filling the host. */
  readonly element: SVGSVGElement
  /** True while nothing is drawn. */
  readonly empty: Readable<boolean>
  clear(): void
  /** The drawing as an ink template with a new id; undefined while the pad is empty. */
  toTemplate(): SignatureTemplate | undefined
  destroy(): void
}

interface PadStroke {
  points: Point[]
  pressure: number[]
  path: SVGPathElement
}

/**
 * A drawing pad in `host`. Each press-drag-release is a stroke; the theme colours it through
 * `path.ink-stroke` (`fill: currentColor` by default).
 */
export function createSignaturePad(host: HTMLElement): SignaturePad {
  const doc = host.ownerDocument
  const svg = doc.createElementNS(SVG_NS, 'svg')
  svg.classList.add('ink-signature-pad')
  svg.dataset.inkSignaturePad = ''
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  svg.setAttribute('aria-hidden', 'true')
  // Structural: the pad owns its touches, so a finger draws instead of scrolling.
  svg.style.touchAction = 'none'
  svg.style.display = 'block'
  host.append(svg)

  const strokes: PadStroke[] = []
  const empty = writable(true)
  let live: { id: number; stroke: PadStroke } | undefined

  const at = (e: PointerEvent): Point => {
    const r = svg.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const paint = (s: PadStroke): void => {
    const pressure = reportsPressure(s.pressure) ? s.pressure : undefined
    s.path.setAttribute('d', outlinePath(strokeOutline(s.points, pressure, PAD_STROKE)))
  }
  const sample = (s: PadStroke, e: PointerEvent): void => {
    s.points.push(at(e))
    s.pressure.push(pressureOf(e) ?? 0.5)
  }

  const onDown = (e: PointerEvent): void => {
    if (!e.isPrimary || e.button !== 0 || live) return
    e.preventDefault()
    const path = doc.createElementNS(SVG_NS, 'path')
    path.classList.add('ink-stroke')
    svg.append(path)
    const stroke: PadStroke = { points: [], pressure: [], path }
    sample(stroke, e)
    paint(stroke)
    live = { id: e.pointerId, stroke }
    try {
      svg.setPointerCapture(e.pointerId)
    } catch {
      // A synthetic pointer: the stroke still works while it stays over the pad.
    }
  }
  const onMove = (e: PointerEvent): void => {
    if (!live || e.pointerId !== live.id) return
    if (e.buttons === 0) {
      finish()
      return
    }
    const coalesced = e.getCoalescedEvents?.() ?? []
    for (const ev of coalesced.length > 0 ? coalesced : [e]) sample(live.stroke, ev)
    paint(live.stroke)
  }
  const finish = (e?: PointerEvent): void => {
    if (!live) return
    const s = live.stroke
    live = undefined
    const last = s.points[s.points.length - 1]!
    const end = e ? at(e) : last
    // A release reports no pressure: it repeats the last sample's.
    if (end.x !== last.x || end.y !== last.y) {
      s.points.push(end)
      s.pressure.push(s.pressure[s.pressure.length - 1]!)
    }
    paint(s)
    strokes.push(s)
    empty.set(false)
  }
  const onUp = (e: PointerEvent): void => {
    if (live && e.pointerId === live.id) finish(e)
  }
  const onCancel = (e: PointerEvent): void => {
    if (!live || e.pointerId !== live.id) return
    live.stroke.path.remove()
    live = undefined
  }
  /** Capture gone mid-stroke: keep what was drawn, as a touch sends no move to end it. */
  const onLostCapture = (e: PointerEvent): void => {
    if (live && e.pointerId === live.id) finish()
  }
  svg.addEventListener('pointerdown', onDown)
  svg.addEventListener('pointermove', onMove)
  svg.addEventListener('pointerup', onUp)
  svg.addEventListener('pointercancel', onCancel)
  svg.addEventListener('lostpointercapture', onLostCapture)

  return {
    element: svg,
    empty: readonly(empty),
    clear() {
      live?.stroke.path.remove()
      live = undefined
      for (const s of strokes.splice(0)) s.path.remove()
      empty.set(true)
    },
    toTemplate() {
      if (strokes.length === 0) return undefined
      // CSS y grows downwards; a template's grows upwards.
      const inklist = strokes.map((s) => s.points.map((p) => ({ x: p.x, y: -p.y })))
      const pressured = strokes.some((s) => reportsPressure(s.pressure))
      return createInkTemplate(
        inklist,
        pressured ? strokes.map((s) => [...s.pressure]) : undefined
      )
    },
    destroy() {
      svg.removeEventListener('pointerdown', onDown)
      svg.removeEventListener('pointermove', onMove)
      svg.removeEventListener('pointerup', onUp)
      svg.removeEventListener('pointercancel', onCancel)
      svg.removeEventListener('lostpointercapture', onLostCapture)
      svg.remove()
    },
  }
}

/** CSS generic families, which a font shorthand must not quote. */
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
])

/** `font` as a CSS font-family value: quoted unless it is a generic family. */
export function fontFamilyValue(font: string): string {
  return GENERIC_FAMILIES.has(font) ? font : `"${font.replace(/["\\]/g, '\\$&')}"`
}

export interface TypedSignatureOptions {
  /** The image's height in pixels. Default 96. */
  height?: number
  /** The ink colour. Default `#151820`, the theme's ink. */
  color?: string
}

interface Rendered {
  url: string
  width: number
  height: number
}

async function drawTyped(
  name: string,
  font: string,
  opts: TypedSignatureOptions = {}
): Promise<Rendered> {
  const text = name.trim()
  if (text === '') throw new RangeError('A typed signature needs a name')
  const height = opts.height ?? 96
  const size = height * 0.625
  const margin = height / 8
  const shorthand = `${size}px ${fontFamilyValue(font)}`
  try {
    // Draws in the fallback font if the face never arrives.
    await document.fonts.load(shorthand, text)
  } catch {
    // Unavailable: the canvas uses the fallback.
  }
  const canvas = document.createElement('canvas')
  const measure = canvas.getContext('2d')
  if (!measure) throw new Error('Canvas 2D is unavailable')
  measure.font = shorthand
  const m = measure.measureText(text)
  const left = m.actualBoundingBoxLeft
  const width = Math.ceil(left + m.actualBoundingBoxRight + margin * 2)
  canvas.width = width
  canvas.height = height
  // Resizing a canvas resets its state.
  const ctx = canvas.getContext('2d')!
  ctx.font = shorthand
  ctx.fillStyle = opts.color ?? '#151820'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, margin + left, height / 2)
  return { url: canvas.toDataURL('image/png'), width, height }
}

/**
 * `name` drawn in `font` on a transparent canvas, as a PNG data URL. Waits for the font to load
 * (`document.fonts.load`) first. Rejects with a RangeError for an empty name.
 */
export async function renderTypedSignature(
  name: string,
  font: string,
  opts?: TypedSignatureOptions
): Promise<string> {
  return (await drawTyped(name, font, opts)).url
}

/** A typed signature as an image template, with a new id. */
export async function createTypedSignature(
  name: string,
  font: string,
  opts?: TypedSignatureOptions
): Promise<SignatureTemplate> {
  const r = await drawTyped(name, font, opts)
  return createImageTemplate(r.url, r.width / r.height)
}

/** The image types a signature image may be. */
export const SIGNATURE_IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg']

/** The longest side, in pixels, an image signature is stored at. */
export const SIGNATURE_IMAGE_MAX_SIDE = 1000

/**
 * The longest data URL, in characters, an image signature may be once scaled. Templates live
 * in host storage (`localStorage` holds about 5 MB) and are copied into every placed stamp.
 */
export const SIGNATURE_IMAGE_MAX_LENGTH = 3_000_000

/**
 * An image file (a scan of a signature) as an image template. The image is drawn again at no
 * more than `SIGNATURE_IMAGE_MAX_SIDE` pixels on its long side, as a PNG (a JPEG stays a JPEG,
 * as photos compress far better that way), so a phone photo does not fill the store. Rejects
 * with a TypeError for anything but a PNG or JPEG, and a RangeError when the result is still
 * longer than `SIGNATURE_IMAGE_MAX_LENGTH`.
 */
export async function createImageSignature(file: Blob): Promise<SignatureTemplate> {
  if (!SIGNATURE_IMAGE_TYPES.includes(file.type))
    throw new TypeError('A signature image must be a PNG or JPEG')
  const source = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = source
    try {
      await img.decode()
    } catch {
      throw new TypeError('The image could not be read')
    }
    const { naturalWidth: w, naturalHeight: h } = img
    if (w === 0 || h === 0) throw new TypeError('The image is empty')
    const scale = Math.min(1, SIGNATURE_IMAGE_MAX_SIDE / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is unavailable')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const url =
      file.type === 'image/jpeg'
        ? canvas.toDataURL('image/jpeg', 0.9)
        : canvas.toDataURL('image/png')
    if (url.length > SIGNATURE_IMAGE_MAX_LENGTH)
      throw new RangeError('The signature image is too large')
    return createImageTemplate(url, canvas.width / canvas.height)
  } finally {
    URL.revokeObjectURL(source)
  }
}

/** The preview's height in its own units; the width follows the template's aspect. */
const PREVIEW_HEIGHT = 100
const PREVIEW_STROKE = 4

/**
 * An ink template drawn for a menu: one filled outline per stroke (the `draw` renderer) in a
 * `viewBox` of the template's aspect, with room for the stroke. Paint `paths` with
 * `fill: currentColor`.
 */
export function signaturePreview(t: SignatureTemplate & { kind: 'ink' }): {
  viewBox: string
  paths: string[]
} {
  const h = PREVIEW_HEIGHT
  const w = h * t.aspect
  const pad = PREVIEW_STROKE
  const paths = t.inklist.map((stroke, i) =>
    outlinePath(
      strokeOutline(
        stroke.map((p) => ({ x: p.x * w, y: (1 - p.y) * h })),
        t.pressure?.[i],
        PREVIEW_STROKE
      )
    )
  )
  const r = (n: number): number => Math.round(n * 100) / 100
  return { viewBox: `${-pad} ${-pad} ${r(w + pad * 2)} ${r(h + pad * 2)}`, paths }
}
