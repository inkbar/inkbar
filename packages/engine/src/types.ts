import type { Annotation as GlossAnnotation, Quad } from 'gloss-format'

/** Options for `Engine.open`. */
export interface OpenOptions {
  /** Password for an encrypted document. An empty string counts as no password. */
  password?: string
}

/** A rectangle in PDF user space: points, origin at the bottom left, before /Rotate. */
export interface Rect {
  /** Left edge. */
  x: number
  /** Bottom edge. */
  y: number
  /** Width, from `x` to the right. */
  width: number
  /** Height, from `y` upward. */
  height: number
}

/**
 * A page's size and rotation. Sizes are in user-space units and describe the page box: the crop
 * box intersected with the media box, or the media box when the page has no crop box. A unit is a
 * PDF point (1/72 inch) unless the page has a /UserUnit; multiply by `userUnit` for points. They
 * are taken before /Rotate is applied, so a page rotated by 90 degrees keeps its unrotated width
 * and height.
 */
export interface PageInfo {
  /** Width in user-space units, before /Rotate. */
  width: number
  /** Height in user-space units, before /Rotate. */
  height: number
  /** The page's /Rotate entry in degrees clockwise, reduced to 0, 90, 180 or 270. */
  rotation: 0 | 90 | 180 | 270
  /**
   * The page box in PDF user space, before /Rotate: where `width` by `height` sits on the page's
   * coordinate plane. Its origin is the corner of the crop box, so it is not always (0, 0).
   */
  box: Rect
  /** The page's `/UserUnit`: the size of one user-space unit in points. 1 when the page has none. */
  userUnit: number
}

/** A font a page's text uses. */
export interface TextFont {
  /** The font's base name, without a subset prefix. `''` when the file gives none. */
  name: string
  fixedPitch: boolean
  serif: boolean
  italic: boolean
  bold: boolean
  /** Written top to bottom. */
  vertical: boolean
  /**
   * The height above the baseline in em units, from the face the engine loaded for the font.
   * `null` for a Type 3 font, and when the face gives 0 for both this and `descent`.
   */
  ascent: number | null
  /** The depth below the baseline in em units, as `ascent`; negative below the baseline. */
  descent: number | null
  /**
   * The font descriptor's `/Ascent` over 1000, with the sign the file gives it. A Type 0 font's
   * comes from its descendant font. `null` when there is no descriptor, or it has no number here.
   * Nothing checks it: a file can give any value.
   */
  descriptorAscent: number | null
  /** The font descriptor's `/Descent` over 1000, as `descriptorAscent`. */
  descriptorDescent: number | null
  /**
   * The standard 14 font the engine draws this font with, when it is one with no embedded file.
   * `null` otherwise.
   */
  standard: StandardFontName | null
}

/** One of the standard 14 fonts every PDF reader provides, by name. */
export type StandardFontName = StandardFont | 'Symbol' | 'ZapfDingbats'

/** The numbers per character in `PageText.geometry`. */
export const TEXT_GEOMETRY_STRIDE = 15

/** A page's characters in the order the page's text is read, one entry of each array per character. */
export interface PageText {
  count: number
  /** Unicode code points. 0 for a character the font cannot map; `flags` marks it. */
  codes: Uint32Array
  /**
   * 15 numbers per character, in user space: box left, bottom, right, top; loose box left,
   * bottom, right, top; origin x, y; font size; the text matrix's a, b, c, d.
   */
  geometry: Float32Array
  /** Bit 1: inferred by the engine (a space or line break the page does not draw). 2: hyphen. 4: no Unicode mapping. */
  flags: Uint8Array
  /** Index into `fontTable`. */
  fonts: Uint16Array
  fontTable: TextFont[]
  /**
   * The page had more than 1,000,000 characters and these are the first 1,000,000. The cut can
   * fall inside a line break the engine inferred, so the last character can be a lone CR.
   */
  truncated: boolean
}

/** Options for `EngineDocument.pageText`. */
export interface PageTextOptions {
  /**
   * Cancels the read while it waits in the queue, and while it waits for a fallback font: it
   * then rejects with `aborted`, as a cancelled render does. A read that has started on the
   * page's characters runs to the end.
   */
  signal?: AbortSignal
}

/** A destination as the file gives it. */
export type FileDestination =
  /** A page and a fit, with the array's shape. */
  | ExplicitDestination
  /** A named destination: the name's bytes. */
  | { name: Uint8Array }

/** How a destination array's entry after the page is written. */
export type DestinationFitKind = 'name' | 'string' | 'other' | 'missing'

/**
 * How a destination array's first entry is written: a reference to a dictionary, a whole number,
 * anything else, or `missing` for an empty array.
 */
export type DestinationPageKind = 'ref' | 'integer' | 'other' | 'missing'

/** What one argument after the fit holds, read through a reference: a reference to no object is `null`. */
export type DestinationArgKind = 'number' | 'null' | 'other'

/**
 * An explicit destination: a page and a fit, and the shape of the array as the file wrote it, so
 * a caller can check it by its own rules. The engine applies none.
 */
export interface ExplicitDestination {
  /**
   * 0-based, or -1 when it names no page of this file. In a remote go-to's or a launch's
   * destination it names a page of the other file, and is the number the file gives.
   */
  page: number
  /** `'XYZ'`, `'Fit'`, `'FitH'`, `'FitV'`, `'FitR'`, `'FitB'`, `'FitBH'`, `'FitBV'` or `'Unknown'`. */
  fit: string
  /** The four entries after the fit: a number, or `null` where the file has none or no number. */
  args: (number | null)[]
  /**
   * The object the first entry refers to, when it is a reference: its number, and the
   * generation of the object the file holds under that number (0 when it holds none). Absent
   * when the first entry is not a reference.
   */
  pageRef?: { objectNumber: number; generation: number }
  /** The number of entries after the fit, however many. */
  argCount: number
  /** What each of the first 8 entries after the fit holds. */
  argKinds: DestinationArgKind[]
  /** Whether any of those 8 is written as a reference. */
  argIndirect: boolean
  /** How the fit entry is written. */
  fitKind: DestinationFitKind
  /** How the page entry is written. */
  pageKind: DestinationPageKind
}

