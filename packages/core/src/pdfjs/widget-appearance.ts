// Draws annotation appearances apart from the page: the page canvas of a form page leaves its
// widgets out, and the form layer draws each widget's own appearance into a small canvas of its
// own, so a toggle or an edit shows or hides that canvas instead of painting the page again.
//
// Both rely on how PDF.js lays out a page's operator list: each annotation's appearance runs
// from a `beginAnnotation` operation, whose first argument is the annotation id, to the next
// `endAnnotation`. With `AnnotationMode.ENABLE_FORMS`, a checkbox or radio has two such runs,
// its on and off appearances, named by the sixth argument (`'checked'`, `'unchecked'`).
import type { PdfjsPage } from './types'
import type { InkDocument } from '../model/document'

type RenderParameters = Parameters<PdfjsPage['render']>[0]
type OperationsFilter = NonNullable<RenderParameters['operationsFilter']>

/** Which of a checkbox's or radio's appearances to draw: its on or its off one. */
export type ToggleLook = 'checked' | 'unchecked'

const isCancellation = (error: unknown): boolean =>
  (error as { name?: unknown } | null)?.name === 'RenderingCancelledException'

/**
 * A filter for a page render that leaves out the appearances of the annotations in `ids` and
 * keeps everything else. One filter serves one render: it follows the operator list in order.
 *
 * @internal
 */
export function omitAppearances(
  doc: InkDocument,
  ids: ReadonlySet<string>
): OperationsFilter {
  const { OPS } = doc._pdfjs.module
  let skipping = false
  return (i, list) => {
    const fn = list.fnArray[i]
    if (fn === OPS.beginAnnotation) {
      skipping = ids.has((list.argsArray[i] as unknown[])[0] as string)
      return !skipping
    }
    if (fn === OPS.endAnnotation) {
      const skipped = skipping
      skipping = false
      return !skipped
    }
    // Dependencies only load fonts and images; one a later operation needs must still load.
    return !skipping || fn === OPS.dependency
  }
}

/** A filter that keeps only one annotation's appearance (`look`: one of a toggle's two). */
function onlyAppearance(
  doc: InkDocument,
  id: string,
  look?: ToggleLook
): OperationsFilter {
  const { OPS } = doc._pdfjs.module
  let inside = false
  return (i, list) => {
    const fn = list.fnArray[i]
    if (fn === OPS.beginAnnotation) {
      const args = list.argsArray[i] as unknown[]
      inside = args[0] === id && (look === undefined || args[5] === look)
      return inside
    }
    if (fn === OPS.endAnnotation) {
      const was = inside
      inside = false
      return was
    }
    // Marked content brackets an appearance in its optional content group, and nests evenly
    // in the page's own content, so it runs everywhere.
    return (
      inside ||
      fn === OPS.dependency ||
      fn === OPS.beginMarkedContent ||
      fn === OPS.beginMarkedContentProps ||
      fn === OPS.endMarkedContent
    )
  }
}

/** One annotation's appearance, drawn alone into a canvas over part of the page. */
export interface AppearanceRequest {
  /** Zero-based page index. */
  page: number
  /** Annotation id. */
  id: string
  /** For a checkbox or radio, which of its two appearances; omitted for any other widget. */
  look?: ToggleLook
  /** Sized by the caller; drawn transparent except for the appearance. */
  canvas: HTMLCanvasElement
  /** The page canvas's zoom and total rotation, so the appearance lands on its pixel grid. */
  zoom: number
  rotation: number
  /** Device pixels per CSS px. */
  devicePixelRatio: number
  /** The canvas's top-left corner on the page canvas, in device pixels. */
  x: number
  y: number
}

/**
 * Draws one annotation's own appearance, as the page canvas would draw it at the same zoom,
 * rotation and pixel ratio, into `canvas`, whose top-left corner sits at device pixel
 * (`x`, `y`) of the page. Nothing else on the page is drawn: the canvas stays transparent
 * around the appearance. It runs over the same operator list as the page canvas (`look` aside),
 * which PDF.js keeps, so the page is not parsed again.
 *
 * Rejects with `signal.reason` once `signal` aborts.
 *
 * @internal
 */
export async function renderAppearance(
  doc: InkDocument,
  req: AppearanceRequest,
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted()
  const pdfPage = await doc._pdfjs.getPage(req.page)
  signal?.throwIfAborted()
  const { AnnotationMode } = doc._pdfjs.module
  const dpr = req.devicePixelRatio
  // PDF.js would open the canvas without an alpha channel, as for a page; this one stays
  // see-through around the appearance.
  const context = req.canvas.getContext('2d')
  if (!context) throw new Error('No 2D context for a widget appearance')
  const task = pdfPage.render({
    canvas: req.canvas,
    canvasContext: context,
    viewport: pdfPage.getViewport({ scale: req.zoom, rotation: req.rotation }),
    background: 'rgba(0,0,0,0)',
    // A toggle's two appearances are both in the ENABLE_FORMS list; ENABLE has only the one
    // the file has on.
    annotationMode:
      req.look === undefined ? AnnotationMode.ENABLE : AnnotationMode.ENABLE_FORMS,
    transform: [dpr, 0, 0, dpr, -req.x, -req.y],
    operationsFilter: onlyAppearance(doc, req.id, req.look),
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
  signal?.throwIfAborted()
}
