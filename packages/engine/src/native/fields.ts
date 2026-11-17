import { EngineError } from '../errors.ts'

import { readString, withInts, withUtf16, withUtf16List, type Heap } from './strings.ts'

import type { WriteField } from '../types.ts'

/** The fork's field families. */
const CHECKBOX = 2
const RADIO = 3
const TEXT = 4
const COMBO = 5
const LIST = 6

/** The shapes a field value is written in. */
const VALUE_NONE = 0
const VALUE_SCALAR = 1
const VALUE_ARRAY = 2

const OFF = 'Off'

/** One field of the form, as the model read it before anything was written. */
interface FormField {
  objectNumber: number
  family: number
  /** For a checkbox or radio group: each widget's on-state name, in the model's widget order. */
  onStates: string[]
}

const utf16 = (bytes: Uint8Array) => {
  let text = ''
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const unit = (bytes[i] as number) | ((bytes[i + 1] as number) << 8)
    if (unit === 0) break
    text += String.fromCharCode(unit)
  }
  return text
}

const utf8 = (bytes: Uint8Array) => {
  const end = bytes.indexOf(0)
  return new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end))
}

/** The fields of `doc` by full name. The first of two fields with one name wins. */
function readForm(heap: Heap, model: number): Map<string, FormField> {
  const fn = heap.fn
  const fields = new Map<string, FormField>()
  const count = fn.EPDFForm_CountFields(model)
  for (let index = 0; index < count; index++) {
    const name = readString(
      heap,
      (buffer, size) => fn.EPDFForm_GetFieldName(model, index, buffer, size),
      utf16
    )
    if (fields.has(name)) continue
    const family = fn.EPDFForm_GetFieldFamily(model, index)
    const onStates: string[] = []
    if (family === CHECKBOX || family === RADIO) {
      const widgets = fn.EPDFForm_CountFieldWidgets(model, index)
      for (let widget = 0; widget < widgets; widget++)
        onStates.push(
          readString(
            heap,
            (buffer, size) =>
              fn.EPDFForm_GetFieldWidgetOnState(model, index, widget, buffer, size),
            utf8
          )
        )
    }
    fields.set(name, {
      objectNumber: fn.EPDFForm_GetFieldObjNum(model, index),
      family,
      onStates,
    })
  }
  return fields
}

const failed = (name: string, why: string) =>
  new EngineError('write-failed', `The form field "${name}" could not be set: ${why}.`)

/** Why `field` cannot hold `value`, or undefined when it can. */
function refusal(field: FormField | undefined, value: WriteField): string | undefined {
  if (!field) return 'the form has no field by that name'
  if (field.objectNumber === 0) return 'the field is not stored on its own in the file'
  const list = typeof value.value !== 'string'
  switch (field.family) {
    case TEXT:
    case COMBO:
      return list ? 'it takes one string, not a list' : undefined
    case LIST:
      if (!list) return 'a list box takes a list of options'
      return value.text === undefined ? undefined : 'a list box shows no other text'
    case CHECKBOX:
    case RADIO:
      if (list) return 'it takes one state name, not a list'
      if (value.text !== undefined) return 'a button shows no other text'
      if (value.value !== OFF && !field.onStates.includes(value.value as string))
        return `no button in it has the state "${value.value as string}"`
      return undefined
    default:
      return 'only text, checkbox, radio, combo and list fields take values'
  }
}

/** Writes the field's value, in the shape its family keeps it in. */
function setValue(heap: Heap, doc: number, field: FormField, value: WriteField): boolean {
  const values = typeof value.value === 'string' ? [value.value] : [...value.value]
  const kind =
    values.length === 0 ? VALUE_NONE : values.length === 1 ? VALUE_SCALAR : VALUE_ARRAY
  return withUtf16List(heap, values, (pointer, count) =>
    Boolean(heap.fn.EPDFForm_SetFieldValue(doc, field.objectNumber, kind, pointer, count))
  )
}

/** Draws the widgets: buttons by turning them on or off, the rest from the value or `text`. */
function draw(heap: Heap, doc: number, field: FormField, value: WriteField): boolean {
  const fn = heap.fn
  const number = field.objectNumber
  if (field.family === CHECKBOX || field.family === RADIO) {
    const checked = field.onStates.map((state) =>
      value.value !== OFF && state === value.value ? 1 : 0
    )
    return withInts(heap, checked, (pointer, count) =>
      Boolean(fn.EPDFForm_SetFieldWidgetsChecked(doc, number, pointer, count, 0, 0, 0))
    )
  }
  // A choice field's /I (selected option positions) would contradict the new value, and PDF.js
  // reads it before /V. It is optional and /V wins over it, so it is removed, not rewritten.
  if (
    (field.family === COMBO || field.family === LIST) &&
    !fn.EPDFForm_SetFieldSelectedIndices(doc, number, 0, 0)
  )
    return false
  if (value.text !== undefined)
    return withUtf16(heap, value.text, (pointer) =>
      Boolean(fn.EPDFForm_SetFieldAppearanceText(doc, number, pointer, 0, 0, 0))
    )
  return Boolean(fn.EPDFForm_RedrawFieldWidgets(doc, number, 0, 0, 0))
}

/**
 * Sets each field's value and draws its widgets. Every name and value is checked against the
 * form before anything is written, so a refusal leaves the document untouched; a native setter
 * that fails later leaves a partial write, which the caller discards.
 */
export function writeFields(
  heap: Heap,
  doc: number,
  fields: Readonly<Record<string, WriteField>>
): void {
  const entries = Object.entries(fields)
  if (entries.length === 0) return
  const model = heap.fn.EPDFForm_LoadModel(doc)
  if (model === 0) throw new EngineError('write-failed', 'The form could not be read.')
  let form: Map<string, FormField>
  try {
    form = readForm(heap, model)
  } finally {
    if (!heap.stopped) heap.fn.EPDFForm_CloseModel(model)
  }
  const planned = entries.map(([name, value]) => {
    const field = form.get(name)
    const why = refusal(field, value)
    if (why !== undefined) throw failed(name, why)
    return { name, value, field: field as FormField }
  })
  for (const { name, value, field } of planned) {
    if (!setValue(heap, doc, field, value)) throw failed(name, 'the value was refused')
    if (!draw(heap, doc, field, value))
      throw failed(name, 'its widgets could not be drawn')
  }
}