/** An action as the file gives it. Nothing is decoded, completed or filtered. */
export interface FileAction {
  /** The action's `/S`: `'URI'`, `'GoTo'`, `'GoToR'`, `'Launch'`, `'Named'`, `'JavaScript'` or another name. */
  kind: string
  /** A URI action's `/URI`: its bytes, empty when it is neither a string nor a name. */
  uri?: Uint8Array
  /** Whether a URI action's `/URI` is a string or a name. Absent when it is neither. */
  uriKind?: 'string' | 'name'
  destination?: FileDestination
  /**
   * A remote go-to's or a launch's file: `/F` when it is a string, else the first string of the
   * file specification's `/UF`, `/F`, `/Unix`, `/Mac` and `/DOS`.
   */
  file?: Uint8Array
  /**
   * Whether a remote go-to's or a launch's `/F` is a string or a file specification. Absent when
   * it is neither.
   */
  fileKind?: 'string' | 'spec'
  newWindow?: boolean
  name?: string
  /**
   * A JavaScript action's source. The engine never runs it. It is cut to 4,096 bytes, written as
   * UTF-8 with JSON escapes, and a page's links share 1,048,576 such bytes; once those are spent
   * each later script is empty.
   */
  script?: string
  /** Present, and true, only when `script` was cut. */
  scriptTruncated?: true
}

/** Where a link or an outline item goes, as the file gives it. Any of the three may be present together. */
export interface FileTarget {
  destination?: FileDestination
  action?: FileAction
  /** The additional-actions entry for a mouse press, else for a release. */
  additionalAction?: FileAction
}

/** One entry of a page's annotation array, whatever its kind. */
export interface PageAnnotationEntry {
  index: number
  subtype: string
  flags: number
  /** Absent for an annotation stored as a direct object. */
  objectNumber?: number
  /** The generation of the annotation's object; present with `objectNumber`. */
  generation?: number
  rectOk: boolean
  /** Whether `/QuadPoints` is present and not null, whatever it holds. */
  hasQuads: boolean
  quadsOk: boolean
}

export interface PageLinkFacts extends FileTarget {
  /** Index in the page's annotation array, as in `PageAnnotationEntry`. */
  index: number
  /** The link's rectangle, normalised; all zero when the file's `/Rect` is not well formed. */
  rect: Rect
  /** 8 numbers per quad, as the file has them. */
  quads?: number[]
  /**
   * Present, and true, only when the link has a `/Dest` (`null` included) that is not a string,
   * a name or an array; `destination` is then absent. An array that is no valid destination is
   * given as `destination`, for the caller to check.
   */
  destinationInvalid?: true
}

export interface PageLinks {
  annotations: PageAnnotationEntry[]
  links: PageLinkFacts[]
}

export interface OutlineEntry extends FileTarget {
  title: string
  bold: boolean
  italic: boolean
  /** The file's `/Count`: positive when the item starts expanded. 0 when absent. */
  count: number
  children: OutlineEntry[]
}

export interface Outline {
  items: OutlineEntry[]
  /** The outline was cut short: it loops, nests past 64 levels or has more than 100,000 items. */
  truncated: boolean
}

/**
 * A text string of the file. A string when its bytes are text: PDFDocEncoding, or UTF-16 or UTF-8
 * with a byte order mark. Otherwise `{ bytes }`, the bytes as the file holds them, for the caller
 * to decode or skip. Text is cut after 1,048,576 bytes written as UTF-8 with JSON escapes, and
 * bytes after 524,288; the entry that holds a cut string says `truncated`.
 */
export type FileText = string | { bytes: Uint8Array }

/**
 * A reference to an object of the file: its number, and the generation of the object the file
 * holds under that number (0 when it holds none).
 */
export interface ObjectRef {
  objectNumber: number
  generation: number
}

/**
 * What the file's trailer and `/Info` say about it. Read from the file as it stands: after a
 * `redact`, which removes the metadata, the title and author are gone.
 */
export interface DocumentFacts {
  /** `/Info`'s `/Title`, when it is a string. */
  title?: FileText
  /** `/Info`'s `/Author`, when it is a string. */
  author?: FileText
  /** Whether the trailer has `/Encrypt`. */
  encrypted: boolean
  /**
   * Which password opened the file: `'none'` for a file with no encryption, `'owner'` when the
   * owner password did (an empty one included), `'user'` otherwise. It says how the file was
   * opened, before the engine lifted the permission flags for its own writes.
   */
  openedAs: 'none' | 'user' | 'owner'
  /** Present, and true, only when the title or author was cut. */
  truncated?: true
}

/**
 * The facts an annotation and a form widget share, as the dictionary writes them. Numbers that
 * the file writes as something other than a finite number are `null`. Names are strings of one
 * character per byte of the name, U+0000 to U+00FF.
 */
