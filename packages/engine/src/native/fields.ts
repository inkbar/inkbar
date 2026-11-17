import { EngineError } from '../errors.ts'

import { readString, withInts, withUtf16, withUtf16List, type Heap } from './strings.ts'

import type { WriteField } from '../types.ts'

/** The fork's field families. */
const CHECKBOX = 2
const RADIO = 3
const TEXT = 4
const COMBO = 5
const LIST = 6
const SIGNATURE = 7

/** The shapes of a field value, as the fork reads and writes them. */
const VALUE_NONE = 0
const VALUE_SCALAR = 1
const VALUE_ARRAY = 2
/** A value of another shape: for a signature field, its signature dictionary. */
const VALUE_UNSUPPORTED = 3

/** Choice field flags in /Ff (ISO 32000-2, table 231), by their 1-based bit position. */
const EDIT = 1 << 18 // bit 19, Edit: a combo box takes text of its own
const MULTI_SELECT = 1 << 21 // bit 22, MultiSelect: a list box takes several options

const OFF = 'Off'

/** One field of the form, as the model read it before anything was written. */
interface FormField {
  objectNumber: number
  family: number
  /** The field's /Ff flags. */
  flags: number
  /** For a checkbox or radio group: each widget's on-state name, in the model's widget order. */
  onStates: string[]
  /** For a combo or list box: each option's export value, in /Opt order. */
  options: string[]
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

/** Runs `use` with the form model of `doc`, and closes the model after. */
function withModel<T>(
  heap: Heap,
  doc: number,
  failure: () => EngineError,
  use: (model: number) => T
): T {
  const model = heap.fn.EPDFForm_LoadModel(doc)
  if (model === 0) throw failure()
  try {
    return use(model)
  } finally {
    if (!heap.stopped) heap.fn.EPDFForm_CloseModel(model)
  }
}

/** The fields of the form by full name. The first of two fields with one name wins. */
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
    const options: string[] = []
    if (family === COMBO || family === LIST) {
      const total = fn.EPDFForm_CountFieldOptions(model, index)
      for (let option = 0; option < total; option++)
        options.push(
          readString(
            heap,
            (buffer, size) =>
              fn.EPDFForm_GetFieldOptionValue(model, index, option, buffer, size),
            utf16
          )
        )
    }
    fields.set(name, {
      objectNumber: fn.EPDFForm_GetFieldObjNum(model, index),
      family,
      flags: fn.EPDFForm_GetFieldFlags(model, index) >>> 0,
      onStates,
      options,
    })
  }
  return fields
}

/**
 * Whether the document holds a digital signature: a signature field whose value is a signature
 * dictionary. An empty signature field, a place to sign later, is not one.
 */
export function hasSignature(heap: Heap, doc: number): boolean {
  const fn = heap.fn
  const failure = () =>
    new EngineError('engine-failure', "The document's signatures could not be read.")
  return withModel(heap, doc, failure, (model) => {
    const count = fn.EPDFForm_CountFields(model)
    for (let index = 0; index < count; index++)
      if (
        fn.EPDFForm_GetFieldFamily(model, index) === SIGNATURE &&
        fn.EPDFForm_GetFieldValueKind(model, index) === VALUE_UNSUPPORTED
      )
        return true
    return false
  })
}

const failed = (name: string, why: string) =>
  new EngineError('write-failed', `The form field "${name}" could not be set: ${why}.`)

const quoted = (values: readonly string[]) => values.map((v) => `"${v}"`).join(', ')

/** Why `field` cannot hold `value`, or undefined when it can. */
function refusal(field: FormField | undefined, value: WriteField): string | undefined {
  if (!field) return 'the form has no field by that name'
  if (field.objectNumber === 0) return 'the field is not stored on its own in the file'
  const given = value.value
  if (typeof given !== 'string') {
    if (field.family !== LIST) return 'it takes one string, not a list'
    if (value.text !== undefined) return 'a list box shows no other text'
    if (given.length > 1 && (field.flags & MULTI_SELECT) === 0)
      return 'the list box takes one option at most'
    const unknown = given.filter((v) => !field.options.includes(v))
    if (unknown.length > 0) return `the list box has no option ${quoted(unknown)}`
    return undefined
  }
  switch (field.family) {
    case TEXT:
      return undefined
    case COMBO:
      if ((field.flags & EDIT) === 0 && !field.options.includes(given))
        return `the combo box has no option "${given}" and takes no text of its own`
      return undefined
    case LIST:
      return 'a list box takes a list of options'
    case CHECKBOX:
    case RADIO:
      if (value.text !== undefined) return 'a button shows no other text'
      if (given !== OFF && !field.onStates.includes(given))
        return `no button in it has the state "${given}"`
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

/**
 * Writes a choice field's /I, the selected options' positions, to match the value. A list box
 * gets the positions of its values, in ascending order. A combo box gets none: /I is meant for
 * several selections, and a stale one would contradict the value for readers that read it first.
 */
function setSelection(
  heap: Heap,
  doc: number,
  field: FormField,
  value: WriteField
): boolean {
  const indices =
    field.family === LIST && typeof value.value !== 'string'
      ? [...new Set(value.value.map((v) => field.options.indexOf(v)))].sort(
          (a, b) => a - b
        )
      : []
  return withInts(heap, indices, (pointer, count) =>
    Boolean(
      heap.fn.EPDFForm_SetFieldSelectedIndices(
        doc,
        field.objectNumber,
        count === 0 ? 0 : pointer,
        count
      )
    )
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
  const failure = () => new EngineError('write-failed', 'The form could not be read.')
  const form = withModel(heap, doc, failure, (model) => readForm(heap, model))
  const planned = entries.map(([name, value]) => {
    const field = form.get(name)
    const why = refusal(field, value)
    if (why !== undefined) throw failed(name, why)
    return { name, value, field: field as FormField }
  })
  for (const { name, value, field } of planned) {
    if (!setValue(heap, doc, field, value)) throw failed(name, 'the value was refused')
    const choice = field.family === COMBO || field.family === LIST
    if (choice && !setSelection(heap, doc, field, value))
      throw failed(name, 'its selection could not be written')
    if (!draw(heap, doc, field, value))
      throw failed(name, 'its widgets could not be drawn')
  }
}
