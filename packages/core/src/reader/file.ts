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
  /**
   * Present, and true, when the widget's one date or time Keystroke script is given after its one
   * date or time Format script under `Format`, and not under `Keystroke`, as PDF.js gives them for
   * its own date input.
   */
  keystrokeInFormat?: true
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
  /**
   * A checkbox widget's own value, from its `/AS` (else the field's `/V`): its on value, mapped
   * through `/Opt`, or `Off`. `FileField.value` is its first widget's.
   */
  value?: string
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
   * The dictionaries a walk of `/AcroForm /Fields` reaches that PDF.js gives the sandbox an object
   * for, grouped by the name the walk gives them, names in the order the walk first reaches each.
   * The walk follows references only, each once, and skips a Link dictionary with what lies under
   * it; a dictionary is named by the names above it in the walk and its own `/T`.
   *
   * One entry for each dictionary with `/Kids` that is not a widget (`id` and `container` given),
   * followed by the ids of the widgets after it under the name; and one entry, with no `id`, for
   * widgets under a name before any such dictionary. A name can repeat: two dictionaries of one
   * full name are two entries. An entry may list no widgets: a parent whose kids are fields. The
   * sandbox's field objects are built from these and the fields' facts.
   */
  fields: {
    name: string
    id?: string
    widgets: string[]
    /** The facts of the dictionary `id` names, present exactly when `id` is. */
    container?: FileFieldContainer
  }[]
}

/**
 * @internal A field-tree dictionary with `/Kids` that is not a widget, as PDF.js reads it for the
 * sandbox. Colours are RGB, each 0–255.
 */
export interface FileFieldContainer {
  /** Its full name: its own `/T` and each `/T` up its `/Parent` chain, an empty one kept. */
  fullName: string
  /** The ids of its `/Kids` entries written as references, in order. */
  kids: string[]
  /** JavaScript by event name: `/AA` merged along `/Parent`, and `Action` for its own `/A`. */
  scripts?: Record<string, string[]>
  /** The page `/P` names, -1 when it names none. */
  page: number
  /** Its own `/MK /BC`. */
  borderColor?: [number, number, number]
  /** Its own `/MK /BG`. */
  backgroundColor?: [number, number, number]
  /** `/MK /R` when it has `/MK`, else `/Rotate`: a whole multiple of 90 in 0–270, else 0. */
  rotation: number
}
