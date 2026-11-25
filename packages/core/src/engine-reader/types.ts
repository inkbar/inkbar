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
      /** By object number, or by place in `/Annots` for one written as a direct object. */
      hide?: readonly (number | { index: number })[]
      signal?: AbortSignal
    }
  ): Promise<{
    width: number
    height: number
    data: Uint8ClampedArray
    missingFonts: readonly string[]
  }>
  /**
   * The annotations listed, by place in `/Annots`, each alone in its normal appearance (the
   * `state` of `/AP /N` named, else the one `/AS` selects), in the order given, onto one
   * transparent bitmap of `size` showing `region`, on the pixels `renderPage` gives them with
   * the same region, size and rotation. `data` is straight RGBA. `drawn` lists the places drawn:
   * one hidden, a popup, one with nothing to draw or without the state named is left out. One
   * flagged NoView is drawn, though the page leaves it out.
   */
  renderAnnotations(
    index: number,
    options: {
      annotations: readonly { index: number; state?: string }[]
      region: Rect
      size: { width: number; height: number }
      rotation?: 0 | 90 | 180 | 270
      signal?: AbortSignal
    }
  ): Promise<{
    width: number
    height: number
    data: Uint8ClampedArray
    drawn: number[]
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
  /** What the file's trailer and `/Info` say about it. */
  documentFacts(): Promise<DocumentFactsShape>
  /** Every annotation dictionary of the page's `/Annots`, with its facts. */
  pageAnnotations(index: number): Promise<PageAnnotationsShape>
  /** The form's fields with their widgets. */
  formFields(): Promise<FormFactsShape>
  /** The file's JavaScript outside its form fields, as source text. */
  scripts(): Promise<ScriptFactsShape>
  /** The object numbers of the page's annotations in the order its structure tree reaches them. */
  structureOrder(index: number): Promise<StructureOrderShape>
  close(): Promise<void>
}

/**
 * @internal A text string of the file: a string when its bytes are text, else the bytes as the
 * file holds them.
 */
export type FileTextShape = string | { bytes: Uint8Array }

/** @internal A reference to an object of the file. */
export interface ObjectRefShape {
  objectNumber: number
  generation: number
}

/** @internal What the trailer and `/Info` say. */
export interface DocumentFactsShape {
  title?: FileTextShape
  author?: FileTextShape
  encrypted: boolean
  truncated?: true
}

/**
 * @internal The facts an annotation and a widget share. A number the file writes as something
 * else is `null`.
 */
export interface AppearanceFactsShape {
  /** `/Rect`'s first four entries as written; `null` when it is not a list. */
  rect: (number | null)[] | null
  /** Whether `/Rect` is exactly four finite numbers. */
  rectOk: boolean
  /** `/F`, 0 when absent. */
  flags: number
  hasAppearance: boolean
  /** The names of `/AP /N`'s states, in byte order. */
  appearanceStates: string[]
  /** `/AS`, when it is a name. */
  appearanceState?: string
  /** `/BS`: its `/W` and `/S`, and `/D` as written (`null` when it is not a list). */
  borderStyle?: {
    width: number | null
    style: string | null
    dash?: (number | null)[] | null
  }
  /** `/Border`'s first three entries. */
  border?: (number | null)[]
  /** `/Border`'s fourth entry as written, when it has one; `null` when that is not a list. */
  borderDash?: (number | null)[] | null
}

/** @internal One dictionary of a page's `/Annots`. */
export interface AnnotationFactsShape extends AppearanceFactsShape {
  /** Its place in `/Annots`. */
  index: number
  subtype: string
  /** Absent for an annotation written as a direct object. */
  objectNumber?: number
  generation?: number
  quads?: (number | null)[]
  color?: (number | null)[]
  interiorColor?: (number | null)[]
  opacity?: number | null
  contents?: FileTextShape
  author?: FileTextShape
  created?: FileTextShape
  modified?: FileTextShape
  icon?: string
  inReplyTo?: ObjectRefShape
  intent?: string
  line?: (number | null)[]
  lineEndings?: (string | null)[]
  vertices?: (number | null)[]
  inkLists?: ((number | null)[] | null)[]
  defaultAppearance?: FileTextShape
  paperMetadata?: true
  /** `/Parent`, when it is a reference: a popup's annotation. */
  parent?: ObjectRefShape
  truncated?: true
}

/** @internal A page's annotation dictionaries, in `/Annots` order. */
export interface PageAnnotationsShape {
  annotations: readonly AnnotationFactsShape[]
  truncated: boolean
}