export interface AppearanceFacts {
  /**
   * `/Rect`'s first four entries as written, corners not put in order. `null` when it is not a
   * list.
   */
  rect: (number | null)[] | null
  /** Whether `/Rect` is exactly four finite numbers. */
  rectOk: boolean
  /** `/F`, 0 when absent. */
  flags: number
  /**
   * Whether there is a normal appearance to draw: `/AP /N` is a stream, or a dictionary whose
   * entry under `/AS` is one.
   */
  hasAppearance: boolean
  /** How `/AP /N` is written: one stream, or a dictionary of states. Absent when it is neither. */
  appearance?: 'stream' | 'states'
  /**
   * The names of the states of `/AP /N`, in byte order; empty unless it is a dictionary of
   * states.
   */
  appearanceStates: string[]
  /** `/AS`, when it is a name. */
  appearanceState?: string
  /**
   * `/BS`: its `/W` and `/S`, each `null` when absent or of the wrong type, and `dash`, its `/D`.
   * `dash` is present when `/D` is there and not null: its entries as written, an empty, negative
   * or all-zero list included, each `null` when it is not a number; `null` when `/D` is not a
   * list.
   */
  borderStyle?: {
    width: number | null
    style: string | null
    dash?: (number | null)[] | null
  }
  /** `/Border`'s first three entries. */
  border?: (number | null)[]
  /**
   * `/Border`'s fourth entry, its dash, read as `borderStyle.dash` is: present when `/Border` has
   * a fourth entry, `null` when that entry is not a list.
   */
  borderDash?: (number | null)[] | null
}

/**
 * One annotation dictionary of a page's `/Annots`, whatever its kind. The engine lists every one
 * and decides nothing: which to show, what a flag means and what a colour of five components is
 * are the caller's. An optional key is present only when the file has the entry in the right type.
 */
export interface AnnotationFacts extends AppearanceFacts {
  /** The annotation's place in `/Annots`, counting entries that are not dictionaries. */
  index: number
  /** `/Subtype`; empty when it has none, or when the report's 16 MB ran out before it. */
  subtype: string
  /** Absent for an annotation stored as a direct object. */
  objectNumber?: number
  /** The generation of the annotation's object; present with `objectNumber`. */
  generation?: number
  /** `/QuadPoints`, flat, as written. */
  quads?: (number | null)[]
  /** `/C`, any number of components. */
  color?: (number | null)[]
  /** `/IC`, any number of components. */
  interiorColor?: (number | null)[]
  /** `/CA`. */
  opacity?: number | null
  /** `/Contents`. */
  contents?: FileText
  /** `/T`. */
  author?: FileText
  /** `/CreationDate`, as written. */
  created?: FileText
  /** `/M`, as written. */
  modified?: FileText
  /** `/Name`. */
  icon?: string
  /** `/IRT`, when it is a reference. It may name the annotation itself. */
  inReplyTo?: ObjectRef
  /** `/IT`. */
  intent?: string
  /** `/L`. */
  line?: (number | null)[]
  /** `/LE`; an entry that is not a name is `null`. */
  lineEndings?: (string | null)[]
  /** `/Vertices`, flat. */
  vertices?: (number | null)[]
  /** `/InkList`, each path flat; a path that is not a list is `null`. */
  inkLists?: ((number | null)[] | null)[]
  /** `/DA`, the annotation's own. */
  defaultAppearance?: FileText
  /** `/Q`, the annotation's own. */
  alignment?: number | null
  /** Present, and true, when the annotation has `/PMD`. */
  paperMetadata?: true
  /** `/Parent`, when it is a reference. */
  parent?: ObjectRef
  /**
   * Present, and true, when this entry was cut: a string past its cap, `/QuadPoints`,
   * `/Vertices` and `/InkList` past 1,000,000 numbers in all, or the report's 16 MB spent.
   */
  truncated?: true
}

export interface PageAnnotations {
  /** The page's `/Tabs`, when it is a name. */
  tabs?: string
  /** One entry for each dictionary in `/Annots`, in order. */
  annotations: AnnotationFacts[]
  /** The list was cut short: past 200,000 annotations or 16 MB of report. */
  truncated: boolean
}

/** A widget's own `/A`, its first action only. */
export interface FieldAction {
  /** `/S`. */
  kind: string
  /** A URI action's `/URI`: its bytes, empty when it is neither a string nor a name. */
  uri?: Uint8Array
  /** A Named action's `/N`, empty when it is not a name. */
  name?: string
  /**
   * A ResetForm action: `/Fields` entries written as strings in `fields`, those written as
   * references in `refs` (whatever they refer to), and `/Flags`.
   */
  reset?: { fields: FileText[]; refs: ObjectRef[]; flags: number }
  /**
   * What a Launch or GoToR action's `/F` is: a string, a file specification dictionary, or
   * anything else. Absent when `/F` is absent or null.
   */
  fileKind?: 'string' | 'spec' | 'other'
  /** `/F`'s bytes, when it is a string. */
  file?: Uint8Array
  /** The file specification's `/F`, when `/F` is one and its `/F` is a string. */
  specFile?: Uint8Array
  /** The file specification's `/UF`, when `/F` is one and its `/UF` is a string. */
  specUnicodeFile?: Uint8Array
}

/**
 * One widget of a field: the annotation the field is drawn and filled through. An optional key is
 * present only when the file has the entry in the right type.
 */
