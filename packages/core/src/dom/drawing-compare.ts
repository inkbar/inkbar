import { page as browserPage } from 'vitest/browser'

import { staticDefaults } from '../model/annotations/defaults'
import { createAnnotationStore } from '../model/annotations/store'

import { annotationBox, renderAnnotationContent } from './overlay-render'
import { renderReferenceContent } from './reference-render'
import { FONT_STACKS } from './text-fonts'
import { createPageTransform } from './transform'

import type { PageTransform } from './transform'
import type { Annotation, AnnotationInput } from '../model/annotations/types'
import type { Rect } from '../model/geometry'
import type { PageInfo } from '../model/pages'

export interface CompareCase {
  name: string
  annotation: AnnotationInput
  /** The view rotation the viewer applies on top of the page's own; 0 when absent. */
  rotate?: 0 | 90
  /** The page's own /Rotate (`PageInfo.rotate`), not the view's; 0 when absent. */
  pageRotate?: 0 | 90
  zoom?: 1 | 2 | 0.5 | 4
  box?: Rect
  userUnit?: number
  /**
   * What each capture covers: the annotation's on-screen box grown by 16 CSS px and clamped to
   * the page (the default), or the whole page.
   */
  region?: 'annotation' | 'page'
}

/**
 * The display rules the theme had for a text box's HTML, which the reference renderer's output
 * still needs: the theme no longer carries them, since the box is drawn from its annotation. They
 * apply to the reference side only, so the painted side is compared without them. The font is the
 * painted side's own stack, not the `Helvetica` the theme named: where that is another face (a
 * Mac's own Helvetica, a Linux machine's Nimbus Sans) the letter shapes differ whatever the
 * layout does, which is a listed change, and would hide the comparison of the layout itself. The
 * cases that use it are all Helvetica.
 */
const REFERENCE_TEXT_CSS = `
:where([data-compare-side='reference'] .ink-free-text) {
  box-sizing: border-box; width: 100%; height: 100%; overflow: hidden;
  font-family: ${FONT_STACKS.Helvetica};
  font-size: var(--ink-font-size); font-weight: var(--ink-font-weight, normal);
  font-style: var(--ink-font-style, normal); text-decoration: var(--ink-text-decoration, none);
  line-height: 1.2; color: var(--ink-text-color, #151820);
  background: var(--ink-fill, transparent); border-radius: var(--ink-corner-radius, 0);
  opacity: var(--ink-opacity, 1); overflow-wrap: break-word; white-space: pre-wrap;
}
:where([data-compare-side='reference'] .ink-free-text[data-border]) {
  border: var(--ink-border-width, 1px) solid var(--ink-box-border, #151820);
}
:where([data-compare-side='reference'] .ink-free-text[data-border='dashed']) { border-style: dashed; }
:where([data-compare-side='reference'] .ink-free-text[data-bubble]) { padding: 0.4em 0.6em; }
:where([data-compare-side='reference'] .ink-free-text[data-align='left']) { text-align: left; }
:where([data-compare-side='reference'] .ink-free-text[data-align='center']) { text-align: center; }
:where([data-compare-side='reference'] .ink-free-text[data-align='right']) { text-align: right; }
:where([data-compare-side='reference'] .ink-free-text[data-align='justify']) { text-align: justify; }
`

/** CSS px a capture of the `'annotation'` region reaches past the annotation's box. */
const MARGIN = 16
/** The test viewport's size (vitest.config.ts), restored after a capture that needed more. */
const VIEWPORT = { width: 1280, height: 900 }

/** A channel difference above this counts as a different pixel. */
const TOLERANCE = 16
/** The colour behind both renderings. */
const BACKGROUND = 255

export interface CompareResult {
  /** `differingPixels` over the pixels that are not background in either image; 0 when there are none. */
  differing: number
  /** Pixels that differ by more than 16 in any channel. */
  differingPixels: number
  /**
   * `differing` after both images are blurred over 3 x 3 pixels. Text drawn as HTML and as SVG
   * differs in anti-aliasing and in where a glyph falls inside a pixel, which the exact count
   * reads as a difference in most of its pixels, so this is the measure for text.
   */
  differingBlurred: number
  /** Pixels of the reference image that are not background. */
  referenceInk: number
  /** The captured region of each side, in viewport px. */
  referenceBox: DOMRect
  paintedBox: DOMRect
}

