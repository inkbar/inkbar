// The form, the document's scripts and its own facts, as the module's `INK_Form`, `INK_Scripts`
// and `INK_Doc_Facts` reports give them.
import { appearanceFacts, cutName } from './annots.ts'
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
  FieldGroupFacts,
  FieldTreeEntry,
  FieldValue,
  FieldValueKind,
  FieldValueName,
  FileText,
  FormFacts,
  ScriptFacts,
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
  return { kind, value: array(raw, what, key).map((v) => listEntry(v, what, key)) }
}

/**
 * An entry of a `/V` or `/DV` list: text, `{ name }`, or `null` for any other entry (a name the
 * report's budget could not take included, which marks the field `truncated`).
 */
function listEntry(
  raw: unknown,
  what: string,
  key: string
): FileText | FieldValueName | null {
  if (raw === null) return null
  if (typeof raw === 'object' && !Array.isArray(raw) && 'name' in raw) {
    if (Object.keys(raw).length !== 1) throw bad(what, key, 'text, { name } or null')
    return { name: name(raw.name, what, key) }
  }
  return fileText(raw, what, key)
}

/** `/V`'s or `/DV`'s `valueNull`: `true` only beside a value of kind `none`. */
function nullValue(item: Json, key: string, kind: FieldValueKind, what: string): boolean {
  const isNull = onlyTrue(item[key], what, key)
  if (isNull && kind !== 'none')
    throw bad(what, key, 'true only for a value of kind none')
  return isNull
}

const FILE_KINDS = ['string', 'spec', 'other'] as const

/**
 * A Launch or GoToR action's `/F`, into `result`. In a cut widget (`cut`) the action's kind may
 * be the empty name the budget left.
 */
function launchFile(item: Json, result: FieldAction, what: string, cut: boolean): void {
  const keys = ['fileKind', 'fileHex', 'fileSpecFHex', 'fileSpecUFHex']
  if (!present(item.fileKind)) {
    const stray = keys.find((k) => k in item)
    if (stray) throw bad(what, stray, 'no file without fileKind')
    return
  }
  const kindCut = cut && result.kind === ''
  if (result.kind !== 'Launch' && result.kind !== 'GoToR' && !kindCut)
    throw bad(what, 'fileKind', 'a file only in a Launch or GoToR action')
  const kind = oneOf(FILE_KINDS, item.fileKind, what, 'fileKind')
  result.fileKind = kind
  if (kind === 'string') result.file = hexBytes(item.fileHex, what, 'fileHex')
  else if ('fileHex' in item) throw bad(what, 'fileHex', 'bytes only for a string /F')
  for (const [key, out] of [
    ['fileSpecFHex', 'specFile'],
    ['fileSpecUFHex', 'specUnicodeFile'],
  ] as const) {
    if (!(key in item)) continue
    if (kind !== 'spec') throw bad(what, key, 'bytes only for a file specification')
    result[out] = hexBytes(item[key], what, key)
  }
}

/**
 * The widget's own action. `cut` says the widget is marked `truncated`: only then may the report
 * write a name as `null`, which is left out. The keys the fork writes for a kind are kept when
 * the kind itself was cut.
 */
function action(raw: unknown, what: string, cut: boolean): FieldAction {
  const item = object(raw, what, 'action')
  const result: FieldAction = { kind: cutName(item, 's', what, cut) ?? '' }
  if (present(item.uriHex)) result.uri = hexBytes(item.uriHex, what, 'uriHex')
  if ('name' in item) {
    const named = cutName(item, 'name', what, cut)
    if (named !== undefined) result.name = named
  }
  launchFile(item, result, what, cut)
  if (result.kind === 'ResetForm' || 'fields' in item)
    result.reset = {
      fields: array(item.fields, what, 'fields').map((f) => fileText(f, what, 'fields')),
      refs: array(item.refs, what, 'refs').map((r) => ref(r, what, 'refs')),
      flags: number(item.flags, what, 'flags'),
    }
  return result
}

/** Sources by key, the report's `Scripts`. */
function scripts(raw: unknown, what: string): Record<string, string[]> {
  const item = object(raw, what, 'scripts')
  // Own properties only: an assignment to a key named `__proto__` would set the prototype and
  // lose the key with its sources.
  return Object.fromEntries(
    Object.entries(item).map(([key, sources]) => [
      name(key, what, 'scripts'),
      array(sources, what, 'scripts').map((s) => string(s, what, 'scripts')),
    ])
  )
}