export interface WidgetFacts extends AppearanceFacts {
  /** The index of the page whose `/Annots` holds the widget, or -1 when no page does. */
  page: number
  /** The widget's place in that page's `/Annots`, or -1 when no page holds it. */
  index: number
  /** Absent for a widget stored as a direct object. */
  objectNumber?: number
  /** The generation of the widget's object; present with `objectNumber`. */
  generation?: number
  /** A checkbox's or radio's on-state: the first state of `/AP /N` that is not `Off`. */
  onState?: string
  /**
   * A checkbox's or radio's export value: its `/Opt` entry when the field has `/Opt`, else
   * `onState`.
   */
  exportValue?: string
  /** `/MK /BC`, any number of components. */
  borderColor?: (number | null)[]
  /** `/MK /BG`, any number of components. */
  backgroundColor?: (number | null)[]
  /** `/MK /R`. */
  rotation?: number | null
  /** `/MK /CA`. */
  caption?: FileText
  /** The widget's own `/Rotate`: a number, or `null` when it is something else. */
  rotate?: number | null
  /**
   * The widget's own `/Opt`, for a checkbox's or radio's widget whose dictionary is not the
   * field's, read as `FieldFacts.toggleOptions` is. Absent when it has none.
   */
  toggleOptions?: (FileText | FieldValueName | null)[] | null
  /**
   * The widget's own `/I`, not inherited, for a list's or combo box's widget whose dictionary is
   * not the field's, read as `FieldFacts.selectedIndices` is. Absent when it has none.
   */
  selectedIndices?: (number | null)[] | null
  /** `/Q`, inherited along `/Parent`. */
  alignment?: number | null
  /** The widget's own `/TU`. */
  tooltip?: FileText
  /** `/DA`, inherited along `/Parent`. */
  defaultAppearance?: FileText
  /** Present, and true, when the widget has `/PMD`. */
  paperMetadata?: true
  /**
   * JavaScript sources by additional-action key (`K`, `F`, `V`, `C`, `Fo`, `Bl`, `D`, `U`, …),
   * each in the order its action chain gives them, and `A` for the widget's own `/A`. A key is
   * taken from the nearest dictionary along `/Parent`, the widget first, whose action under it
   * holds JavaScript. Nothing runs them.
   */
  scripts: Record<string, string[]>
  action?: FieldAction
  /**
   * Present, and true, when this entry was cut: a string or script past its cap, or the report
   * spent.
   */
  truncated?: true
}

/**
 * A name inside a field's value list, told apart from text by its key. Its characters are the
 * name's bytes, U+0000 to U+00FF, as a single name value's are.
 */
export interface FieldValueName {
  name: string
}

/**
 * A text string, a name, or a list, as `FieldFacts.valueKind` says. A list holds text strings,
 * names as `{ name }`, and `null` for any other entry.
 */
export type FieldValue = FileText | (FileText | FieldValueName | null)[]

/** How a field's `/V` or `/DV` is written: absent or null, a string, a name, a list, or other. */
export type FieldValueKind = 'none' | 'string' | 'name' | 'array' | 'other'

/** One field of the form, with its widgets. */
export interface FieldFacts {
  /** The full name, its parts joined with dots. */
  name: string
  /** Absent for a field stored as a direct object. */
  objectNumber?: number
  /** The generation of the field's object; present with `objectNumber`. */
  generation?: number
  /** `'acroform'` when `/Fields` reaches it, `'recovered'` when only a page's widget does. */
  origin: 'acroform' | 'recovered'
  /** The kind `/FT` and `/Ff` give it, inherited. */
  kind:
    'text' | 'checkbox' | 'radio' | 'button' | 'combo' | 'list' | 'signature' | 'unknown'
  /** `/Ff`, inherited. */
  flags: number
  valueKind: FieldValueKind
  /**
   * `/V`, inherited: the text of a string, the name, or a list whose strings are text, whose
   * names are `{ name }` and whose other entries are `null`. Absent for `none` and `other`. A
   * name the report's 16 MB could not take is left out of a single value and `null` in a list,
   * and the field says `truncated`.
   */
  value?: FieldValue
  /**
   * Present, and true, when `/V` is there and null: the nearest dictionary along `/Parent` that
   * has `/V` gives null. `valueKind` is then `'none'`; without this key a `'none'` value is absent.
   */
  valueNull?: true
  defaultValueKind: FieldValueKind
  /** `/DV`, read as `value` is. */
  defaultValue?: FieldValue
  /** Present, and true, when `/DV` is there and null, as `valueNull` is for `/V`. */
  defaultValueNull?: true
  /**
   * `/I`, read along `/Parent` as `/V` is, for a field of any kind: its entries as written, each
   * `null` when it is not a number; `null` when `/I` is not a list. Absent when no dictionary has
   * `/I` or it is null. Nothing reconciles it with `value` or `options`.
   */
  selectedIndices?: (number | null)[] | null
  /**
   * Beside `selectedIndices`: whether the field's own dictionary holds `/I`. `false` when it came
   * from a dictionary up `/Parent`.
   */
  selectedIndicesOwn?: boolean
  /** A choice field's `/Opt`. */
  options?: { exportValue: string; displayValue: string }[]
  /**
   * A checkbox's or radio's `/Opt`, read along `/Parent` as `/V` is: its text strings as text,
   * its names as `{ name }`, any other entry `null`, at most 1,000,000 entries. `null` when `/Opt`
   * is not a list; absent when no dictionary has it or it is null.
   */
  toggleOptions?: (FileText | FieldValueName | null)[] | null
  /** A text field's `/MaxLen`, when it is not 0. */
  maxLength?: number
  /** A list box's `/TI`. */
  topIndex?: number
  /** The field dictionary's own `/TU`. */
  tooltip?: FileText
  /**
   * The place of the field's dictionary in the walk of the field tree `FormFacts.groups`
   * describes. Absent when the walk did not reach it: a recovered field, or one past a cap.
   */
  walkIndex?: number
  /** The field dictionary's own `/T`, as `FieldTreeEntry.partialName`; only with `walkIndex`. */
  partialName?: FileText | null
  /** As `FieldTreeEntry.otherParent`, for the entry the walk reached it through. */
  otherParent?: true
  /** The widgets, in the order the field lists them. */
  widgets: WidgetFacts[]
  /** Present, and true, when this entry or one of its widgets was cut. */
  truncated?: true
}