/**
 * Paints the case with the reference renderer and with `renderAnnotationContent` (the new
 * painter for a type that has a drawing, the reference renderer again for one that has not),
 * screenshots both, and compares them. `paintedSide` replaces the second rendering; tests use
 * it, and `referenceSide`, to prove the comparison sees a difference or refuses a blank one.
 * Throws when the reference image is blank, so a failed capture can never read as "no difference".
 */
export async function comparePaint(
  c: CompareCase,
  paintedSide: (
    el: HTMLElement,
    a: Annotation,
    t: PageTransform
  ) => void = renderAnnotationContent,
  referenceSide: (
    el: HTMLElement,
    a: Annotation,
    t: PageTransform
  ) => void = renderReferenceContent
): Promise<CompareResult> {
  const { default: themeCss } = await import('@inkbar/theme/theme.css?inline')
  const box = c.box ?? { x: 0, y: 0, width: 612, height: 792 }
  const info: PageInfo = {
    index: 0,
    box,
    rotate: c.pageRotate ?? 0,
    userUnit: c.userUnit ?? 1,
    width: box.width,
    height: box.height,
  }
  const t = createPageTransform(info, c.zoom ?? 1, c.rotate ?? 0)
  const store = createAnnotationStore({
    mode: { mode: 'uncontrolled' },
    defaults: staticDefaults,
  })
  const a = store.add(c.annotation)

  const style = document.createElement('style')
  style.textContent = themeCss + REFERENCE_TEXT_CSS
  const stage = document.createElement('div')
  // Both holders sit at the same spot and are captured one at a time: beside each other, a
  // page wider than half the viewport has its second half captured blank.
  stage.style.cssText = 'position:absolute;left:0;top:0;background:#fff;'
  const cssWidth = Math.ceil(t.cssWidth)
  const cssHeight = Math.ceil(t.cssHeight)
  const at = annotationBox(a, t)
  // The part of the page each capture covers, in page CSS px, on whole pixels.
  const left = c.region === 'page' ? 0 : Math.max(0, Math.floor(at.left - MARGIN))
  const top = c.region === 'page' ? 0 : Math.max(0, Math.floor(at.top - MARGIN))
  const region = {
    left,
    top,
    width:
      (c.region === 'page'
        ? cssWidth
        : Math.min(cssWidth, Math.ceil(at.left + at.width + MARGIN))) - left,
    height:
      (c.region === 'page'
        ? cssHeight
        : Math.min(cssHeight, Math.ceil(at.top + at.height + MARGIN))) - top,
  }
  const mount = (
    side: 'reference' | 'painted'
  ): { clip: HTMLElement; layer: HTMLElement } => {
    // The clip is what is captured: the region at the viewport's top-left, with the page
    // shifted behind it, so neither side depends on scrolling.
    const clip = document.createElement('div')
    clip.style.cssText = `position:absolute;left:0;top:0;overflow:hidden;background:#fff;width:${region.width}px;height:${region.height}px;`
    // Whole CSS pixels, so both holders sit at integer offsets and antialias the same way.
    const holder = document.createElement('div')
    holder.style.cssText = `position:absolute;left:${-region.left}px;top:${-region.top}px;background:#fff;width:${cssWidth}px;height:${cssHeight}px;`
    // What the real overlay puts on an annotation element, which theme rules select on.
    const layer = document.createElement('div')
    layer.className = 'ink-annotation'
    layer.dataset.annotation = a.id
    layer.dataset.type = a.type
    layer.dataset.source = a.source
    layer.dataset.state = 'idle'
    layer.dataset.compareSide = side
    layer.setAttribute('role', 'button')
    layer.style.cssText = `position:absolute;pointer-events:none;left:${at.left}px;top:${at.top}px;width:${at.width}px;height:${at.height}px;`
    holder.append(layer)
    clip.append(holder)
    stage.append(clip)
    return { clip, layer }
  }
  document.head.append(style)
  document.body.append(stage)
  let resized = false
  try {
    const { clip: reference, layer: referenceEl } = mount('reference')
    const { clip: painted, layer: paintedEl } = mount('painted')
    referenceSide(referenceEl, a, t)
    paintedSide(paintedEl, a, t)
    // The capture must lie wholly inside the viewport: what lies beyond it comes back blank.
    // Grow the viewport to fit, and refuse a region that still does not.
    if (region.width > window.innerWidth || region.height > window.innerHeight) {
      await browserPage.viewport(
        Math.max(VIEWPORT.width, region.width),
        Math.max(VIEWPORT.height, region.height)
      )
      resized = true
    }
    await ready(reference)
    await ready(painted)
    const referenceBox = reference.getBoundingClientRect()
    const paintedBox = painted.getBoundingClientRect()
    for (const r of [referenceBox, paintedBox]) {
      if (
        r.left < 0 ||
        r.top < 0 ||
        r.right > window.innerWidth ||
        r.bottom > window.innerHeight
      ) {
        throw new Error(
          `comparePaint: the region for "${c.name}" (${r.width}x${r.height}) is not inside the viewport (${window.innerWidth}x${window.innerHeight})`
        )
      }
    }
    painted.style.visibility = 'hidden'
    const one = await shoot(reference)
    painted.style.visibility = ''
    reference.style.visibility = 'hidden'
    const two = await shoot(painted)
    const result = compare(one, two)
    if (result.referenceInk === 0) {
      throw new Error(`comparePaint: the reference image for "${c.name}" is blank`)
    }
    return { ...result, referenceBox, paintedBox }
  } finally {
    stage.remove()
    style.remove()
    if (resized) await browserPage.viewport(VIEWPORT.width, VIEWPORT.height)
  }
}

