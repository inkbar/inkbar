// Pieces of a reader's draw request that the page canvas, the loupe and the field appearances
// build alike.
import { refOfPdfjsId } from '../pdf/annotation-fields'

import { createPageTransform, normalizeRotation, type PageTransform } from './transform'

import type { Rect } from '../model/geometry'
import type { PageInfo, PageRotation } from '../model/pages'
import type { HiddenAppearance } from '../reader/types'

/**
 * An id the engine reader gives an annotation written as a direct object: page, place in
 * `/Annots`.
 */
const DIRECT_ID = /^p(\d+)i(\d+)$/

/**
 * The annotations `ids` name, as a draw of page `page` leaves them out: by object number, or for
 * one written as a direct object on that page by its place in `/Annots` when its id tells it.
 */
export function hiddenFromIds(ids: Iterable<string>, page: number): HiddenAppearance[] {
  return [...ids].map((id) => {
    const ref = refOfPdfjsId(id)
    if (ref) return { id, objectNumber: ref.num }
    const direct = DIRECT_ID.exec(id)
    return direct && Number(direct[1]) === page
      ? { id, index: Number(direct[2]) }
      : { id }
  })
}

/** The page canvas's size in device pixels: the page's CSS size at `pixelRatio`, rounded. */
export function pageCanvasSize(
  transform: Pick<PageTransform, 'cssWidth' | 'cssHeight'>,
  pixelRatio: number
): { width: number; height: number } {
  return {
    width: Math.round(transform.cssWidth * pixelRatio),
    height: Math.round(transform.cssHeight * pixelRatio),
  }
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