/**
 * One entry of a field dictionary's `/Kids`, or of `/AcroForm /Fields`, as the file lists it.
 * The keys after `dictionary` are present only when the entry resolves to a dictionary.
 */
export interface FieldTreeEntry {
  /** The entry as a reference; `null` when it is written as a direct object. */
  ref: ObjectRef | null
  /** Whether the entry resolves to a dictionary. */
  dictionary: boolean
  /** Whether the dictionary has the key `/Kids`, whatever it holds. */
  hasKids?: boolean
  /**
   * The dictionary's own `/T`, present whenever it has the key: its text when it is a string
   * (`''` for an empty one), `null` when it is anything else, a reference to an object the file
   * lacks included.
   */
  partialName?: FileText | null
  /**
   * Present, and true, when the dictionary's `/Parent` is not the dictionary whose `/Kids` lists
   * it, no `/Parent` included. For an entry of `/Fields`: when it has a `/Parent` at all.
   */
  otherParent?: true
}

/**
 * A dictionary of the field tree that has a `/Kids` list: a parent of fields, a field's own
 * dictionary above its widgets, a dictionary the form leaves out (with no name, or past its 33
 * levels), or a second dictionary of a full name the form already has, which the form merges into
 * the first. An optional key is present only when the file has the entry in the right type.
 */
export interface FieldGroupFacts {
  /** The full name: the `/T` of the dictionary and of its `/Parent` chain, empty ones left out. */
  name: string
  /** Absent for a dictionary written as a direct object. */
  objectNumber?: number
  /** The generation of the dictionary's object; present with `objectNumber`. */
  generation?: number
  /**
   * Its place in the walk: `/Fields` depth first, each list in the file's order, a dictionary
   * then its `/Kids`, each dictionary the first time it is reached, widgets and direct entries
   * included. The `walkIndex` values of the groups and the fields, sorted, give the order.
   */
  walkIndex: number
  /** The index in `FormFacts.fields` of the field whose own dictionary this is. */
  field?: number
  /** The dictionary's own `/T`, as `FieldTreeEntry.partialName`. */
  partialName?: FileText | null
  /** As `FieldTreeEntry.otherParent`, for the entry the walk reached it through. */
  otherParent?: true
  /** `/Subtype`, when it is a name. */
  subtype?: string
  /** `/Kids` in the file's order, at most 50,000 entries. */
  kids: FieldTreeEntry[]
  /** Its own `/MK /BC`, any number of components. */
  borderColor?: (number | null)[]
  /** Its own `/MK /BG`, any number of components. */
  backgroundColor?: (number | null)[]
  /** Its own `/MK /R`. */
  rotation?: number | null
  /** Its own `/MK /CA`. */
  caption?: FileText
  /** Its own `/Rotate`: a number, or `null` when it is something else. */
  rotate?: number | null
  /** The index of the page `/P` names, -1 when that is no page of the file. Absent without `/P`. */
  page?: number
  /**
   * JavaScript sources by additional-action key, read as a widget's are: each key from the
   * nearest dictionary along `/Parent`, this one first, whose action under it holds JavaScript,
   * and `A` for its own `/A`. Its kids' scripts are not in it.
   */
  scripts: Record<string, string[]>
  /** Present, and true, when this entry was cut: its `/Kids` past 50,000, or the report spent. */
  truncated?: true
}

/** The file's interactive form. */
export interface FormFacts {
  /** `'none'` without `/AcroForm`, `'xfa'` when it has `/XFA`, else `'acroform'`. */
  kind: 'none' | 'acroform' | 'xfa'
  /** `/AcroForm /NeedAppearances`. */
  needAppearances: boolean
  /** `/AcroForm /DA`. */
  defaultAppearance?: FileText
  /** `/AcroForm /Q`. */
  alignment?: number | null
  /**
   * The fields: the `/Fields` tree merged by full name, then fields whose widgets only a page's
   * `/Annots` reaches. A field with no name is left out. Empty when `tooLarge`.
   */
  fields: FieldFacts[]
  /**
   * Every dictionary of the field tree that has a `/Kids` list, in the order of the walk
   * `FieldGroupFacts.walkIndex` describes. Empty when `tooLarge`.
   */
  groups: FieldGroupFacts[]
  /**
   * `/AcroForm /Fields` in the file's order, at most 50,000 entries, so the walk can be done again
   * from the root. Empty without `/Fields`, and when `tooLarge`.
   */
  fieldsRoot: FieldTreeEntry[]
  /**
   * One entry for each entry of `/AcroForm /CO`: the index in `fields` of the field whose full
   * name it has, or -1.
   */
  calculationOrder: number[]
  /** The same entries as references; `null` for one that is not a reference. */
  calculationOrderRefs: (ObjectRef | null)[]
  /** The deepest level of `/Fields` and `/Kids`, 1 for a top-level field. */
  fieldTreeDepth: number
  /** Whether the field tree reaches a dictionary or a `/Kids` list twice: a loop, or one shared. */
  fieldTreeRevisits: boolean
  /**
   * The form was refused, not cut short: its tree, with the widgets outside it, holds more than
   * 50,000 fields. `fields` is empty; `/CO` is still read.
   */
  tooLarge: boolean
  /**
   * The report was cut short: past 50,000 fields or `/CO` entries, past 1,000 levels of tree,
   * past its share of 16 MB, or past the work it may spend reading scripts.
   */
  truncated: boolean
}