/** A checkbox's or radio's `/Opt`: entries as a value list's, or `null` when it is no list. */
function toggleOptions(
  raw: unknown,
  what: string,
  key: string
): (FileText | FieldValueName | null)[] | null {
  return raw === null ? null : array(raw, what, key).map((v) => listEntry(v, what, key))
}

/** `/I`: numbers as written, each `null` when it is no number, or `null` when it is no list. */
const indices = (raw: unknown, what: string, key: string): (number | null)[] | null =>
  raw === null ? null : numbers(raw, what, key)

/** `t` and `parentIsWalkParent`, which the fork writes alike on groups, fields and kids. */
function nameFacts(
  item: Json,
  what: string
): { partialName?: FileText | null; otherParent?: true } {
  const facts: { partialName?: FileText | null; otherParent?: true } = {}
  if ('t' in item)
    facts.partialName = item.t === null ? null : fileText(item.t, what, 't')
  if ('parentIsWalkParent' in item) {
    if (item.parentIsWalkParent !== false)
      throw bad(what, 'parentIsWalkParent', 'false or no key')
    facts.otherParent = true
  }
  return facts
}

/** An entry of `/Kids` or of `/Fields`. */
function treeEntry(raw: unknown, what: string, key: string): FieldTreeEntry {
  const item = object(raw, what, key)
  const entry: FieldTreeEntry = {
    ref: item.ref === null ? null : ref(item.ref, what, 'ref'),
    dictionary: boolean(item.dictionary, what, 'dictionary'),
  }
  const facts = ['hasT', 'hasKids', 't', 'parentIsWalkParent']
  if (!entry.dictionary) {
    const stray = facts.find((k) => k in item)
    if (stray) throw bad(what, stray, 'no facts for an entry that is no dictionary')
    return entry
  }
  const hasT = boolean(item.hasT, what, 'hasT')
  if (hasT !== 't' in item) throw bad(what, 't', 'present exactly when hasT')
  return {
    ...entry,
    hasKids: boolean(item.hasKids, what, 'hasKids'),
    ...nameFacts(item, what),
  }
}