/**
 * Waits until what `holder` shows has settled: its images decoded (HTML and SVG), fonts loaded,
 * and two frames painted, so a late image or font cannot differ between the two captures.
 */
async function ready(holder: HTMLElement): Promise<void> {
  const images = [
    ...holder.querySelectorAll<SVGImageElement | HTMLImageElement>('img, image'),
  ]
  await Promise.all(
    images.map(async (img) => {
      if (img instanceof HTMLImageElement) {
        if (typeof img.decode === 'function') await img.decode().catch(() => undefined)
        else if (!img.complete) {
          await new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true })
            img.addEventListener('error', resolve, { once: true })
          })
        }
        return
      }
      // An SVG <image> has no decode(): load its href through an <img>.
      const href = img.getAttribute('href') ?? img.getAttribute('xlink:href')
      if (!href) return
      const probe = new Image()
      probe.src = href
      await probe.decode().catch(() => undefined)
    })
  )
  await document.fonts.ready
  for (let i = 0; i < 2; i++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

/** The element's pixels. `save: false` keeps the PNG out of the file system. */
async function shoot(element: HTMLElement): Promise<ImageData> {
  const base64 = await browserPage.screenshot({ element, save: false })
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

const isInk = (d: Uint8ClampedArray, i: number): boolean =>
  [0, 1, 2].some((k) => Math.abs(d[i + k]! - BACKGROUND) > TOLERANCE)

/** `image` with each channel averaged over the 3 x 3 pixels around it (edges clamped). */
function blur(image: ImageData): Uint8ClampedArray {
  const { width, height, data } = image
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 4; k++) {
        let sum = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const yy = Math.min(height - 1, Math.max(0, y + dy))
            const xx = Math.min(width - 1, Math.max(0, x + dx))
            sum += data[(yy * width + xx) * 4 + k]!
          }
        }
        out[(y * width + x) * 4 + k] = Math.round(sum / 9)
      }
    }
  }
  return out
}

function compare(
  a: ImageData,
  b: ImageData
): Pick<
  CompareResult,
  'differing' | 'differingPixels' | 'differingBlurred' | 'referenceInk'
> {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `comparePaint: the images differ in size (${a.width}x${a.height} and ${b.width}x${b.height})`
    )
  }
  let referenceInk = 0
  let either = 0
  let differingPixels = 0
  for (let i = 0; i < a.data.length; i += 4) {
    const inkA = isInk(a.data, i)
    const inkB = isInk(b.data, i)
    if (inkA) referenceInk++
    if (inkA || inkB) either++
    for (let k = 0; k < 4; k++) {
      if (Math.abs(a.data[i + k]! - b.data[i + k]!) > TOLERANCE) {
        differingPixels++
        break
      }
    }
  }
  const blurredA = blur(a)
  const blurredB = blur(b)
  let blurredEither = 0
  let blurredDiffering = 0
  for (let i = 0; i < blurredA.length; i += 4) {
    const inkA = isInk(blurredA, i)
    const inkB = isInk(blurredB, i)
    if (inkA || inkB) blurredEither++
    for (let k = 0; k < 4; k++) {
      if (Math.abs(blurredA[i + k]! - blurredB[i + k]!) > TOLERANCE) {
        blurredDiffering++
        break
      }
    }
  }
  return {
    differing: either === 0 ? 0 : differingPixels / either,
    differingPixels,
    differingBlurred: blurredEither === 0 ? 0 : blurredDiffering / blurredEither,
    referenceInk,
  }
}
