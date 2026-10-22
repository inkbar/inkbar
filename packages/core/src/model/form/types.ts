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
  /** `#rrggbb`. */
  color?: string
  align: 'left' | 'center' | 'right'
  border?: {
    color?: string
    width: number
    style: 'solid' | 'dashed' | 'beveled' | 'inset' | 'underline'
  }
  background?: string
  /** A push button's `/MK /CA`. */
  caption?: string
  /** A checkbox or radio's `/MK /CA`: the ZapfDingbats character drawn when on. */
  checkStyle?: string
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
  | { kind: 'uri'; url: string }
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
  hidden: boolean
  printOnly: boolean
  appearance: WidgetAppearance
  action?: WidgetAction
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