/** @internal A widget's own `/A`, its first action. */
export interface FieldActionShape {
  kind: string
  uri?: Uint8Array
  name?: string
  reset?: { fields: FileTextShape[]; refs: ObjectRefShape[]; flags: number }
  /** What a Launch's or GoToR's `/F` is; absent when it is absent or null. */
  fileKind?: 'string' | 'spec' | 'other'
  /** `/F`'s bytes, when it is a string. */
  file?: Uint8Array
  /** The file specification's `/F`, when it is a string. */
  specFile?: Uint8Array
  /** The file specification's `/UF`, when it is a string. */
  specUnicodeFile?: Uint8Array
}

/** @internal One widget of a field. */
export interface WidgetFactsShape extends AppearanceFactsShape {
  /** The page whose `/Annots` holds it, or -1. */
  page: number
  /** Its place in that page's `/Annots`, or -1. */
  index: number
  objectNumber?: number
  generation?: number
  onState?: string
  /** A checkbox's or radio's export value: its `/Opt` entry, else `onState`. */
  exportValue?: string
  borderColor?: (number | null)[]
  backgroundColor?: (number | null)[]
  rotation?: number | null
  /** `/Q`, inherited. */
  alignment?: number | null
  tooltip?: FileTextShape
  /** `/DA`, inherited. */
  defaultAppearance?: FileTextShape
  paperMetadata?: true
  /** JavaScript sources by additional-action key, and `A` for the widget's own `/A`. */
  scripts: Record<string, string[]>
  action?: FieldActionShape
  truncated?: true
}

/** @internal A field's `/V` or `/DV`: a list holds text, names as `{ name }`, and `null`. */
export type FieldValueShape = FileTextShape | (FileTextShape | { name: string } | null)[]

/** @internal How a field's `/V` or `/DV` is written. */
export type FieldValueKindShape = 'none' | 'string' | 'name' | 'array' | 'other'

/** @internal One field of the form. */
export interface FieldFactsShape {
  /** The full name. */
  name: string
  objectNumber?: number
  generation?: number
  /** `'acroform'` when `/Fields` reaches it, `'recovered'` when only a page's widget does. */
  origin: 'acroform' | 'recovered'
  kind:
    'text' | 'checkbox' | 'radio' | 'button' | 'combo' | 'list' | 'signature' | 'unknown'
  /** `/Ff`, inherited. */
  flags: number
  valueKind: FieldValueKindShape
  value?: FieldValueShape
  /** Present, and true, when `/V` is written as null. */
  valueNull?: true
  defaultValueKind: FieldValueKindShape
  defaultValue?: FieldValueShape
  /** Present, and true, when `/DV` is written as null. */
  defaultValueNull?: true
  /** `/I`, inherited as `/V` is; `null` when it is not a list. */
  selectedIndices?: (number | null)[] | null
  options?: { exportValue: string; displayValue: string }[]
  /** `/MaxLen`, when it is not 0. */
  maxLength?: number
  widgets: WidgetFactsShape[]
  truncated?: true
}

/** @internal The file's form. */
export interface FormFactsShape {
  kind: 'none' | 'acroform' | 'xfa'
  needAppearances: boolean
  /** `/AcroForm /DA`. */
  defaultAppearance?: FileTextShape
  /** `/AcroForm /Q`. */
  alignment?: number | null
  fields: FieldFactsShape[]
  /** Each entry of `/AcroForm /CO` as a reference; `null` for one that is not a reference. */
  calculationOrderRefs: (ObjectRefShape | null)[]
  /** The form was refused for its size: `fields` is empty. */
  tooLarge: boolean
  truncated: boolean
}

/**
 * @internal The file's JavaScript outside its form fields, as source text that nothing runs. Keys
 * are the file's own: `OpenAction` for the catalog's open action, and each additional-action key
 * as written. Each list holds every source of the action's chain: the action's own, then its
 * `/Next`.
 */
export interface ScriptFactsShape {
  /** The `/Names /JavaScript` tree in its order, one entry for each source of each name's chain. */
  document: { name: FileTextShape | null; source: string }[]
  documentActions: Record<string, string[]>
  /** Each page whose `/AA` holds JavaScript, with its sources by key. */
  pageActions: { page: number; scripts: Record<string, string[]> }[]
  truncated: boolean
}

/** @internal The order a page's structure tree gives its annotations, by object number. */
export interface StructureOrderShape {
  order: number[]
  truncated: boolean
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
