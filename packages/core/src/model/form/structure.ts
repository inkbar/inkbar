import { fontFromBaseName } from '../../pdf/annotation-fields'
import { pdfColorToHex } from '../annotations/embedded'

import { suits } from './values'

import type {
  FieldFlags,
  FieldOption,
  FieldValue,
  FormField,
  FormFieldType,
  FormWidget,
  WidgetAction,
  WidgetAppearance,
} from './types'
import type { FormExtras, WidgetExtras } from '../../pdf/form-fields'
import type { FileField, FileWidget } from '../../reader/file'

// `/Ff` bits (PDF 32000-1, tables 221, 226, 228 and 230).
const FF = {
  readOnly: 1 << 0,
  required: 1 << 1,
  noExport: 1 << 2,
  multiline: 1 << 12,
  password: 1 << 13,
  fileSelect: 1 << 20,
  doNotSpellCheck: 1 << 22,
  doNotScroll: 1 << 23,
  comb: 1 << 24,
  radiosInUnison: 1 << 25,
  edit: 1 << 18,
  multiSelect: 1 << 21,
}

// Annotation `/F` bits.
const F_HIDDEN = 1 << 1
const F_PRINT = 1 << 2
const F_NO_VIEW = 1 << 5

const BORDER_STYLES = ['solid', 'dashed', 'beveled', 'inset', 'underline'] as const
const ALIGN = ['left', 'center', 'right'] as const

function flagsOf(type: FormFieldType, ff: number): FieldFlags {
  const has = (bit: number) => (ff & bit) !== 0
  const text = type === 'text'
  const choice = type === 'combo' || type === 'list'
  return {
    readOnly: has(FF.readOnly),
    required: has(FF.required),
    noExport: has(FF.noExport),
    multiline: text && has(FF.multiline),
    password: text && has(FF.password),
    comb: text && has(FF.comb),
    fileSelect: text && has(FF.fileSelect),
    doNotSpellCheck: (text || choice) && has(FF.doNotSpellCheck),
    doNotScroll: text && has(FF.doNotScroll),
    multiSelect: type === 'list' && has(FF.multiSelect),
    editable: type === 'combo' && has(FF.edit),
    radiosInUnison: (type === 'radio' || type === 'checkbox') && has(FF.radiosInUnison),
  }
}

const hex = (c: ArrayLike<number> | null | undefined): string | undefined =>
  c && c.length >= 3 ? pdfColorToHex(c, '') : undefined

function appearanceOf(
  w: FileWidget,
  type: FormFieldType,
  extra: WidgetExtras | undefined
): WidgetAppearance {
  const da = w.defaultAppearance
  const appearance: WidgetAppearance = {
    fontSize: da && Number.isFinite(da.fontSize) ? da.fontSize : 0,
    align: ALIGN[w.alignment ?? 0] ?? 'left',
    fileAppearance: w.hasAppearance,
  }
  const font =
    extra?.font ?? (da?.fontName ? fontFromBaseName(da.fontName, true) : undefined)
  if (font?.fontFamily) {
    appearance.font = {
      family: font.fontFamily,
      ...(font.fontWeight ? { fontWeight: font.fontWeight } : {}),
      ...(font.fontStyle ? { fontStyle: font.fontStyle } : {}),
    }
  }
  const color = hex(da?.color)
  if (color) appearance.color = color
  const width = w.border?.width ?? 0
  if (width > 0) {
    const borderColor = hex(w.borderColor)
    appearance.border = {
      ...(borderColor ? { color: borderColor } : {}),
      width,
      style: BORDER_STYLES[(w.border?.style ?? 1) - 1] ?? 'solid',
    }
  }
  const background = hex(w.backgroundColor)
  if (background) appearance.background = background
  if (extra?.caption !== undefined) {
    if (type === 'button') appearance.caption = extra.caption
    else if (type === 'checkbox' || type === 'radio')
      appearance.checkStyle = extra.caption
  }
  if (type === 'checkbox' || type === 'radio') {
    appearance.onAppearance = extra?.onState !== undefined
    appearance.offAppearance = extra?.offAppearance === true
  }
  return appearance
}

/** Whether the widget's own `/A` is JavaScript: read from the file's objects, else the reader's. */
function scriptAction(w: FileWidget, extras: FormExtras): boolean {
  // The reader's `Action` scripts are those of the whole `/A` chain, `/Next` included, so they
  // are only the answer when the file's own objects could not be read.
  return extras.widgets.has(w.id)
    ? extras.scriptActions.has(w.id)
    : 'Action' in (w.actions.scripts ?? {})
}

const uriOf = ({ actions: a }: FileWidget): WidgetAction | undefined =>
  a.url
    ? { kind: 'uri', url: a.url, ...(a.newWindow ? { newWindow: true } : {}) }
    : undefined

function actionOf(
  w: FileWidget,
  extras: FormExtras,
  namesById: ReadonlyMap<string, string>
): WidgetAction | undefined {
  const submit = extras.submits.get(w.id)
  if (submit) return submit
  // A JavaScript `/A`'s URL is its fallback, not a second action: see `fallbackOf`.
  if (scriptAction(w, extras)) return undefined
  const { resetForm, named } = w.actions
  if (resetForm) {
    const refs = resetForm.refs.flatMap((r) => namesById.get(r) ?? [])
    return {
      kind: 'reset',
      fields: [...resetForm.fields, ...refs],
      include: resetForm.include,
    }
  }
  const uri = uriOf(w)
  if (uri) return uri
  if (named) return { kind: 'named', name: named }
  const page = extras.destPages.get(w.id)
  if (page !== undefined) return { kind: 'goto', page }
  return undefined
}

