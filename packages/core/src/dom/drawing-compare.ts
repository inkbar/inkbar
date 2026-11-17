import { page as browserPage } from 'vitest/browser'

import { staticDefaults } from '../model/annotations/defaults'
import { createAnnotationStore } from '../model/annotations/store'

import { annotationBox, renderAnnotationContent } from './overlay-render'
import { renderReferenceContent } from './reference-render'
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
  style.textContent = themeCss
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
  const mount = (): { clip: HTMLElement; layer: HTMLElement } => {
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
    const { clip: reference, layer: referenceEl } = mount()
    const { clip: painted, layer: paintedEl } = mount()
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

function compare(
  a: ImageData,
  b: ImageData
): Pick<CompareResult, 'differing' | 'differingPixels' | 'referenceInk'> {
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
  return {
    differing: either === 0 ? 0 : differingPixels / either,
    differingPixels,
    referenceInk,
  }
}
