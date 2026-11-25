// Test support only, never production code: browser tests import it. A region of a page drawn
// as the loupe draws it, for a test to compare a lens or a page canvas against.
import { hiddenFromIds, regionCanvasSize } from '../dom/draw-request'
import { normalizeRotation } from '../dom/transform'
import { hiddenAppearances } from '../pdfjs/widget-appearance'

import type { InkDocument } from '../model/document'
import type { Rect } from '../model/geometry'

/**
 * Draws `userRect` of `page` (0-based) into `canvas` at `scale` device pixels per user-space
 * unit (times `/UserUnit`), turned by `rotation`: the page's /Rotate plus any view rotation,
 * the page's own /Rotate when omitted. The canvas is resized to the region, so a 50 pt square
 * at scale 4 gives a 200 × 200 canvas. File annotations lifted into the session are left out.
 * Rejects with `signal.reason` once `signal` aborts.
 */
export function renderRegion(
  doc: InkDocument,
  page: number,
  userRect: Rect,
  scale: number,
  canvas: HTMLCanvasElement,
  signal?: AbortSignal,
  rotation?: number
): Promise<void> {
  const info = doc.pages[page]!
  const turn = normalizeRotation(rotation ?? info.rotate)
  return doc._reader.draw(
    {
      page,
      rotation: turn,
      zoom: scale,
      pixelRatio: 1,
      ...regionCanvasSize(info, userRect, scale, turn),
      region: userRect,
      hide: hiddenFromIds(hiddenAppearances(doc), page),
    },
    canvas,
    signal
  )
}
