// Pieces of a reader's draw request that the page canvas and the loupe build alike.
import { refOfPdfjsId } from '../pdf/annotation-fields'

import { createPageTransform, normalizeRotation } from './transform'

import type { Rect } from '../model/geometry'
import type { PageInfo, PageRotation } from '../model/pages'
import type { HiddenAppearance } from '../reader/types'

/** The annotations PDF.js ids name, as a draw request leaves them out. */
export function hiddenFromPdfjsIds(ids: Iterable<string>): HiddenAppearance[] {
  return [...ids].map((id) => {
    const ref = refOfPdfjsId(id)
    return ref ? { id, objectNumber: ref.num } : { id }
  })
}

/**
 * The canvas size, in device pixels, that `region` of `page` fills at `scale` device pixels per
 * point (times /UserUnit) and total `rotation`: a 50 pt square at scale 4 gives 200 × 200.
 */
export function regionCanvasSize(
  page: PageInfo,
  region: Rect,
  scale: number,
  rotation: PageRotation
): { width: number; height: number } {
  const t = createPageTransform(page, scale, normalizeRotation(rotation - page.rotate))
  const a = t.toCss({ x: region.x, y: region.y })
  const b = t.toCss({ x: region.x + region.width, y: region.y + region.height })
  return {
    width: Math.max(1, Math.round(Math.abs(b.x - a.x))),
    height: Math.max(1, Math.round(Math.abs(b.y - a.y))),
  }
}
