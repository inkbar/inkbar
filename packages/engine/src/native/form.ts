// The form and the document's own facts, as the module's `INK_Form` and `INK_Doc_Facts` reports
// give them.
import { appearanceFacts } from './annots.ts'
import {
  array,
  bad,
  boolean,
  count,
  fileText,
  hexBytes,
  indexOrNone,
  name,
  number,
  numberOrNull,
  numbers,
  object,
  objectId,
  oneOf,
  onlyTrue,
  parse,
  present,
  ref,
  string,
  takeJson,
  type Json,
} from './report.ts'

import type {
  DocumentFacts,
  FieldAction,
  FieldFacts,
  FieldValue,
  FieldValueKind,
  FormFacts,
  WidgetFacts,
} from '../types.ts'
import type { Heap } from './strings.ts'

const OPENED_AS = ['none', 'user', 'owner'] as const
const FORM_KINDS = ['none', 'acroform', 'xfa'] as const
const ORIGINS = ['acroform', 'recovered'] as const
const FIELD_KINDS = [
  'text',
  'checkbox',
  'radio',
  'button',
  'combo',
  'list',
  'signature',
  'unknown',
] as const
const VALUE_KINDS: readonly FieldValueKind[] = [
  'none',
  'string',
  'name',
  'array',
  'other',
]

/** The JSON `INK_Doc_Facts` returns. */
export function parseDocumentFacts(text: string): DocumentFacts {
  const what = "The document's facts"
  const root = object(parse(text, what), what, 'root')
  const facts: DocumentFacts = {
    encrypted: boolean(root.encrypted, what, 'encrypted'),
    openedAs: oneOf(OPENED_AS, root.openedAs, what, 'openedAs'),
  }
  if ((facts.openedAs === 'none') !== !facts.encrypted)
    throw bad(what, 'openedAs', 'none exactly when the file is not encrypted')
  if (present(root.title)) facts.title = fileText(root.title, what, 'title')
  if (present(root.author)) facts.author = fileText(root.author, what, 'author')
  if (onlyTrue(root.truncated, what, 'truncated')) facts.truncated = true
  return facts
}

/** `/V` or `/DV`: its kind, and the value for a string, a name or a list. */
function value(
  item: Json,
  kindKey: string,
  key: string,
  what: string
): { kind: FieldValueKind; value?: FieldValue } {
  const kind = oneOf(VALUE_KINDS, item[kindKey], what, kindKey)
  const raw = item[key]
  const holds = kind === 'string' || kind === 'name' || kind === 'array'
  if (!holds) {
    if (raw !== undefined) throw bad(what, key, `no value for ${kind}`)
    return { kind }
  }
  if (kind === 'string') return { kind, value: fileText(raw, what, key) }
  if (kind === 'name') {
    // A name the report's budget could not take is null, and the field says `truncated`.
    if (raw === null && item.truncated === true) return { kind }
    return { kind, value: name(raw, what, key) }
  }
  return {
    kind,
    value: array(raw, what, key).map((v) => (v === null ? null : fileText(v, what, key))),
  }
}

function action(raw: unknown, what: string): FieldAction {
  const item = object(raw, what, 'action')
  const result: FieldAction = {
    kind: item.s === null ? '' : name(item.s, what, 's'),
  }
  if (present(item.uriHex)) result.uri = hexBytes(item.uriHex, what, 'uriHex')
  if ('name' in item)
    result.name = item.name === null ? '' : name(item.name, what, 'name')
  if (result.kind === 'ResetForm')
    result.reset = {
      fields: array(item.fields, what, 'fields').map((f) => fileText(f, what, 'fields')),
      refs: array(item.refs, what, 'refs').map((r) => ref(r, what, 'refs')),
      flags: number(item.flags, what, 'flags'),
    }
  return result
}

function scripts(raw: unknown, what: string): Record<string, string[]> {
  const item = object(raw, what, 'scripts')
  const result: Record<string, string[]> = {}
  for (const [key, sources] of Object.entries(item))
    result[name(key, what, 'scripts')] = array(sources, what, 'scripts').map((s) =>
      string(s, what, 'scripts')
    )
  return result
}

