// Renders one region of a page, in PDF user space, into a canvas of its own: the loupe's
// magnified view. The viewport is the page's own at `scale`, shifted so the region's top-left
// corner lands on the canvas origin, so the region fills the canvas exactly.
import type { InkDocument } from '../model/document'
import type { Rect } from '../model/geometry'

const isCancellation = (error: unknown): boolean =>
  (error as { name?: unknown } | null)?.name === 'RenderingCancelledException'

/**
 * Draws `userRect` of `page` (0-based) into `canvas` at `scale` device pixels per user-space
 * unit (times `/UserUnit`, as PDF.js applies it), turned by `rotation`: the page's /Rotate plus
 * any view rotation, the page's own /Rotate when omitted. The canvas is resized to the region,
 * so a 50 pt square at scale 4 gives a 200 × 200 canvas. Like the page canvas, the background
 * is white and embedded annotation appearances are drawn.
 *
 * Rejects with `signal.reason` once `signal` aborts; an abort mid-render cancels it, leaving
 * the canvas partly drawn.
 *
 * @internal
 */
export async function renderRegion(
  doc: InkDocument,
  page: number,
  userRect: Rect,
  scale: number,
  canvas: HTMLCanvasElement,
  signal?: AbortSignal,
  rotation?: number
): Promise<void> {
  signal?.throwIfAborted()
  const pdfPage = await doc._pdfjs.getPage(page)
  signal?.throwIfAborted()
  const turn = rotation ?? pdfPage.rotate
  const full = pdfPage.getViewport({ scale, rotation: turn })
  // The region's corners on the unshifted canvas, in device pixels.
  const [x1, y1] = full.convertToViewportPoint(userRect.x, userRect.y) as [number, number]
  const [x2, y2] = full.convertToViewportPoint(
    userRect.x + userRect.width,
    userRect.y + userRect.height
  ) as [number, number]
  const viewport = pdfPage.getViewport({
    scale,
    rotation: turn,
    offsetX: -Math.min(x1, x2),
    offsetY: -Math.min(y1, y2),
  })
  canvas.width = Math.max(1, Math.round(Math.abs(x2 - x1)))
  canvas.height = Math.max(1, Math.round(Math.abs(y2 - y1)))
  const task = pdfPage.render({
    canvas,
    viewport,
    background: '#ffffff',
    annotationMode: doc._pdfjs.module.AnnotationMode.ENABLE,
  })
  const cancel = (): void => task.cancel()
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    await task.promise
  } catch (error) {
    if (signal?.aborted && isCancellation(error)) throw signal.reason
    throw error
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
  // Finished just as the signal aborted: the caller has moved on.
  signal?.throwIfAborted()
}
