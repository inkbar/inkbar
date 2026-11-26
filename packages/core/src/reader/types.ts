// What the document and the DOM layer ask of whatever reads the PDF: the file's facts, the facts
// of each page, its pixels, its text, links and annotations, and the document's outline and
// destinations, its form fields and Tab order, and its JavaScript.
import type { FileAnnotation, FileFacts, FileField, FileScripts } from './file'
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
export type FieldLook = 'own' | 'checked' | 'unchecked'

/** @internal One pass of field appearances, drawn alone into one see-through canvas. */
export interface FieldDrawRequest {
  /** Zero-based page index. */
  page: number
  look: FieldLook
  /** Annotation ids whose appearances (of `look`) the pass draws. */
  ids: ReadonlySet<string>
  /** The page canvas's zoom, total rotation and pixel ratio. */
  zoom: number
  rotation: PageRotation
  pixelRatio: number
  /** The canvas's top-left corner on the page canvas, in device pixels. */
  x: number
  y: number
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

/** @internal File and page facts, pixels, text, links, annotations, the outline and destinations. */
export interface DocumentReader {
  readonly kind: 'pdfjs' | 'engine'
  readonly pageCount: number
  /**
   * The title, author and whether the file is encrypted. Metadata that cannot be read is left
   * out. Rejects only when the reader could not answer at all (its engine stopped or could not
   * start).
   */
  facts(): Promise<FileFacts>
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
   * Draws the appearances of `request.ids` (their `look`) alone into `canvas`, which stays
   * see-through around them, as the page canvas would draw them at the same zoom, rotation and
   * pixel ratio. Resolves with the ids it drew. Rejects with `signal.reason` once `signal` aborts.
   */
  drawFields(
    request: FieldDrawRequest,
    canvas: HTMLCanvasElement,
    signal?: AbortSignal
  ): Promise<Set<string>>
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
  /**
   * The page's listed annotations, widgets and links included, in the order PDF.js lists them:
   * `/Annots` order, with widgets and pop-ups after the rest. A page whose annotations cannot be
   * parsed has none; a read that rejects is not kept, so the next call reads the page again.
   */
  annotations(page: number): Promise<FileAnnotation[]>
  /**
   * The terminal fields of the widgets `annotations` lists, in the order of each field's first
   * widget, page by page. A widget with no field name, or whose field is none of the kinds, is
   * left out.
   */
  form(): Promise<FileField[]>
  /**
   * The page's annotation ids in its structure tree's order. `[]` when the page has no structure
   * order or it cannot be read.
   */
  tabOrder(page: number): Promise<string[]>
  /**
   * The file's JavaScript. `undefined` when neither the document nor any field has any; a page's
   * own actions alone do not count, so a file with only those has none.
   */
  scripts(): Promise<FileScripts | undefined>
  /**
   * The page's actions by event (`PageOpen`, `PageClose`), read when the form's scripts first
   * open the page. `{}` when it has none.
   */
  pageScripts(page: number): Promise<Record<string, string[]>>
  /**
   * The field objects the kept sandbox is started with, in its own format: by field name, each
   * name's objects. `null` when the file has none.
   */
  sandboxFields(): Promise<Map<string, unknown[]> | null>
  /**
   * The outline, every destination resolved. `[]` when the file has none. Rejects when it could
   * not be read; the document then reads it again on the next call.
   */
  outline(): Promise<OutlineItem[]>
  /**
   * Where `raw` goes. `undefined` when it names no page, including when the file's data cannot
   * be looked up: that answer would not change, so the document keeps it. Rejects only when the
   * reader could not answer at all (its engine stopped or could not start); the document then
   * asks again on the next call.
   */
  resolveDestination(raw: RawDestination): Promise<Destination | undefined>
  destroy(): Promise<void>
}
