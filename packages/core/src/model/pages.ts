import type { Rect } from './geometry'
import type { PdfjsPage } from '../pdfjs/types'

export type PageRotation = 0 | 90 | 180 | 270

export interface PageInfo {
  index: number
  /** CropBox ∩ MediaBox in user space before /Rotate, as PDF.js reports `page.view`. */
  box: Rect
  /** The page's own /Rotate. View rotation applied by the viewer is separate. */
  rotate: PageRotation
  userUnit: number
  /** Unrotated box width in points. */
  width: number
  /** Unrotated box height in points. */
  height: number
}

export function pageInfoFromProxy(page: PdfjsPage, index: number): PageInfo {
  const [x1, y1, x2, y2] = page.view as [number, number, number, number]
  const box: Rect = {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
  return {
    index,
    box,
    rotate: normaliseRotation(page.rotate),
    userUnit: page.userUnit > 0 ? page.userUnit : 1,
    width: box.width,
    height: box.height,
  }
}

/** PDF.js already rejects /Rotate values that are not multiples of 90; this also folds negatives. */
function normaliseRotation(rotate: number): PageRotation {
  const r = (((Math.round(rotate / 90) * 90) % 360) + 360) % 360
  return r as PageRotation
}