function group(raw: unknown, what: string): FieldGroupFacts {
  const item = object(raw, what, 'groups')
  const entry: FieldGroupFacts = {
    name: string(item.name, what, 'name'),
    ...objectId(item, what),
    walkIndex: count(item.walkIndex, what, 'walkIndex'),
    ...nameFacts(item, what),
    kids: array(item.kids, what, 'kids').map((k) => treeEntry(k, what, 'kids')),
    scripts: scripts(item.scripts, what),
  }
  if (present(item.field)) entry.field = count(item.field, what, 'field')
  if ('subtype' in item) {
    const subtype = cutName(item, 'subtype', what)
    if (subtype !== undefined) entry.subtype = subtype
  }
  for (const key of ['borderColor', 'backgroundColor'] as const)
    if (present(item[key])) entry[key] = numbers(item[key], what, key)
  if ('rotation' in item) entry.rotation = numberOrNull(item.rotation, what, 'rotation')
  if (present(item.caption)) entry.caption = fileText(item.caption, what, 'caption')
  if ('rotate' in item) entry.rotate = numberOrNull(item.rotate, what, 'rotate')
  if (present(item.page)) entry.page = indexOrNone(item.page, what, 'page')
  if (onlyTrue(item.truncated, what, 'truncated')) entry.truncated = true
  return entry
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
  if ('rotate' in item) entry.rotate = numberOrNull(item.rotate, what, 'rotate')
  if ('opt' in item) entry.toggleOptions = toggleOptions(item.opt, what, 'opt')
  if ('selectedIndices' in item)
    entry.selectedIndices = indices(item.selectedIndices, what, 'selectedIndices')
  if ('q' in item) entry.alignment = numberOrNull(item.q, what, 'q')
  if (present(item.tooltip)) entry.tooltip = fileText(item.tooltip, what, 'tooltip')
  if (present(item.da)) entry.defaultAppearance = fileText(item.da, what, 'da')
  if (onlyTrue(item.pmd, what, 'pmd')) entry.paperMetadata = true
  if (present(item.action))
    entry.action = action(item.action, what, item.truncated === true)
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
  if (nullValue(item, 'valueNull', v.kind, what)) entry.valueNull = true
  if (dv.value !== undefined) entry.defaultValue = dv.value
  if (nullValue(item, 'defaultValueNull', dv.kind, what)) entry.defaultValueNull = true
  if ('selectedIndices' in item) {
    entry.selectedIndices = indices(item.selectedIndices, what, 'selectedIndices')
    entry.selectedIndicesOwn = boolean(
      item.selectedIndicesOwn,
      what,
      'selectedIndicesOwn'
    )
  } else if ('selectedIndicesOwn' in item)
    throw bad(what, 'selectedIndicesOwn', 'only beside selectedIndices')
  if ('opt' in item) entry.toggleOptions = toggleOptions(item.opt, what, 'opt')
  if (present(item.walkIndex)) {
    entry.walkIndex = count(item.walkIndex, what, 'walkIndex')
    Object.assign(entry, nameFacts(item, what))
  } else {
    const stray = ['t', 'parentIsWalkParent'].find((k) => k in item)
    if (stray) throw bad(what, stray, 'only beside walkIndex')
  }
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
  const groups = array(root.groups, what, 'groups').map((g) => group(g, what))
  const fieldsRoot = array(root.fieldsRoot, what, 'fieldsRoot').map((e) =>
    treeEntry(e, what, 'fieldsRoot')
  )
  if (tooLarge && groups.length + fieldsRoot.length > 0)
    throw bad(what, 'groups', 'none when tooLarge')
  // Each dictionary takes one place in the walk; a group that is a field's own dictionary has
  // that field's place.
  const places = new Set<number>()
  for (const { walkIndex } of [
    ...fields,
    ...groups.filter((g) => g.field === undefined),
  ]) {
    if (walkIndex === undefined) continue
    if (places.has(walkIndex))
      throw bad(what, 'walkIndex', 'one place for each dictionary')
    places.add(walkIndex)
  }
  for (const g of groups)
    if (g.field !== undefined && fields[g.field]?.walkIndex !== g.walkIndex)
      throw bad(what, 'field', "the index of a field at the group's place in the walk")
  const form: FormFacts = {
    kind: oneOf(FORM_KINDS, root.kind, what, 'kind'),
    needAppearances: boolean(root.needAppearances, what, 'needAppearances'),
    fields,
    groups,
    fieldsRoot,
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

/** The JSON `INK_Scripts` returns, for a document of `pageCount` pages. */
export function parseScripts(text: string, pageCount: number): ScriptFacts {
  const what = "The document's scripts"
  const root = object(parse(text, what), what, 'root')
  return {
    document: array(root.document, what, 'document').map((raw) => {
      const entry = object(raw, what, 'document')
      return {
        name: entry.name === null ? null : fileText(entry.name, what, 'name'),
        source: string(entry.source, what, 'source'),
      }
    }),
    documentActions: scripts(root.documentActions, what),
    pageActions: array(root.pageActions, what, 'pageActions').map((raw, i, all) => {
      const entry = object(raw, what, 'pageActions')
      const page = count(entry.page, what, 'page')
      if (page >= pageCount) throw bad(what, 'page', 'a page of the document')
      // The report lists each page once, in page order.
      const before = i > 0 ? (all[i - 1] as Json).page : -1
      if (typeof before === 'number' && page <= before)
        throw bad(what, 'page', 'pages in order, each once')
      return { page, scripts: scripts(entry.scripts, what) }
    }),
    truncated: boolean(root.truncated, what, 'truncated'),
  }
}

export function readScripts(heap: Heap, doc: number, pageCount: number): ScriptFacts {
  return parseScripts(
    takeJson(heap, heap.fn.INK_Scripts(doc), "The document's scripts"),
    pageCount
  )
}

export function readForm(heap: Heap, doc: number): FormFacts {
  return parseForm(takeJson(heap, heap.fn.INK_Form(doc), 'The form'))
}

export function readDocumentFacts(heap: Heap, doc: number): DocumentFacts {
  return parseDocumentFacts(
    takeJson(heap, heap.fn.INK_Doc_Facts(doc), "The document's facts")
  )
}