/** Options for `EngineDocument.renderPage`. */
export interface RenderOptions {
  /**
   * Pixels per user-space unit, which is a PDF point unless the page has a /UserUnit. Default 1
   * when there is no `size`. It must be a finite number above 0. A scale that gives a bitmap of
   * more than 268,435,456 pixels is a `RangeError`. Not with `size`.
   */
  scale?: number
  /**
   * Cancels the render while it waits in the queue, and stops it once it has started: it then
   * rejects with `aborted` and delivers no pixels. How soon depends on the page: usually within
   * one step of about 8 ms, and tens of milliseconds on a heavy page. A render that finishes
   * before the abort is seen still resolves. Every other call that has started runs to the end.
   */
  signal?: AbortSignal
  /**
   * Let every waiting call that is not background run before this render. A call that is
   * already running is never interrupted, and background calls keep their order among
   * themselves. Default false. For a draw nobody is waiting on, such as a thumbnail.
   */
  background?: boolean
  /**
   * Draw the page's annotations, form widgets included. Default true. With false only the
   * page's own content is drawn, so a caller that paints annotations itself does not draw them
   * twice.
   */
  annotations?: boolean
  /**
   * The part of the page to draw, in user space. Default: the whole page box. The part outside
   * the page box is white. Its width and height must be finite and above 0.
   */
  region?: Rect
  /**
   * The exact bitmap size in pixels, each a whole number from 1. The region is stretched to fill
   * it, so its two sides may scale differently. Not with `scale`.
   */
  size?: { width: number; height: number }
  /** A turn clockwise on top of the page's /Rotate. Default 0. */
  rotation?: 0 | 90 | 180 | 270
  /**
   * Annotations on this page whose appearance is not drawn, each by its object number (a whole
   * number from 1) or by its place in the page's `/Annots` (`{ index }`, a whole number from 0
   * below 2,147,483,648), which is the only way to name one stored as a direct object. At most
   * 1,000,000 of them. The document is not changed, so a later `save` is as it would have been.
   */
  hide?: readonly (number | { index: number })[]
}

/** Options for `EngineDocument.renderAnnotations`. */
export interface AnnotationRenderOptions {
  /**
   * The annotations to draw, in the order given, each by its place in the page's `/Annots`. A
   * `state` is the name of a state of `/AP /N` to draw, one character per byte of the name
   * (U+0001 to U+00FF), at most 65,535 of them, as `AnnotationFacts.appearanceStates` gives it;
   * without one, the state `/AS` selects is drawn. At most 1,000,000 entries.
   */
  annotations: readonly { index: number; state?: string }[]
  /** The part of the page to draw, in user space, as for `renderPage`. */
  region: Rect
  /** The bitmap size in pixels, each a whole number from 1. The region is stretched to fill it. */
  size: { width: number; height: number }
  /** A turn clockwise on top of the page's /Rotate. Default 0. */
  rotation?: 0 | 90 | 180 | 270
  /**
   * Cancels the call while it waits in the queue, and stops it between annotations once it has
   * started: it then rejects with `aborted` and delivers no pixels.
   */
  signal?: AbortSignal
}

/**
 * Annotations drawn alone. With the same region, size and rotation, the bitmap lines up pixel for
 * pixel with `renderPage`'s, and like it leaves out what falls past the page box. An annotation
 * the page render skips but the draw does not (one flagged NoView, or of an unknown type flagged
 * Invisible) shows here and not on the page.
 */
export interface RenderedAnnotations {
  /** Width in pixels. */
  width: number
  /** Height in pixels. */
  height: number
  /**
   * Straight (not premultiplied) RGBA, four bytes per pixel, rows top to bottom with no padding,
   * transparent (all four bytes 0) where nothing was drawn. The array belongs to the caller.
   */
  data: Uint8ClampedArray
  /**
   * The places in `/Annots` of the entries drawn, in the order drawn. An entry is left out when
   * nothing was drawn for it: no annotation dictionary at that place, a hidden annotation, a
   * popup, no rectangle, a state its `/AP /N` lacks, or no appearance the engine can make
   * without writing one into the file. Other flags are not read: an annotation flagged NoView,
   * or of an unknown type flagged Invisible, is drawn, though `renderPage` skips it.
   */
  drawn: number[]
}

/** One source of the document's `/Names /JavaScript` tree. */
export interface DocumentScript {
  /** The name it is listed under; `null` when the tree's key is not a string. */
  name: FileText | null
  source: string
}

/**
 * The file's JavaScript outside its form fields, as source text that nothing runs. A field's
 * scripts are in `WidgetFacts.scripts`. Script keys are the file's own: `OpenAction` for the
 * catalog's open action, and each additional-action key (`WC`, `WS`, `DS`, `WP`, `DP`; `O` and `C`
 * on a page) as the file writes it.
 */
export interface ScriptFacts {
  /** The `/Names /JavaScript` tree in its order, one entry for each source of each name's chain. */
  document: DocumentScript[]
  /** The catalog's `/OpenAction`, when it holds JavaScript, and `/AA`, by key. */
  documentActions: Record<string, string[]>
  /**
   * Each page whose `/AA` holds JavaScript, with its sources by key. Pages are in ascending order,
   * each listed once.
   */
  pageActions: { page: number; scripts: Record<string, string[]> }[]
  /**
   * The report was cut short: a source past 4 MB, a name tree past 1,000 levels or 50,000 names,
   * a chain past 1,000 objects, or past 16 MB of report or the work it may spend.
   */
  truncated: boolean
}

/** The order a page's structure tree gives its annotations. */
export interface StructureOrder {
  /**
   * Object numbers of the page's annotations in the order the structure tree reaches them, each
   * once. Annotations the tree does not reach are not listed; with no structure tree, none are.
   */
  order: number[]
  /** The walk was cut short: past 1,000 levels deep or 1,000,000 objects. */
  truncated: boolean
}

/**
 * A rendered page. The bitmap is in displayed orientation, after /Rotate and any `rotation`. Its
 * width and height are the `size` asked, or else the displayed size of the region times the
 * scale, rounded up to whole pixels.
 */