function widget(raw: unknown, what: string): WidgetFacts {
  const item = object(raw, what, 'widgets')
  const page = indexOrNone(item.page, what, 'page')
  const index = indexOrNone(item.annotIndex, what, 'annotIndex')
  if (page < 0 !== index < 0) throw bad(what, 'annotIndex', '-1 exactly with page -1')
  const entry: WidgetFacts = {
    page,
    index,
    ...objectId(item, what),
    ...appearanceFacts(item, what),
    scripts: scripts(item.scripts, what),
  }
  if (present(item.onState)) entry.onState = name(item.onState, what, 'onState')
  if (present(item.exportValue))
    entry.exportValue = string(item.exportValue, what, 'exportValue')
  for (const key of ['borderColor', 'backgroundColor'] as const)
    if (present(item[key])) entry[key] = numbers(item[key], what, key)
  if ('rotation' in item) entry.rotation = numberOrNull(item.rotation, what, 'rotation')
  if (present(item.caption)) entry.caption = fileText(item.caption, what, 'caption')
  if ('q' in item) entry.alignment = numberOrNull(item.q, what, 'q')
  if (present(item.tooltip)) entry.tooltip = fileText(item.tooltip, what, 'tooltip')
  if (present(item.da)) entry.defaultAppearance = fileText(item.da, what, 'da')
  if (onlyTrue(item.pmd, what, 'pmd')) entry.paperMetadata = true
  if (present(item.action)) entry.action = action(item.action, what)
  if (onlyTrue(item.truncated, what, 'truncated')) entry.truncated = true
  return entry
}

function field(raw: unknown, what: string): FieldFacts {
  const item = object(raw, what, 'fields')
  const v = value(item, 'valueKind', 'value', what)
  const dv = value(item, 'defaultValueKind', 'defaultValue', what)
  const entry: FieldFacts = {
    name: string(item.name, what, 'name'),
    ...objectId(item, what),
    origin: oneOf(ORIGINS, item.origin, what, 'origin'),
    kind: oneOf(FIELD_KINDS, item.kind, what, 'kind'),
    flags: number(item.flags, what, 'flags'),
    valueKind: v.kind,
    defaultValueKind: dv.kind,
    widgets: array(item.widgets, what, 'widgets').map((w) => widget(w, what)),
  }
  if (v.value !== undefined) entry.value = v.value
  if (dv.value !== undefined) entry.defaultValue = dv.value
  if (present(item.options))
    entry.options = array(item.options, what, 'options').map((raw) => {
      const option = object(raw, what, 'options')
      return {
        exportValue: string(option.exportValue, what, 'exportValue'),
        displayValue: string(option.displayValue, what, 'displayValue'),
      }
    })
  if (present(item.maxLength)) entry.maxLength = count(item.maxLength, what, 'maxLength')
  if (present(item.topIndex)) entry.topIndex = number(item.topIndex, what, 'topIndex')
  if (present(item.tooltip)) entry.tooltip = fileText(item.tooltip, what, 'tooltip')
  if (onlyTrue(item.truncated, what, 'truncated')) entry.truncated = true
  return entry
}

/** The JSON `INK_Form` returns. */
export function parseForm(text: string): FormFacts {
  const what = 'The form'
  const root = object(parse(text, what), what, 'root')
  const fields = array(root.fields, what, 'fields').map((f) => field(f, what))
  const calculationOrder = array(root.calculationOrder, what, 'calculationOrder').map(
    (n) => indexOrNone(n, what, 'calculationOrder')
  )
  if (calculationOrder.some((n) => n >= fields.length))
    throw bad(what, 'calculationOrder', 'indexes of fields')
  const calculationOrderRefs = array(
    root.calculationOrderRefs,
    what,
    'calculationOrderRefs'
  ).map((r) => (r === null ? null : ref(r, what, 'calculationOrderRefs')))
  if (calculationOrderRefs.length !== calculationOrder.length)
    throw bad(what, 'calculationOrderRefs', 'one entry for each of calculationOrder')
  const tooLarge = boolean(root.tooLarge, what, 'tooLarge')
  if (tooLarge && fields.length > 0) throw bad(what, 'fields', 'none when tooLarge')
  const form: FormFacts = {
    kind: oneOf(FORM_KINDS, root.kind, what, 'kind'),
    needAppearances: boolean(root.needAppearances, what, 'needAppearances'),
    fields,
    calculationOrder,
    calculationOrderRefs,
    fieldTreeDepth: count(root.fieldTreeDepth, what, 'fieldTreeDepth'),
    fieldTreeRevisits: boolean(root.fieldTreeRevisits, what, 'fieldTreeRevisits'),
    tooLarge,
    truncated: boolean(root.truncated, what, 'truncated'),
  }
  if (present(root.da)) form.defaultAppearance = fileText(root.da, what, 'da')
  if ('q' in root) form.alignment = numberOrNull(root.q, what, 'q')
  return form
}

export function readForm(heap: Heap, doc: number): FormFacts {
  return parseForm(takeJson(heap, heap.fn.INK_Form(doc), 'The form'))
}

export function readDocumentFacts(heap: Heap, doc: number): DocumentFacts {
  return parseDocumentFacts(
    takeJson(heap, heap.fn.INK_Doc_Facts(doc), "The document's facts")
  )
}