/**
 * The URL a JavaScript `/A` opens: PDF.js fills `url` and `newWindow` from its
 * `app.launchURL`. The script opens it itself when it runs.
 */
function fallbackOf(w: FileWidget, extras: FormExtras): WidgetAction | undefined {
  return scriptAction(w, extras) ? uriOf(w) : undefined
}

const rotationOf = (r: number | undefined): FormWidget['rotation'] => {
  const n = ((Math.round((r ?? 0) / 90) % 4) + 4) % 4
  return ([0, 90, 180, 270] as const)[n]!
}

function widgetOf(
  w: FileWidget,
  type: FormFieldType,
  extras: FormExtras,
  namesById: ReadonlyMap<string, string>
): FormWidget {
  const extra = extras.widgets.get(w.id)
  const [x1, y1, x2, y2] = w.rect
  const flags = w.flags
  const widget: FormWidget = {
    id: w.id,
    page: w.page,
    rect: {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    },
    rotation: rotationOf(w.rotation),
    // NoView alone hides a widget too: it is never shown on screen.
    hidden: (flags & (F_HIDDEN | F_NO_VIEW)) !== 0,
    printOnly: (flags & F_NO_VIEW) !== 0 && (flags & F_PRINT) !== 0,
    appearance: appearanceOf(w, type, extra),
    hasScripts: Object.keys(w.actions.scripts ?? {}).length > 0,
    order: w.at,
  }
  if (type === 'checkbox' || type === 'radio') {
    const on = extra?.onState ?? w.onValue
    if (on) widget.onState = on
  }
  const action = actionOf(w, extras, namesById)
  if (action) widget.action = action
  const fallback = fallbackOf(w, extras)
  if (fallback) widget.fallback = fallback
  const next = extras.next.get(w.id)
  if (next) widget.next = next
  return widget
}

/** Checkbox and radio options: each widget's on state, labelled with its export value. */
function stateOptions(widgets: readonly FileWidget[], onStates: readonly FormWidget[]) {
  const options: FieldOption[] = []
  widgets.forEach((w, i) => {
    const value = onStates[i]!.onState
    if (value === undefined || options.some((o) => o.value === value)) return
    options.push({ value, label: w.onValue ?? value })
  })
  return options
}

/**
 * A checkbox or radio value as a state name: the reader maps `/V` through `/Opt` to an export
 * value.
 */
function stateValue(
  v: FileField['value'],
  options: readonly FieldOption[]
): string | undefined {
  if (typeof v !== 'string') return undefined
  if (v === 'Off' || options.some((o) => o.value === v)) return v
  const byLabel = options.filter((o) => o.label === v)
  return byLabel.length === 1 ? byLabel[0]!.value : v
}

function choiceValue(v: FileField['value'], multi: boolean): FieldValue | undefined {
  if (v === undefined) return undefined
  const list = Array.isArray(v) ? v : [v]
  if (multi) return list
  return list[0]
}

function buildField(
  f: FileField,
  extras: FormExtras,
  namesById: ReadonlyMap<string, string>
): FormField {
  const { name, kind: type, widgets } = f
  const flags = flagsOf(type, f.flags)
  const built = widgets.map((w) => widgetOf(w, type, extras, namesById))
  let options: FieldOption[] = []
  let value: FieldValue | undefined
  let defaultValue: FieldValue | undefined
  if (type === 'checkbox' || type === 'radio') {
    options = stateOptions(widgets, built)
    const stored = widgets
      .map((w) => extras.widgets.get(w.id)?.state)
      .find((s) => s !== undefined)
    value = stored ?? stateValue(f.value, options) ?? 'Off'
    const storedDefault = widgets
      .map((w) => extras.widgets.get(w.id)?.defaultState)
      .find((s) => s !== undefined)
    defaultValue = storedDefault ?? stateValue(f.defaultValue, options)
  } else if (type === 'combo' || type === 'list') {
    options = (f.options ?? []).map((o) => ({
      value: o.exportValue,
      label: o.displayValue,
    }))
    value = choiceValue(f.value, flags.multiSelect)
    defaultValue = choiceValue(f.defaultValue, flags.multiSelect)
  } else if (type === 'text') {
    if (typeof f.value === 'string') value = f.value
    if (typeof f.defaultValue === 'string') defaultValue = f.defaultValue
  }

  const signed = extras.signed.has(name)
  const barcode = widgets.some((w) => extras.widgets.get(w.id)?.barcode)
  const field: FormField = {
    name,
    type,
    flags,
    options,
    widgets: built,
    locked:
      signed ||
      extras.lockAll ||
      extras.lockedFields.has(name) ||
      flags.fileSelect ||
      barcode,
  }
  if (type === 'text' && f.maxLength) field.maxLength = f.maxLength
  // Like a value a host sets, a default the field cannot hold is dropped: a reset then
  // empties the field instead.
  if (defaultValue !== undefined && suits(field, defaultValue))
    field.defaultValue = defaultValue
  if (value !== undefined) field.value = value
  // The field's tooltip is its first widget's.
  const first = widgets[0]!
  const tooltip = first.tooltip || extras.widgets.get(first.id)?.tooltip
  if (tooltip) field.tooltip = tooltip
  if (signed) field.signed = 'certificate'
  return field
}

/**
 * The form's fields from the reader's terminal fields, in its order. Each widget's `order` is its
 * place among its page's listed annotations.
 */
export function buildFormFields(
  fields: readonly FileField[],
  extras: FormExtras
): FormField[] {
  const namesById = new Map<string, string>()
  for (const f of fields) for (const w of f.widgets) namesById.set(w.id, f.name)
  return fields.map((f) => buildField(f, extras, namesById))
}
