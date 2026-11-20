import type { Rect } from './geometry'

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
