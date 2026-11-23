// What the document and the DOM layer ask of whatever reads the PDF: the facts of each page, its
// pixels, its text and links, and the document's outline and destinations.
import type { Destination, RawDestination } from '../model/destination'
import type { Rect } from '../model/geometry'
import type { PageLink } from '../model/links'
import type { OutlineItem } from '../model/outline'
import type { PageInfo, PageRotation } from '../model/pages'
import type { TextContent } from '../model/text'

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

/** @internal Page facts, pixels, text, links, the outline and destinations. */
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
  /**
   * The page's text. With `glyphs`, character boundaries are exact where the reader can make them
   * so. Once `signal` aborts the read rejects with `signal.reason`.
   */
  text(
    page: number,
    options: { glyphs: boolean; signal?: AbortSignal }
  ): Promise<TextContent>
  /** The page's visible links, in the order of the page's annotations. */
  links(page: number): Promise<PageLink[]>
  /** The outline, every destination resolved. `[]` when the file has none. */
  outline(): Promise<OutlineItem[]>
  resolveDestination(raw: RawDestination): Promise<Destination | undefined>
  destroy(): Promise<void>
}
