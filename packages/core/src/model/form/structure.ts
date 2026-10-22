import { fontFromBaseName } from '../../pdf/annotation-fields'
import { pdfColorToHex } from '../annotations/embedded'

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
import type { PdfjsAnnotationData } from '../../pdfjs/types'

/** One widget as PDF.js reported it, with the page it sits on. */
export interface RawWidget {
  page: number
  data: PdfjsAnnotationData
}

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
const F_NO_VIEW = 1 << 5

const BORDER_STYLES = ['solid', 'dashed', 'beveled', 'inset', 'underline'] as const
const ALIGN = ['left', 'center', 'right'] as const

function fieldType(d: PdfjsAnnotationData): FormFieldType | undefined {
  switch (d.fieldType) {
    case 'Tx':
      return 'text'
    case 'Ch':
      return d.combo ? 'combo' : 'list'
    case 'Sig':
      return 'signature'
    case 'Btn':
      if (d.pushButton) return 'button'
      if (d.radioButton) return 'radio'
      return d.checkBox ? 'checkbox' : undefined
    default:
      return undefined
  }
}

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
  d: PdfjsAnnotationData,
  type: FormFieldType,
  extra: WidgetExtras | undefined
): WidgetAppearance {
  const da = d.defaultAppearanceData
  const appearance: WidgetAppearance = {
    fontSize: da && Number.isFinite(da.fontSize) ? da.fontSize : 0,
    align: ALIGN[d.textAlignment ?? 0] ?? 'left',
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
  const color = hex(da?.fontColor as ArrayLike<number> | undefined)
  if (color) appearance.color = color
  const width = d.borderStyle?.width ?? 0
  if (width > 0) {
    const borderColor = hex(d.borderColor)
    appearance.border = {
      ...(borderColor ? { color: borderColor } : {}),
      width,
      style: BORDER_STYLES[(d.borderStyle?.style ?? 1) - 1] ?? 'solid',
    }
  }
  const background = hex(d.backgroundColor)
  if (background) appearance.background = background
  if (extra?.caption !== undefined) {
    if (type === 'button') appearance.caption = extra.caption
    else if (type === 'checkbox' || type === 'radio')
      appearance.checkStyle = extra.caption
  }
  return appearance
}

function actionOf(
  d: PdfjsAnnotationData,
  id: string,
  extras: FormExtras,
  namesById: ReadonlyMap<string, string>
): WidgetAction | undefined {
  const submit = extras.submits.get(id)
  if (submit) return submit
  if (d.resetForm) {
    const refs = d.resetForm.refs.flatMap((r) => namesById.get(r) ?? [])
    return {
      kind: 'reset',
      fields: [...d.resetForm.fields, ...refs],
      include: d.resetForm.include,
    }
  }
  if (d.url) return { kind: 'uri', url: d.url }
  if (d.action) return { kind: 'named', name: d.action }
  const page = extras.destPages.get(id)
  if (page !== undefined) return { kind: 'goto', page }
  return undefined
}

const rotationOf = (r: number | undefined): FormWidget['rotation'] => {
  const n = ((Math.round((r ?? 0) / 90) % 4) + 4) % 4
  return ([0, 90, 180, 270] as const)[n]!
}

function widgetOf(
  raw: RawWidget,
  type: FormFieldType,
  extras: FormExtras,
  namesById: ReadonlyMap<string, string>
): FormWidget {
  const { data: d, page } = raw
  const extra = extras.widgets.get(d.id)
  const [x1, y1, x2, y2] = d.rect
  const flags = d.annotationFlags ?? 0
  const widget: FormWidget = {
    id: d.id,
    page,
    rect: {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    },
    rotation: rotationOf(d.rotation),
    hidden: (flags & F_HIDDEN) !== 0 || d.hidden === true,
    printOnly: (flags & F_NO_VIEW) !== 0,
    appearance: appearanceOf(d, type, extra),
    hasScripts: hasScripts(d.actions),
  }
  if (type === 'checkbox' || type === 'radio') {
    const on = extra?.onState ?? (type === 'radio' ? d.buttonValue : d.exportValue)
    if (on) widget.onState = on
  }
  const action = actionOf(d, d.id, extras, namesById)
  if (action) widget.action = action
  return widget
}

function hasScripts(actions: PdfjsAnnotationData['actions']): boolean {
  if (!actions) return false
  return actions instanceof Map ? actions.size > 0 : Object.keys(actions).length > 0
}

/** Checkbox and radio options: each widget's on state, labelled with its export value. */
function stateOptions(widgets: readonly RawWidget[], onStates: readonly FormWidget[]) {
  const options: FieldOption[] = []
  widgets.forEach((w, i) => {
    const value = onStates[i]!.onState
    if (value === undefined || options.some((o) => o.value === value)) return
    const label = (w.data.radioButton ? w.data.buttonValue : w.data.exportValue) ?? value
    options.push({ value, label })
  })
  return options
}

/** A checkbox or radio value as a state name: PDF.js maps `/V` through `/Opt` to an export value. */
function stateValue(
  v: PdfjsAnnotationData['fieldValue'],
  options: readonly FieldOption[]
): string | undefined {
  if (typeof v !== 'string') return undefined
  if (v === 'Off' || options.some((o) => o.value === v)) return v
  const byLabel = options.filter((o) => o.label === v)
  return byLabel.length === 1 ? byLabel[0]!.value : v
}

function choiceValue(
  v: PdfjsAnnotationData['fieldValue'],
  multi: boolean
): FieldValue | undefined {
  if (v === null || v === undefined) return undefined
  const list = Array.isArray(v) ? v : [v]
  if (multi) return list
  return list[0]
}

function buildField(
  name: string,
  widgets: readonly RawWidget[],
  extras: FormExtras,
  namesById: ReadonlyMap<string, string>
): FormField | undefined {
  const d = widgets[0]!.data
  const type = fieldType(d)
  if (!type) return undefined
  const flags = flagsOf(type, d.fieldFlags ?? 0)
  const built = widgets.map((w) => widgetOf(w, type, extras, namesById))
  let options: FieldOption[] = []
  let value: FieldValue | undefined
  let defaultValue: FieldValue | undefined
  if (type === 'checkbox' || type === 'radio') {
    options = stateOptions(widgets, built)
    const stored = widgets
      .map((w) => extras.widgets.get(w.data.id)?.state)
      .find((s) => s !== undefined)
    value = stored ?? stateValue(d.fieldValue, options) ?? 'Off'
    const storedDefault = widgets
      .map((w) => extras.widgets.get(w.data.id)?.defaultState)
      .find((s) => s !== undefined)
    defaultValue = storedDefault ?? stateValue(d.defaultFieldValue, options)
  } else if (type === 'combo' || type === 'list') {
    options = (d.options ?? []).map((o) => ({
      value: o.exportValue,
      label: o.displayValue,
    }))
    value = choiceValue(d.fieldValue, flags.multiSelect)
    defaultValue = choiceValue(d.defaultFieldValue, flags.multiSelect)
  } else if (type === 'text') {
    if (typeof d.fieldValue === 'string') value = d.fieldValue
    if (typeof d.defaultFieldValue === 'string') defaultValue = d.defaultFieldValue
  }

  const signed = extras.signed.has(name)
  const barcode = widgets.some((w) => extras.widgets.get(w.data.id)?.barcode)
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
  if (type === 'text' && d.maxLen) field.maxLength = d.maxLen
  if (defaultValue !== undefined) field.defaultValue = defaultValue
  if (value !== undefined) field.value = value
  if (d.alternativeText) field.tooltip = d.alternativeText
  if (signed) field.signed = 'certificate'
  return field
}

/**
 * Terminal fields from the widgets PDF.js reports, grouped by full name, in the order of each
 * field's first widget. Widgets of unknown field types are left out.
 */
export function buildFormFields(
  raw: readonly RawWidget[],
  extras: FormExtras
): FormField[] {
  const groups = new Map<string, RawWidget[]>()
  const namesById = new Map<string, string>()
  for (const w of raw) {
    const name = w.data.fieldName
    if (w.data.subtype !== 'Widget' || !name) continue
    namesById.set(w.data.id, name)
    let group = groups.get(name)
    if (!group) groups.set(name, (group = []))
    group.push(w)
  }
  const fields: FormField[] = []
  for (const [name, widgets] of groups) {
    const field = buildField(name, widgets, extras, namesById)
    if (field) fields.push(field)
  }
  return fields
}
