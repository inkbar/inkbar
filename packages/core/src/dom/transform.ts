import {
  applyMatrix,
  invertMatrix,
  type Matrix,
  type Point,
  type Quad,
  type Rect,
} from '../model/geometry'

import type { PageInfo } from '../model/pages'

export type ViewRotation = 0 | 90 | 180 | 270

/** CSS box: `left`,`top` from the rendered page's top-left corner, in CSS pixels. */
export interface CssRect {
  left: number
  top: number
  width: number
  height: number
}

export interface PageTransform {
  readonly page: PageInfo
  readonly zoom: number
  /** Rotation the viewer applied on top of the page's own /Rotate. */
  readonly rotation: ViewRotation
  /** The page's /Rotate plus the viewer rotation. */
  readonly totalRotation: ViewRotation
  /** Rendered page width in CSS pixels at this zoom and total rotation. */
  readonly cssWidth: number
  /** Rendered page height in CSS pixels at this zoom and total rotation. */
  readonly cssHeight: number
  /** User space to CSS pixels. Same matrix PDF.js builds for `getViewport`. */
  readonly matrix: Matrix
  toCss(p: Point): Point
  toCssRect(r: Rect): CssRect
  toCssQuad(q: Quad): Quad
  /** Converts a length in user-space units (stroke width, font size) to CSS pixels: zoom times `/UserUnit`. */
  toCssLength(points: number): number
  fromCss(p: Point): Point
  fromCssRect(r: CssRect): Rect
  /** Converts a length in CSS pixels to user-space units. */
  fromCssLength(px: number): number
}

/** Folds any integer multiple of 90 onto 0, 90, 180 or 270. Throws `RangeError` otherwise. */
export function normalizeRotation(deg: number): ViewRotation {
  if (!Number.isFinite(deg) || deg % 90 !== 0) {
    throw new RangeError(`rotation must be a multiple of 90, got ${deg}`)
  }
  return (((deg % 360) + 360) % 360) as ViewRotation
}

/**
 * Port of PDF.js `PageViewport` (display/page_viewport.js) with offsetX = offsetY = 0 and
 * dontFlip = false. Using the same maths keeps the canvas, text layer and overlay aligned.
 */
export function createPageTransform(
  page: PageInfo,
  zoom: number,
  viewRotation: ViewRotation = 0
): PageTransform {
  const rotation = normalizeRotation(viewRotation)
  const totalRotation = normalizeRotation(page.rotate + rotation)
  // PDF.js PageViewport does `scale *= userUnit`; zoom 1 is one user-space unit, so 1 point only when userUnit is 1.
  const scale = zoom * page.userUnit
  const x0 = page.box.x
  const y0 = page.box.y
  const x1 = page.box.x + page.box.width
  const y1 = page.box.y + page.box.height
  const centerX = (x1 + x0) / 2
  const centerY = (y1 + y0) / 2
  let rotateA: number
  let rotateB: number
  let rotateC: number
  let rotateD: number
  switch (totalRotation) {
    case 180:
      rotateA = -1
      rotateB = 0
      rotateC = 0
      rotateD = 1
      break
    case 90:
      rotateA = 0
      rotateB = 1
      rotateC = 1
      rotateD = 0
      break
    case 270:
      rotateA = 0
      rotateB = -1
      rotateC = -1
      rotateD = 0
      break
    default:
      rotateA = 1
      rotateB = 0
      rotateC = 0
      rotateD = -1
  }
  let offsetCanvasX: number
  let offsetCanvasY: number
  let cssWidth: number
  let cssHeight: number
  if (rotateA === 0) {
    offsetCanvasX = Math.abs(centerY - y0) * scale
    offsetCanvasY = Math.abs(centerX - x0) * scale
    cssWidth = Math.abs(y1 - y0) * scale
    cssHeight = Math.abs(x1 - x0) * scale
  } else {
    offsetCanvasX = Math.abs(centerX - x0) * scale
    offsetCanvasY = Math.abs(centerY - y0) * scale
    cssWidth = Math.abs(x1 - x0) * scale
    cssHeight = Math.abs(y1 - y0) * scale
  }
  const matrix: Matrix = [
    rotateA * scale,
    rotateB * scale,
    rotateC * scale,
    rotateD * scale,
    offsetCanvasX - rotateA * scale * centerX - rotateC * scale * centerY,
    offsetCanvasY - rotateB * scale * centerX - rotateD * scale * centerY,
  ]
  const inverse = invertMatrix(matrix)
  const toCss = (p: Point): Point => applyMatrix(matrix, p)
  const fromCss = (p: Point): Point => applyMatrix(inverse, p)

  const bounds = (
    points: Point[]
  ): { x: number; y: number; width: number; height: number } => {
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
  }

  return {
    page,
    zoom,
    rotation,
    totalRotation,
    cssWidth,
    cssHeight,
    matrix,
    toCss,
    fromCss,
    toCssRect(r) {
      const b = bounds([
        toCss({ x: r.x, y: r.y }),
        toCss({ x: r.x + r.width, y: r.y }),
        toCss({ x: r.x, y: r.y + r.height }),
        toCss({ x: r.x + r.width, y: r.y + r.height }),
      ])
      return { left: b.x, top: b.y, width: b.width, height: b.height }
    },
    toCssQuad(q) {
      return { p1: toCss(q.p1), p2: toCss(q.p2), p3: toCss(q.p3), p4: toCss(q.p4) }
    },
    toCssLength: (points) => points * scale,
    fromCssRect(r) {
      return bounds([
        fromCss({ x: r.left, y: r.top }),
        fromCss({ x: r.left + r.width, y: r.top }),
        fromCss({ x: r.left, y: r.top + r.height }),
        fromCss({ x: r.left + r.width, y: r.top + r.height }),
      ])
    },
    fromCssLength: (px) => px / scale,
  }
}
