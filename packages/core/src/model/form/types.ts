import type { Rect } from '../geometry'

/**
 * A field's value: a string (text, combo, single-select list, and the appearance-state name of a
 * checkbox or radio, `"Off"` included), the selected options of a multi-select list in option
 * order, or the id of the annotation that visually signs a signature field.
 */
export type FieldValue = string | readonly string[] | { readonly signature: string }

/** Values keyed by full field name (`/T` parts joined with `.`). */
export type FieldValues = Readonly<Record<string, FieldValue>>

export type FormFieldType =
  'text' | 'checkbox' | 'radio' | 'combo' | 'list' | 'button' | 'signature'

/** `/Ff` bits, each false where it does not apply to the field's type. */
export interface FieldFlags {
  readOnly: boolean
  required: boolean
  noExport: boolean
  multiline: boolean
  password: boolean
  comb: boolean
  fileSelect: boolean
  doNotSpellCheck: boolean
  doNotScroll: boolean
  multiSelect: boolean
  editable: boolean
  radiosInUnison: boolean
}

/**
 * For a choice field, `value` is the export value and `label` the display text. For a checkbox
 * or radio, `value` is a widget's appearance-state name and `label` its export value.
 */
export interface FieldOption {
  value: string
  label: string
}

export interface WidgetAppearance {
  font?: { family: string; fontWeight?: 'bold'; fontStyle?: 'italic' }
  /** Points; 0 means auto size. */
  fontSize: number
  /** Upper-case `#RRGGBB`, as `pdfColorToHex` gives it. */
  color?: string
  align: 'left' | 'center' | 'right'
  border?: {
    /** Upper-case `#RRGGBB`. */
    color?: string
    width: number
    style: 'solid' | 'dashed' | 'beveled' | 'inset' | 'underline'
  }
  /** Upper-case `#RRGGBB`. */
  background?: string
  /** A push button's `/MK /CA`. */
  caption?: string
  /** A checkbox or radio's `/MK /CA`: the ZapfDingbats character drawn when on. */
  checkStyle?: string
  /** A checkbox or radio widget has its own on appearance: `/AP /N` holds its on state. */
  onAppearance?: boolean
  /** A checkbox or radio widget has its own off appearance: `/AP /N` holds `Off`. */
  offAppearance?: boolean
  /**
   * The file has an `/AP /N` appearance for the widget (a checkbox or radio: for its current
   * `/AS`). Without one, PDF.js draws nothing for it unless it makes one from the value.
   */
  fileAppearance?: boolean
}

export type WidgetAction =
  | { kind: 'reset'; fields: string[]; include: boolean }
  | {
      kind: 'submit'
      url: string
      fields: string[]
      include: boolean
      format: 'fdf' | 'xfdf' | 'html' | 'pdf'
      method?: 'GET' | 'POST'
    }
  | { kind: 'uri'; url: string; newWindow?: boolean }
  | { kind: 'named'; name: string }
  | { kind: 'goto'; page: number }

export interface FormWidget {
  /** The PDF.js annotation id, such as `12R`. */
  id: string
  page: number
  /** User space, before the page's /Rotate. */
  rect: Rect
  /** `/MK /R`. */
  rotation: 0 | 90 | 180 | 270
  /** A checkbox or radio widget's on appearance state. */
  onState?: string
  /** Not drawn on screen: `/F` Hidden or NoView, or a barcode field Inkbar cannot draw. */
  hidden: boolean
  /** `/F` NoView with Print: drawn only when printed. Such a widget is also `hidden`. */
  printOnly: boolean
  appearance: WidgetAppearance
  action?: WidgetAction
  /**
   * The URL a JavaScript `/A`'s `app.launchURL` opens, as PDF.js reads it out of the script.
   * Followed on Action only when the form runs no scripts, such as when the sandbox failed to
   * load; with scripts running, the script opens it itself.
   */
  fallback?: WidgetAction
  /**
   * The GoTo, URI, Named, ResetForm and SubmitForm actions in the `/A`'s `/Next` chain, in
   * order. They run on Action after the widget's scripts and its own action, whether or not
   * scripts run, in the same undo step. JavaScript anywhere in the chain runs first, with the
   * widget's other Action scripts (PDF.js collects them into one), so its position in the
   * chain is not kept: a GoTo whose `/Next` is JavaScript runs the script, then the GoTo.
   */
  next?: readonly WidgetAction[]
  hasScripts: boolean
}