export interface RenderedPage {
  /** Width in pixels. */
  width: number
  /** Height in pixels. */
  height: number
  /**
   * Straight (not premultiplied) RGBA, four bytes per pixel, rows top to bottom with no
   * padding. The page is drawn on white, so every alpha byte is 255. The array belongs to the
   * caller; the engine keeps no reference to it.
   */
  data: Uint8ClampedArray
  /**
   * Fallback fonts this page needed and did not get: no entry in `fallbackFonts`, or the fetch
   * failed or ran out of time. Empty when none.
   */
  missingFonts: readonly FontKey[]
}

/**
 * A fallback font, for text whose font is not in the file: one for each script that needs its
 * own, and `default` for the rest that a file can name without embedding, such as Cyrillic and
 * Greek.
 */
export type FontKey =
  'japanese' | 'simplified-chinese' | 'traditional-chinese' | 'korean' | 'default'

/**
 * How `save` writes the document. `'rewrite'` writes the whole file anew. `'incremental'`
 * keeps the original bytes as they are and appends the changes after them.
 */
export type SaveMode = 'rewrite' | 'incremental'

/** Options for `EngineDocument.save`. */
export interface SaveOptions {
  /**
   * Default `'incremental'` when the document holds a digital signature, so the signature stays
   * verifiable, and `'rewrite'` otherwise. An empty signature field, still to be signed, does not
   * count.
   */
  mode?: SaveMode
}

/** One of the twelve core faces every PDF reader provides, by name. */
export type StandardFont =
  | 'Helvetica'
  | 'Helvetica-Bold'
  | 'Helvetica-Oblique'
  | 'Helvetica-BoldOblique'
  | 'Times-Roman'
  | 'Times-Bold'
  | 'Times-Italic'
  | 'Times-BoldItalic'
  | 'Courier'
  | 'Courier-Bold'
  | 'Courier-Oblique'
  | 'Courier-BoldOblique'

/**
 * How an annotation looks: a rectangle of drawing operators and the resources they name.
 * Everything is in PDF user space, in points, origin at the bottom left, before /Rotate.
 */
export interface Appearance {
  /**
   * The area the drawing fills, in the page's user space. Its width and height must be above 0:
   * a box with no area is a `RangeError` naming the annotation.
   */
  bounds: Rect
  /** PDF drawing operators. They paint inside `bounds` and may name the resources below. */
  content: Uint8Array
  /** Fonts the operators use, keyed by the name they call each one. */
  fonts?: Record<string, StandardFont>
  /** Opacity settings the operators use, keyed by name. Each value is from 0 to 1. */
  opacities?: Record<string, { fill?: number; stroke?: number }>
  /** Images the operators paint, keyed by name. */
  images?: Record<string, { format: 'png' | 'jpeg'; data: Uint8Array }>
  /** Pages of the same document whose content the operators paint, as name to page index. */
  pages?: Record<string, number>
  /**
   * Nested drawings the operators paint, keyed by name. One with `group` set is drawn as a unit,
   * as a transparency group, so overlapping parts blend as one picture.
   */
  forms?: Record<string, Appearance & { group?: boolean }>
}

/** An annotation already in the document, by the page it is on and its object number. */
export interface AnnotationRef {
  /** Page index, counting from 0. */
  page: number
  /** The object number of the annotation's dictionary in the file. */
  objectNumber: number
}

/** One annotation for `EngineDocument.write` to add to a page. */
export interface WriteAnnotation {
  /** Page index, counting from 0. */
  page: number
  /**
   * The annotation in Gloss form. Its dictionary entries are written from this, so other
   * programs can read and edit it. An annotation with `inReplyTo` is written as a reply: a hidden
   * note linked to its parent. The parent must come earlier in `WriteInput.annotations` of the
   * same call, unless `replyTo` names the parent instead. A reply whose parent comes later, or
   * not at all, rejects with `write-failed` naming the reply.
   */
  annotation: GlossAnnotation
  /**
   * An annotation already in the document that this one replies to. When given, the annotation
   * is written as a reply to it, a hidden note linked to it with no appearance, whatever its
   * `inReplyTo` says. One that names no annotation on that page, such as one removed by the
   * same call, rejects with `write-failed` naming the reply.
   */
  replyTo?: AnnotationRef
  /**
   * How the annotation looks. Its `bounds` become the annotation's rectangle. Required for
   * everything but a reply, which has none.
   */
  appearance?: Appearance
  /** Text stored with the annotation, for the caller to read back later. */
  data: string
}

/**
 * A form value for `EngineDocument.write`. A name the form lacks, or a value its field cannot
 * take, rejects with `write-failed` naming the field.
 */
export interface WriteField {
  /**
   * The field's value. A string for a text field or a combo box: one of the combo's options'
   * export values, or any text when the combo takes text of its own, or `''` to clear it. For a checkbox or a radio
   * group, the state name of the button to turn on, or `'Off'` for none. For a list box, the
   * selected options' export values, as a list: at most one unless it takes several, and an
   * empty list for none.
   */
  value: string | readonly string[]
  /**
   * What a text field or combo box shows in place of the value, when it differs, such as
   * `'$1,234.50'` for `'1234.5'`. Other fields take none.
   */
  text?: string
}

/** What `EngineDocument.write` writes into the document. */
export interface WriteInput {
  /** Annotations already in the document to remove. */
  remove?: readonly AnnotationRef[]
  /**
   * Annotations to add, each appended to its page in the order given. A reply comes after the
   * annotation it replies to.
   */
  annotations?: readonly WriteAnnotation[]
  /** Form values to set, by full field name: parent names and the field's own, joined by dots. */
  fields?: Readonly<Record<string, WriteField>>
}

