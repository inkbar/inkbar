// What the DOM layer asks of whatever reads the PDF: the facts of each page and its pixels.
import type { Rect } from '../model/geometry'
import type { PageInfo, PageRotation } from '../model/pages'

/**
 * An annotation the canvas leaves out. `objectNumber` is absent for one stored as a direct object.
 *
 * @internal
 */
export interface HiddenAppearance {
  id: string
  objectNumber?: number
}

/** @internal */
export interface DrawRequest {
  /** Zero-based page index. */
  page: number
  /** Total clockwise turn: the page's /Rotate plus any view rotation. */
  rotation: PageRotation
  /** CSS pixels per point, before /UserUnit. */
  zoom: number
  /** Device pixels per CSS pixel. */
  pixelRatio: number
  /** Exact canvas size in device pixels. The reader sets `canvas.width` and `canvas.height` to these. */
  width: number
  height: number
  /** Part of the page to draw, in user space. Absent: the whole page. */
  region?: Rect
  hide: readonly HiddenAppearance[]
}

/** @internal Page facts and pixels for the DOM layer. */
export interface DocumentReader {
  readonly kind: 'pdfjs' | 'engine'
  readonly pageCount: number
  pageInfo(index: number): Promise<PageInfo>
  /**
   * Draws into `canvas` on white. Rejects with `signal.reason` once `signal` aborts; an aborted
   * draw may leave the canvas partly drawn and the caller discards it.
   */
  draw(
    request: DrawRequest,
    canvas: HTMLCanvasElement,
    signal?: AbortSignal
  ): Promise<void>
  destroy(): Promise<void>
}
