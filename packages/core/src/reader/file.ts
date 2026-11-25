// What the reader tells the document about the file itself: its annotations and form fields as
// they stand in the file, and the facts of its trailer and Info dictionary.

/**
 * @internal One annotation of a page that is listed (see `listed` in engine-reader/links.ts).
 * Colours are RGB, each 0–255.
 */
export interface FileAnnotation {
  /** The object reference as core writes it: `12R`, `12R3`. Invented for a direct object. */
  id: string
  subtype: string
  /** `/Rect` in user space, lower-left corner first; all 0 when it is not four numbers. */
  rect: [number, number, number, number]
  hasAppearance: boolean
  /** `/QuadPoints`, flat. */
  quads?: number[]
  color?: [number, number, number]
  interiorColor?: [number, number, number]
  opacity?: number
  contents?: string
  author?: string
  /** `/CreationDate` as written. */
  created?: string
  /** `/M` as written. */
  modified?: string
  /**
   * A note's `/Name`. PDF.js gives `Note` when there is none and `NoIcon` when the note has an
   * appearance stream, whatever its `/Name`.
   */
  icon?: string
  /** The id of the annotation `/IRT` names. */
  inReplyTo?: string
  /** `/IT`. */
  intent?: string
  /** A Line's `/L`. */
  line?: [number, number, number, number]
  /** `/LE`. */
  lineEndings?: [string, string]
  /** A Polygon's or PolyLine's `/Vertices`, flat. */
  vertices?: number[]
  /** `/InkList`, each path flat. */
  inkLists?: number[][]
  border?: { width: number }
  /** What `/DA` sets. */
  defaultAppearance?: {
    fontSize: number
    fontName?: string
    color?: [number, number, number]
  }
}

/** @internal What a widget's actions hold, as the file says it. */
export interface FileWidgetActions {
  /** JavaScript sources by event name (`Action`, `Keystroke`, `Format`, `Validate`, `Calculate`, …). */
  scripts?: Record<string, string[]>
  /** A URI action's address, or the one a JavaScript `/A` opens with `app.launchURL`. */
  url?: string
  /** The `app.launchURL` call that gave `url` asks for a new window. */
  newWindow?: boolean
  /** A Named action's name. */
  named?: string
  /** A ResetForm action: field names, field object ids, and whether they are the ones reset. */
  resetForm?: { fields: string[]; refs: string[]; include: boolean }
}

/** @internal One widget of a field. Colours are RGB, each 0–255. */
export interface FileWidget {
  /** The object reference as core writes it: `12R`, `12R3`. */
  id: string
  page: number
  /** Position among the page's listed annotations; Tab order shares it with links. */
  at: number
  /** `/Rect` in user space, lower-left corner first; all 0 when it is not four numbers. */
  rect: [number, number, number, number]
  /** `/F`, with Hidden also set for a widget the reader hides (PDF.js: a text widget's `/PMD`). */
  flags: number
  hasAppearance: boolean
  /** A checkbox's or radio's on value, mapped through `/Opt`. */
  onValue?: string
  border?: { width: number; style?: number }
  /** `/MK /BC`. */
  borderColor?: [number, number, number]
  /** `/MK /BG`. */
  backgroundColor?: [number, number, number]
  /** `/MK /R`. */
  rotation?: number
  /** `/Q`: 0 left, 1 centre, 2 right. */
  alignment?: number
  /** The widget's own `/TU`. */
  tooltip?: string
  /** What `/DA` sets. */
  defaultAppearance?: {
    fontSize: number
    fontName?: string
    color?: [number, number, number]
  }
  actions: FileWidgetActions
}

/** @internal */
export type FileFieldKind =
  'text' | 'checkbox' | 'radio' | 'button' | 'combo' | 'list' | 'signature'

/** @internal One terminal field with its widgets in document order. */
export interface FileField {
  /** The full name. */
  name: string
  kind: FileFieldKind
  /** `/Ff`. */
  flags: number
  /** `/V`; a checkbox's or radio's is its export value, mapped through `/Opt`. */
  value?: string | string[]
  /** `/DV`, as `value` is read. */
  defaultValue?: string | string[]
  /** `/Opt` of a choice field. */
  options?: { exportValue: string; displayValue: string }[]
  /** `/MaxLen`. */
  maxLength?: number
  widgets: FileWidget[]
}

/** @internal */
export interface FileFacts {
  title?: string
  author?: string
  encrypted: boolean
}

/** @internal A file's JavaScript, as text. Nothing here is run by a reader. */
export interface FileScripts {
  /** Field names in `/CO` order. */
  calculationOrder: string[]
  /**
   * `/CO` as the kept sandbox takes it: the ids of `sandboxFields()`'s objects, one per entry,
   * entries naming no field object included. Names alone cannot give them back: two fields can
   * share a name, and an entry may name no field.
   */
  calculationOrderIds: string[]
  /** Document-level scripts (the `/Names /JavaScript` tree) in name order. */
  document: { name: string; source: string }[]
  /** Document actions by event: `OpenAction`, `WillClose`, `WillSave`, `DidSave`, `WillPrint`, `DidPrint`. */
  documentActions: Record<string, string[]>
  /**
   * The fields `/AcroForm /Fields` reaches that have widgets of a kind the form reads, in the
   * order a walk of that tree first reaches each name: the full name, the id of the field's own
   * dictionary when it is not one of its widgets, and its widgets' ids in the order the field
   * lists them. A field or widget written as a direct object is not reached. The sandbox's field
   * objects are built from these and the fields' facts.
   */
  fields: { name: string; id?: string; widgets: string[] }[]
}