/** What `EngineDocument.redact` applies and writes. */
export interface RedactInput {
  /** File annotations to remove first, such as Inkbar's earlier copies, as in `WriteInput`. */
  remove?: readonly AnnotationRef[]
  /**
   * The marks: Gloss `redact` annotations. Each one removes what lies under its `quads`, or
   * under its `rect` when it has none. Its `appearance` is the overlay left in its place.
   */
  marks: readonly WriteAnnotation[]
  /** Annotations written after the apply, as in `WriteInput`. */
  annotations?: readonly WriteAnnotation[]
  /**
   * Form values written after the apply, as in `WriteInput`. A field whose widgets a mark
   * removed is skipped and named in `RedactResult.fieldsSkipped`.
   */
  fields?: Readonly<Record<string, WriteField>>
}

/** What `EngineDocument.redact` did. It holds counts and flags, never text from the file. */
export interface RedactResult {
  /**
   * The pages where marks were applied, in page order: the marks applied there, Inkbar's
   * earlier locked marks included, and the other annotations the marks removed, pop-ups
   * included.
   */
  pages: { page: number; marks: number; annotationsRemoved: number }[]
  /**
   * Inkbar's own earlier marks applied where they came back locked, in an encrypted file. They
   * are told apart from other programs' marks by the data Inkbar stores with them.
   */
  ownLockedMarks: number
  /**
   * The regions of those marks, one entry per page where they were applied, in page order:
   * each mark's /QuadPoints, or its /Rect when it has none. Empty when there were none. Pass
   * them to `checkRedaction` with the marks given, to check what they removed.
   */
  ownLockedRegions: { page: number; quads: Quad[] }[]
  /** Redact annotations from other programs, left in the file unapplied. */
  foreignMarks: number
  /** The names of the `fields` skipped because a mark removed their widgets. */
  fieldsSkipped: string[]
  /** What sanitising found and removed from the file. */
  sanitised: {
    /** The document information dictionary or XMP metadata. */
    metadata: boolean
    /** The number of attached files. */
    attachments: number
    /** JavaScript: document scripts and script actions. */
    scripts: boolean
    /** Page thumbnails. */
    thumbnails: boolean
    /** Private application data (/PieceInfo) and links to full-resolution originals. */
    privateData: boolean
  }
  /** Whether the file as opened has layers that are hidden. They are not cleaned. */
  hiddenLayers: boolean
  /** Whether the file as opened holds a digital signature, which stops verifying. */
  signed: boolean
}

/** A place `Engine.checkRedaction` looks under: one mark's quads on a page. */
export interface RedactionRegion {
  /** Page index, counting from 0. */
  page: number
  /**
   * The quads the region covers, in PDF user space: Gloss quads, `p1` top left, `p2` top right,
   * `p3` bottom left and `p4` bottom right. At least one.
   */
  quads: readonly Quad[]
}

/** Options for `Engine.checkRedaction`. */
export interface CheckRedactionOptions {
  /** Password for an encrypted file. An empty string counts as no password. */
  password?: string
  /**
   * The regions to check. Each must be clean. Without them the check looks for candidates
   * itself: Redact annotations, filled boxes and annotations drawn as opaque boxes.
   *
   * With regions the check trusts the `/INKB_Overlay` tag an apply puts on the overlay it leaves,
   * and counts nothing inside a tagged form. Any file can carry that tag, so a check with regions
   * proves nothing about a file the engine did not just produce. Check a file from elsewhere
   * without regions.
   */
  regions?: readonly RedactionRegion[]
  /** Cancels the call while it waits in the queue. */
  signal?: AbortSignal
}

/** A place the check looked under, and what it found there. */
export interface RedactionCandidate {
  /** Page index, counting from 0. */
  page: number
  /**
   * For `kind: 'region'`, the index of the region this candidate answers in the `regions` list
   * given. Absent for every other kind.
   */
  region?: number
  /** The place, in PDF user space: the bounds of a region's quads, or of a candidate. */
  rect: Rect
  /**
   * `region`: one of the regions given. `redact-annotation`: a Redact annotation in the file.
   * `filled-box`: an opaque filled rectangle in the page content. `annotation-box`: a Square,
   * Highlight or Stamp annotation drawn as an opaque filled rectangle.
   */
  kind: 'region' | 'redact-annotation' | 'filled-box' | 'annotation-box'
  /** Text that text extraction can read under it, in the page, a form, an annotation or a pattern. */
  text: 'none' | 'present'
  /** Image samples under it that are not one flat value. */
  image: 'none' | 'present'
  /** Vector paths or shadings crossing it. Always `none` for a filled box or an annotation box. */
  drawing: 'none' | 'present'
  /**
   * `unapplied`: a Redact annotation with content under it. `content-remains`: any other
   * candidate with content under it. `clean`: nothing found under it.
   */
  verdict: 'clean' | 'content-remains' | 'unapplied'
}

/** What `Engine.checkRedaction` found. It holds places, counts and flags, never text from the file. */
export interface RedactionFindings {
  /**
   * Page by page; on a page, regions in the order given, or candidates in the file's order. A
   * region's candidate names its place in the list given in `region`.
   */
  candidates: RedactionCandidate[]
  file: {
    /** Revisions kept before the last one, which may hold the original content. */
    earlierVersions: number
    /** Whether the file has a document information dictionary or XMP metadata. */
    metadata: boolean
    /** The number of attached files. */
    attachments: number
    /** Whether the file holds JavaScript or script actions. */
    scripts: boolean
    /** Whether the file has layers that are hidden. */
    hiddenLayers: boolean
    /** Whether the file holds a digital signature. */
    signed: boolean
  }
}
