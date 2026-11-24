// What the engine reader asks of @inkbar/engine, declared by shape: core names nothing from the
// engine, and the loader's public type stays the saver's.
import type { PageChars } from './runs'
import type { Rect } from '../model/geometry'

/**
 * @internal The engine's open document, as far as drawing pages and reading their text, links
 * and outline needs it.
 */
export interface ReaderEngineDocument {
  readonly pageCount: number
  pageInfo(index: number): Promise<{
    width: number
    height: number
    rotation: 0 | 90 | 180 | 270
    box: Rect
    userUnit: number
  }>
  renderPage(
    index: number,
    options: {
      region?: Rect
      size?: { width: number; height: number }
      rotation?: 0 | 90 | 180 | 270
      hide?: readonly number[]
      signal?: AbortSignal
    }
  ): Promise<{
    width: number
    height: number
    data: Uint8ClampedArray
    missingFonts: readonly string[]
  }>
  /**
   * The page's characters in the order the engine reads them. `signal` cancels the read while it
   * waits, as it does a render.
   */
  pageText(index: number, options?: { signal?: AbortSignal }): Promise<PageChars>
  /** Every annotation entry of the page, and the facts of its Link annotations. */
  pageLinks(index: number): Promise<PageLinksShape>
  outline(): Promise<OutlineShape>
  /** The destination the file holds for the name's bytes, `undefined` when it has none. */
  namedDestination(name: Uint8Array): Promise<FileDestinationShape | undefined>
  close(): Promise<void>
}

/**
 * @internal An explicit destination as the file gives it, with the shape of its array as the file
 * wrote it. `page` is 0-based, or -1 when it names no page of the file; in a remote go-to's or a
 * launch's destination it is the number the file gives. `args` always has four entries, `null`
 * where the file has none or no number.
 */
export interface ExplicitDestinationShape {
  page: number
  fit: string
  args: readonly (number | null)[]
  /**
   * The object the first entry refers to, when it is a reference: its number, and the
   * generation of the object the file holds under it.
   */
  pageRef?: { objectNumber: number; generation: number }
  /** The number of entries after the fit. */
  argCount: number
  /** What each of the first 8 entries after the fit holds, read through a reference. */
  argKinds: readonly ('number' | 'null' | 'other')[]
  /** Whether any of those 8 is written as a reference. */
  argIndirect: boolean
  /** How the fit entry is written. */
  fitKind: 'name' | 'string' | 'other' | 'missing'
  /** How the page entry is written: a reference to a dictionary, a whole number, or neither. */
  pageKind: 'ref' | 'integer' | 'other' | 'missing'
}

/** @internal A destination as the file gives it: explicit, or a named one's bytes. */
export type FileDestinationShape = ExplicitDestinationShape | { name: Uint8Array }

/** @internal An action as the file gives it: nothing decoded, completed or filtered. */
export interface FileActionShape {
  /** The action's `/S`. */
  kind: string
  /** A URI action's `/URI`: empty when it is neither a string nor a name. */
  uri?: Uint8Array
  /** Whether `/URI` is a string or a name; absent when it is neither. */
  uriKind?: 'string' | 'name'
  destination?: FileDestinationShape
  /** A GoToR's or Launch's `/F` when a string, else the first string its file specification gives. */
  file?: Uint8Array
  /** Whether `/F` is a string or a file specification; absent when it is neither. */
  fileKind?: 'string' | 'spec'
  newWindow?: boolean
  name?: string
  /** A JavaScript action's source, cut short when long. Never run. */
  script?: string
  /** Present, and true, when `script` was cut. */
  scriptTruncated?: true
}

/** @internal Where a link or outline item goes, as the file gives it. */
export interface FileTargetShape {
  destination?: FileDestinationShape
  action?: FileActionShape
  /** The additional action for a mouse press, else for a release. */
  additionalAction?: FileActionShape
}

/** @internal One dictionary of a page's `/Annots`, whatever its kind. */
export interface PageAnnotationEntryShape {
  /** Its place in `/Annots`. */
  index: number
  subtype: string
  flags: number
  /** Absent for an annotation written as a direct object. */
  objectNumber?: number
  /** The generation of the annotation's object; present with `objectNumber`. */
  generation?: number
  /** Whether `/Rect` is four numbers. */
  rectOk: boolean
  /** Whether `/QuadPoints` is there and not null, whatever it holds. */
  hasQuads: boolean
  /** Whether `/QuadPoints` is absent or a non-empty list of numbers in eights. */
  quadsOk: boolean
}

/** @internal A Link annotation's facts. */
export interface PageLinkFactsShape extends FileTargetShape {
  /** Its place in `/Annots`, as in `PageAnnotationEntryShape`. */
  index: number
  /** Normalised; all zero when `/Rect` is not well formed. */
  rect: Rect
  /** Eight numbers a quad, as the file has them; absent when not well formed. */
  quads?: readonly number[]
  /**
   * Present, and true, when the link has a `/Dest`, null included, that is not a string, a name
   * or an array; `destination` is then absent.
   */
  destinationInvalid?: true
}

/** @internal A page's annotation entries and its links. */
export interface PageLinksShape {
  annotations: readonly PageAnnotationEntryShape[]
  links: readonly PageLinkFactsShape[]
}

/** @internal One outline item as the file gives it. */
export interface OutlineEntryShape extends FileTargetShape {
  title: string
  bold: boolean
  italic: boolean
  /** The file's `/Count`, 0 when absent. */
  count: number
  children: readonly OutlineEntryShape[]
}

/** @internal The outline, cut short (`truncated`) when it loops or runs too deep or too long. */
export interface OutlineShape {
  items: readonly OutlineEntryShape[]
  truncated: boolean
}

/** @internal The engine, as far as the reader needs it. */
export interface ReaderEngine {
  open(bytes: Uint8Array, options?: { password?: string }): Promise<ReaderEngineDocument>
  destroy(): Promise<void>
}
