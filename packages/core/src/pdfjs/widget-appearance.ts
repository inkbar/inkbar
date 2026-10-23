// Draws annotation appearances apart from the page: the page canvas of a form page leaves its
// widgets out, and the form layer draws the widgets' own appearances apart from it, so a toggle
// or an edit shows or hides a widget's canvas instead of painting the page again.
//
// Both rely on how PDF.js lays out a page's operator list: each annotation's appearance runs
// from a `beginAnnotation` operation, whose first argument is the annotation id, to the next
// `endAnnotation`. With `AnnotationMode.ENABLE_FORMS`, a checkbox or radio has two such runs,
// its on and off appearances, named by the sixth argument (`'checked'`, `'unchecked'`).
// widget-appearance.browser.test.ts pins that layout.
import type { PdfjsPage } from './types'
import type { InkDocument } from '../model/document'

type RenderParameters = Parameters<PdfjsPage['render']>[0]
type OperationsFilter = NonNullable<RenderParameters['operationsFilter']>
type OperatorList = Parameters<OperationsFilter>[1]
type Ops = InkDocument['_pdfjs']['module']['OPS']

/** Which appearance a pass draws: each widget's own, or one of a toggle's two. */
export type AppearanceLook = 'own' | 'checked' | 'unchecked'

const isCancellation = (error: unknown): boolean =>
  (error as { name?: unknown } | null)?.name === 'RenderingCancelledException'

/**
 * Which annotation run each operation of one operator list (one page in one annotation mode)
 * belongs to. Built once per list as it streams in, and shared by every filter over it.
 */
interface RunIndex {
  /** Operations indexed so far. */
  scanned: number
  /** By operation: the annotation id of the run it is in, its begin and end included. */
  ids: (string | undefined)[]
  /** By operation: the run's look name, for a toggle's two runs under ENABLE_FORMS. */
  looks: (string | undefined)[]
  /** The id of the run open at `scanned`. */
  open: string | undefined
  openLook: string | undefined
  /** The list is not laid out as this module expects. */
  broken: boolean
}

const indexes = new WeakMap<OperatorList, RunIndex>()

function runIndex(OPS: Ops, list: OperatorList): RunIndex {
  let index = indexes.get(list)
  if (!index) {
    index = {
      scanned: 0,
      ids: [],
      looks: [],
      open: undefined,
      openLook: undefined,
      broken: false,
    }
    indexes.set(list, index)
  }
  const { fnArray, argsArray } = list
  for (let i = index.scanned; i < fnArray.length; i++) {
    const fn = fnArray[i]
    if (fn === OPS.beginAnnotation) {
      const args = argsArray[i] as unknown[] | null
      const id = args?.[0]
      const look = args?.[5]
      if (index.open !== undefined || typeof id !== 'string') index.broken = true
      index.open = typeof id === 'string' ? id : undefined
      index.openLook = typeof look === 'string' ? look : undefined
    }
    index.ids[i] = index.open
    index.looks[i] = index.openLook
    if (fn === OPS.endAnnotation) {
      if (index.open === undefined) index.broken = true
      index.open = undefined
      index.openLook = undefined
    }
  }
  index.scanned = fnArray.length
  return index
}

/**
 * A filter for a page render that leaves out the appearances of the annotations in `ids` and
 * keeps everything else.
 *
 * @internal
 */
export function omitAppearances(
  doc: InkDocument,
  ids: ReadonlySet<string>
): OperationsFilter {
  const { OPS } = doc._pdfjs.module
  return (i, list) => {
    const index = runIndex(OPS, list)
    const id = index.ids[i]
    // Dependencies only load fonts and images; one a later operation needs must still load.
    return id === undefined || !ids.has(id) || list.fnArray[i] === OPS.dependency
  }
}

/** One pass of appearances, drawn alone into one canvas over part of the page. */
export interface AppearancePass {
  /** Zero-based page index. */
  page: number
  look: AppearanceLook
  /** Annotation ids whose appearances (of `look`) the pass draws. */
  ids: ReadonlySet<string>
  /** Sized by the caller; drawn transparent except for the appearances. */
  canvas: HTMLCanvasElement
  /** The page canvas's zoom and total rotation, so the appearances land on its pixel grid. */
  zoom: number
  rotation: number
  /** Device pixels per CSS px. */
  devicePixelRatio: number
  /** The canvas's top-left corner on the page canvas, in device pixels. */
  x: number
  y: number
}

/** The operator list does not hold annotation runs as PDF.js 6.4 lays them out. */
export class AppearanceLayoutError extends Error {
  override name = 'AppearanceLayoutError'
}

/**
 * Draws the appearances of `ids` (their `look`), as the page canvas would draw them at the same
 * zoom, rotation and pixel ratio, into `canvas`, whose top-left corner sits at device pixel
 * (`x`, `y`) of the page. Nothing else on the page is drawn: the canvas stays transparent
 * around the appearances. The widgets' own appearances come from the ENABLE operator list the
 * page canvas and the loupe use; a toggle's two come from the ENABLE_FORMS list, which PDF.js
 * builds and keeps apart, parsing the page a second time for it.
 *
 * Resolves with the ids it found a run for. Rejects with `signal.reason` once `signal` aborts,
 * and with an `AppearanceLayoutError` when the list's runs are not laid out as expected.
 *
 * @internal
 */
export async function renderAppearances(
  doc: InkDocument,
  pass: AppearancePass,
  signal?: AbortSignal
): Promise<Set<string>> {
  signal?.throwIfAborted()
  const pdfPage = await doc._pdfjs.getPage(pass.page)
  signal?.throwIfAborted()
  const { AnnotationMode, OPS } = doc._pdfjs.module
  const dpr = pass.devicePixelRatio
  const found = new Set<string>()
  let broken = false
  const { ids, look } = pass
  const filter: OperationsFilter = (i, list) => {
    const index = runIndex(OPS, list)
    if (index.broken) broken = true
    const id = index.ids[i]
    if (id !== undefined && ids.has(id) && (look === 'own' || index.looks[i] === look)) {
      found.add(id)
      return true
    }
    // Marked content brackets an appearance in its optional content group, and nests evenly
    // in the page's own content, so it runs everywhere.
    const fn = list.fnArray[i]
    return (
      fn === OPS.dependency ||
      (id === undefined &&
        (fn === OPS.beginMarkedContent ||
          fn === OPS.beginMarkedContentProps ||
          fn === OPS.endMarkedContent))
    )
  }
  // PDF.js would open the canvas without an alpha channel, as for a page; this one stays
  // see-through around the appearances.
  const context = pass.canvas.getContext('2d')
  if (!context) throw new Error('No 2D context for widget appearances')
  const task = pdfPage.render({
    canvas: pass.canvas,
    canvasContext: context,
    viewport: pdfPage.getViewport({ scale: pass.zoom, rotation: pass.rotation }),
    background: 'rgba(0,0,0,0)',
    annotationMode: look === 'own' ? AnnotationMode.ENABLE : AnnotationMode.ENABLE_FORMS,
    transform: [dpr, 0, 0, dpr, -pass.x, -pass.y],
    operationsFilter: filter,
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
  if (broken)
    throw new AppearanceLayoutError(
      `Page ${pass.page + 1}'s operator list does not hold annotation appearances as expected`
    )
  return found
}