export interface FormField {
  /** Full name: `/T` parts joined with `.`. */
  name: string
  type: FormFieldType
  flags: FieldFlags
  maxLength?: number
  options: readonly FieldOption[]
  defaultValue?: FieldValue
  value?: FieldValue
  /** `/TU`. */
  tooltip?: string
  /** In page order, as the file lists them. */
  widgets: readonly FormWidget[]
  signed?: 'certificate'
  /** Nothing may change the value: certificate-signed, locked by a signature, or unsupported. */
  locked: boolean
}

/** Script-driven state for one widget. Absent keys leave the PDF's own state. */
export interface WidgetOverride {
  hidden?: boolean
  readOnly?: boolean
  required?: boolean
  /** Lower-case `#rrggbb`, or `transparent` for none. */
  textColor?: string
  fillColor?: string
  strokeColor?: string
  /** Points; 0 means auto size. */
  textSize?: number
}

/** An event the form layer sends a widget's scripts. */
export interface FormEvent {
  widget: string
  name:
    | 'Keystroke'
    | 'Format'
    | 'Validate'
    | 'Focus'
    | 'Blur'
    | 'Mouse Enter'
    | 'Mouse Exit'
    | 'Mouse Down'
    | 'Mouse Up'
    | 'Action'
  value?: string | string[]
  change?: string
  selStart?: number
  selEnd?: number
  willCommit?: boolean
  commitKey?: number
}

/** Something a form asks the host to do. Inkbar itself never sends, opens, mails or prints. */
export type FormAction =
  | {
      kind: 'submit'
      url: string
      fields: FieldValues
      format: 'fdf' | 'xfdf' | 'html' | 'pdf'
      method?: 'GET' | 'POST'
    }
  | { kind: 'open-url'; url: string; newWindow: boolean }
  | {
      kind: 'mail'
      to?: string
      cc?: string
      bcc?: string
      subject?: string
      body?: string
      withData: boolean
    }
  | { kind: 'print' }
  | { kind: 'prompt'; message: string }

/**
 * What changed the values reported to a controlled host, and the fields it changed. Undo
 * history needs uncontrolled fields and annotations, so a controlled host never hears of an
 * undo or redo, and no change has a `history` kind.
 *
 * - `commit`: a person, `set` or a signature committed values; `names` lists the fields
 *   committed, including fields a calculation changed.
 * - `reset`: a reset (the API's or a reset button's) restored defaults, with what it
 *   calculated.
 * - `import`: a Gloss import set values, with what it calculated.
 * - `calculate`: a script set values outside a commit or reset (a timer, a page's open or close
 *   script, a widget's event script), or calculated after a host's push.
 */
export type FieldsChange =
  | { kind: 'commit'; names: string[] }
  | { kind: 'reset'; names: string[] }
  | { kind: 'import'; names: string[] }
  | { kind: 'calculate'; names: string[] }

/**
 * Defaults to uncontrolled, starting from the PDF's values with `initial` over them. In
 * controlled mode a change applies at once and is then reported with the full map; the host's
 * push wins.
 */
export type FieldsMode =
  | { mode: 'uncontrolled'; initial?: FieldValues }
  | {
      mode: 'controlled'
      initial: FieldValues
      onChange(next: FieldValues, change: FieldsChange): void
    }

export interface FormSetResult {
  applied: string[]
  rejected: { name: string; reason: 'unknown' | 'readOnly' | 'invalid' | 'script' }[]
}
