// The form's fields from the facts the engine reports, as the PDF.js reader builds them from the
// widgets PDF.js lists: the same fields in the same order with the values PDF.js 6.4.299 gives,
// its quirks included.
import {
  annotationId,
  borderOf,
  defaultAppearanceText,
  F_HIDDEN,
  F_NO_VIEW,
  knownFlags,
  parseDefaultAppearance,
  rectOf,
  refId,
  rgbOf,
  rotationOf,
  textOf,
} from './file-values'
import { widgetScripts } from './scripts'
import { cleanAddress, cleanUri, latin1, specFileName, urlInScript } from './targets'

import type { PageFormContext, WidgetContext } from './annotations'
import type {
  FieldActionShape,
  FieldFactsShape,
  FieldTreeEntryShape,
  FieldValueKindShape,
  FieldValueShape,
  FileTextShape,
  FormFactsShape,
  WidgetFactsShape,
} from './types'
import type {
  FileAnnotation,
  FileField,
  FileWidget,
  FileWidgetActions,
} from '../reader/file'

type Value = string | string[] | null

/**
 * `/V` or `/DV` as PDF.js's `_decodeFormValue` gives it: text, a name, or a list of them with
 * other entries dropped. A name is its characters as they are; text drops escape sequences.
 */
function decode(kind: FieldValueKindShape, value: FieldValueShape | undefined): Value {
  if (value === undefined || kind === 'none' || kind === 'other') return null
  if (Array.isArray(value)) {
    const list = value.flatMap((v) =>
      v === null ? [] : typeof v === 'object' && 'name' in v ? [v.name] : [textOf(v)]
    )
    return list.length > 0 ? list : null
  }
  if (kind === 'name' && typeof value === 'string') return value
  return textOf(value)
}

/**
 * The value PDF.js reads for a field before its kind's own rules: `/V`, else `/DV` when `/V` is
 * absent. A `/V` written as null is there, so `/DV` is not read for it.
 */
function rawValue(field: FieldFactsShape): Value {
  const value = decode(field.valueKind, field.value)
  if (field.valueKind === 'none' && field.valueNull !== true && value === null)
    return decode(field.defaultValueKind, field.defaultValue)
  return value
}

/**
 * A choice field's value as PDF.js's `ChoiceWidgetAnnotation` builds it: with `/I` a non-empty
 * list, the export value of each option it names by a whole number in range, in its order;
 * otherwise the value as a list.
 */
function choiceValue(
  raw: Value,
  indices: FieldFactsShape['selectedIndices'],
  options: readonly { exportValue: string }[]
): string[] {
  if (!indices?.length) return typeof raw === 'string' ? [raw] : (raw ?? [])
  return indices.flatMap((i) =>
    typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < options.length
      ? [options[i]!.exportValue]
      : []
  )
}

/**
 * @internal What PDF.js reads for each widget along `/Parent` and from `/AcroForm`, by page and
 * place in `/Annots`: its `/DA`, and whether `/NeedAppearances` makes PDF.js count an appearance
 * for it because its field has a value.
 */
export function widgetContexts(form: FormFactsShape): Map<number, PageFormContext> {
  const pages = new Map<number, PageFormContext>()
  const context = (page: number): PageFormContext => {
    let found = pages.get(page)
    if (!found) {
      found = {
        ...(form.defaultAppearance !== undefined
          ? { defaultAppearance: form.defaultAppearance }
          : {}),
        widgets: new Map<number, WidgetContext>(),
      }
      pages.set(page, found)
    }
    return found
  }
  for (const field of form.fields) {
    const drawnFromValue = form.needAppearances && rawValue(field) !== null
    for (const w of field.widgets) {
      if (w.page < 0) continue
      ;(context(w.page).widgets as Map<number, WidgetContext>).set(w.index, {
        defaultAppearance: defaultAppearanceText(
          w.defaultAppearance,
          form.defaultAppearance
        ),
        drawnFromValue,
      })
    }
  }
  return pages
}

/** A field's widget with where PDF.js lists it. */
interface Placed {
  field: FieldFactsShape
  widget: WidgetFactsShape
  id: string
  page: number
  at: number
}

/**
 * @internal The form's terminal fields as `FileField`s, in the order and with the values the PDF.js
 * reader gives. `listed` gives a page's annotations as the reader lists them: a widget's `at` is
 * its place among them (one widget for each place it is listed at), and a widget it does not list
 * is left out, as is a widget on no page. Fields
 * go in the order of their first widgets by page and place, and their widgets in that order too.
 * A field of a kind PDF.js does not read is left out; a ResetForm reference to one of its widgets
 * becomes its name. A form refused for its size has no fields.
 */
export async function fileFieldsFromEngine(
  form: FormFactsShape,
  listed: (page: number) => Promise<FileAnnotation[]>
): Promise<FileField[]> {
  const pages = [
    ...new Set(form.fields.flatMap((f) => f.widgets.map((w) => w.page))),
  ].filter((p) => p >= 0)
  // Every place each id is listed at: a widget `/Annots` names twice is listed twice, and PDF.js
  // gives its field a widget for each.
  const places = new Map<number, Map<string, number[]>>()
  for (const page of pages.sort((a, b) => a - b)) {
    const ids = new Map<string, number[]>()
    ;(await listed(page)).forEach((a, at) => {
      const ats = ids.get(a.id)
      if (ats) ats.push(at)
      else ids.set(a.id, [at])
    })
    places.set(page, ids)
  }
  const placed: Placed[] = []
  for (const field of form.fields) {
    const seen = new Set<string>()
    for (const widget of field.widgets) {
      if (widget.page < 0) continue
      const id = annotationId(widget.page, widget)
      if (seen.has(id)) continue
      seen.add(id)
      for (const at of places.get(widget.page)?.get(id) ?? [])
        placed.push({ field, widget, id, page: widget.page, at })
    }
  }
  placed.sort((a, b) => a.page - b.page || a.at - b.at)

  const groups = new Map<FieldFactsShape, Placed[]>()
  for (const p of placed) {
    let group = groups.get(p.field)
    if (!group) groups.set(p.field, (group = []))
    group.push(p)
  }
  const leftOut = new Map<string, string>()
  for (const [field, group] of groups)
    if (field.kind === 'unknown') for (const p of group) leftOut.set(p.id, field.name)

  const tree = toggleTree(form)
  const fields: FileField[] = []
  for (const [field, group] of groups) {
    if (field.kind === 'unknown' || field.name === '') continue
    fields.push(fieldOf(form, field, group, leftOut, tree))
  }
  return fields
}

/** What PDF.js's `_getOptInfo` reads of the field tree around a toggle widget. */
interface ToggleTree {
  /** The `/Kids` of the dictionary each reference's `/Parent` names, by id. */
  siblings: Map<string, readonly FieldTreeEntryShape[]>
  /** The first state of `/AP /N` that is not `Off`, of each widget, by id. */
  onStates: Map<string, string | undefined>
}

function toggleTree(form: FormFactsShape): ToggleTree {
  const siblings = new Map<string, readonly FieldTreeEntryShape[]>()
  for (const g of form.groups)
    for (const kid of g.kids)
      if (kid.ref && kid.otherParent !== true && !siblings.has(refId(kid.ref)))
        siblings.set(refId(kid.ref), g.kids)
  const onStates = new Map<string, string | undefined>()
  for (const f of form.fields)
    for (const w of f.widgets) {
      if (w.objectNumber === undefined) continue
      const id = refId({ objectNumber: w.objectNumber, generation: w.generation ?? 0 })
      if (!onStates.has(id)) onStates.set(id, firstOnState(w))
    }
  return { siblings, onStates }
}

/** The first state of `/AP /N` that is not `Off`, as PDF.js's `_getOnStateName` gives it. */
const firstOnState = (w: WidgetFactsShape): string | undefined =>
  w.appearanceStates.find((s) => s !== 'Off')

/** PDF.js's `_getOptInfo`: a toggle widget's `/Opt`, its place and its siblings' on-states'. */
interface OptInfo {
  current: number | null
  opt: readonly (FileTextShape | { name: string } | null)[]
  stateToIndex: Map<string, number>
}

function optInfoOf(
  field: FieldFactsShape,
  w: WidgetFactsShape,
  onState: string | undefined,
  tree: ToggleTree
): OptInfo | null {
  // `/Opt` looked up from the widget, then along `/Parent`: the field's is inherited the same way.
  const opt = w.toggleOptions !== undefined ? w.toggleOptions : field.toggleOptions
  if (!Array.isArray(opt)) return null
  const id =
    w.objectNumber === undefined
      ? undefined
      : refId({ objectNumber: w.objectNumber, generation: w.generation ?? 0 })
  const kids = id === undefined ? undefined : tree.siblings.get(id)
  const stateToIndex = new Map<string, number>()
  let current: number | null = null
  if (kids) {
    for (let i = 0; i < Math.min(kids.length, opt.length); i++) {
      const kid = kids[i]!
      if (kid.ref && refId(kid.ref) === id) current = i
      if (!kid.dictionary || !kid.ref) continue
      const state = tree.onStates.get(refId(kid.ref))
      if (state !== undefined && !stateToIndex.has(state)) stateToIndex.set(state, i)
    }
  } else if (opt.length === 1 && onState !== undefined) {
    current = 0
    stateToIndex.set(onState, 0)
  }
  return { current, opt, stateToIndex }
}

/** PDF.js's `_getExportValueForOptIndex`: the `/Opt` entry at `index` when it is text or a name. */
function optAt(info: OptInfo, index: number | null | undefined): string | null {
  if (typeof index !== 'number' || !Number.isInteger(index)) return null
  if (index < 0 || index >= info.opt.length) return null
  const entry = info.opt[index]
  if (entry === null || entry === undefined) return null
  return typeof entry === 'object' && 'name' in entry ? entry.name : textOf(entry)
}

/**
 * PDF.js's `_getExportValue`: a state mapped through `/Opt`, for a widget whose on-state is
 * `onState`.
 */
function exportValueOf(
  state: Value,
  info: OptInfo | null,
  onState: string | undefined
): Value {
  if (!info || typeof state !== 'string' || state === 'Off') return state
  if (state === onState) {
    const value = optAt(info, info.current)
    if (value !== null) return value
  }
  if (info.stateToIndex.has(state)) {
    const value = optAt(info, info.stateToIndex.get(state))
    if (value !== null) return value
  }
  const index = parseInt(state, 10)
  return Number.isInteger(index) && String(index) === state
    ? optAt(info, index) || state
    : state
}

/**
 * @internal The checkbox and radio widgets of each page, by page and then by id, each with the
 * on-state PDF.js draws for it: a checkbox's picked from its states and its field's value as
 * `checkboxOn` picks it, a radio's the first state of `/AP /N` that is not `Off`, as the engine
 * reports it (absent when it has none). A widget on no page is left out.
 */
export function toggleOnStates(
  form: FormFactsShape
): Map<number, Map<string, string | undefined>> {
  const pages = new Map<number, Map<string, string | undefined>>()
  for (const field of form.fields) {
    if (field.kind !== 'checkbox' && field.kind !== 'radio') continue
    const raw = field.kind === 'checkbox' ? rawValue(field) : null
    for (const w of field.widgets) {
      if (w.page < 0) continue
      let toggles = pages.get(w.page)
      if (!toggles) pages.set(w.page, (toggles = new Map<string, string | undefined>()))
      const id = annotationId(w.page, w)
      if (toggles.has(id)) continue
      toggles.set(id, field.kind === 'checkbox' ? checkboxOn(w, raw) : w.onState)
    }
  }
  return pages
}

/** A checkbox widget's on-state as PDF.js picks it, with the field's value `value`. */
function checkboxOn(w: WidgetFactsShape, value: Value): string {
  const own = w.appearanceState !== undefined ? w.appearanceState : value
  const yes = typeof own === 'string' && own !== 'Off' ? own : 'Yes'
  const states = w.appearanceStates
  if (states.length === 0) return yes
  if (states.length === 1) return states[0] === 'Off' ? yes : states[0]!
  if (states.includes(yes)) return yes
  return states.find((s) => s !== 'Off')!
}

function fieldOf(
  form: FormFactsShape,
  field: FieldFactsShape,
  group: readonly Placed[],
  leftOut: ReadonlyMap<string, string>,
  tree: ToggleTree
): FileField {
  const raw = rawValue(field)
  const defaultRaw = decode(field.defaultValueKind, field.defaultValue)
  const first = group[0]!.widget

  let value: Value = raw
  let defaultValue: Value = defaultRaw
  let options: FileField['options']
  let maxLength: number | undefined
  const onValues = new Map<WidgetFactsShape, string>()
  /** Each checkbox widget's own value. */
  const widgetValues = new Map<WidgetFactsShape, string>()
  switch (field.kind) {
    case 'text':
      value = typeof raw === 'string' ? raw : ''
      maxLength =
        Number.isInteger(field.maxLength) && field.maxLength! > 0 ? field.maxLength : 0
      break
    case 'checkbox': {
      // PDF.js's `_processCheckBox`, for each widget: its value from its own `/AS`, else the
      // field's `/V`, and its values mapped through `/Opt`.
      const read = (widget: WidgetFactsShape) => {
        const onState = checkboxOn(widget, raw)
        const info = optInfoOf(field, widget, onState, tree)
        const exportValue = exportValueOf(onState, info, onState) as string
        const own = widget.appearanceState !== undefined ? widget.appearanceState : raw
        const kept = own === 'Off' || own === onState || own === exportValue ? own : 'Off'
        return {
          exportValue,
          value: exportValueOf(kept, info, onState),
          defaultValue: exportValueOf(defaultRaw, info, onState) ?? 'Off',
        }
      }
      for (const { widget } of group) {
        const each = read(widget)
        onValues.set(widget, each.exportValue)
        if (typeof each.value === 'string') widgetValues.set(widget, each.value)
      }
      ;({ value, defaultValue } = read(first))
      break
    }
    case 'radio': {
      // PDF.js's `_processRadioButton`, for each widget: with no dictionary of states it has no
      // on value and its field's values stay as read.
      const read = (widget: WidgetFactsShape) => {
        if (widget.appearance !== 'states') return undefined
        const onState = firstOnState(widget)
        const info = optInfoOf(field, widget, onState, tree)
        return {
          onValue: onState === undefined ? null : exportValueOf(onState, info, onState),
          value: exportValueOf(raw, info, onState),
          defaultValue: exportValueOf(defaultRaw, info, onState) ?? 'Off',
        }
      }
      for (const { widget } of group) {
        const onValue = read(widget)?.onValue
        if (typeof onValue === 'string') onValues.set(widget, onValue)
      }
      const own = read(first)
      if (own) ({ value, defaultValue } = own)
      break
    }
    case 'combo':
    case 'list': {
      // PDF.js reads `/I` from the widget's own dictionary, not along `/Parent`. A separate
      // widget gives its own `/I`; a widget that is the field's dictionary has the field's `/I`
      // only when that dictionary holds it, not when it is inherited.
      const merged =
        field.objectNumber !== undefined &&
        first.objectNumber === field.objectNumber &&
        first.generation === field.generation
      const indices =
        'selectedIndices' in first
          ? first.selectedIndices
          : merged && field.selectedIndicesOwn === true
            ? field.selectedIndices
            : undefined
      const list = choiceValue(raw, indices, field.options ?? [])
      value = list
      options = field.options?.length
        ? field.options
        : list.map((v) => ({ exportValue: v, displayValue: v }))
      break
    }
    case 'signature':
      value = null
      break
  }
  const drawnFromValue = form.needAppearances && raw !== null
  return {
    name: field.name,
    kind: field.kind as FileField['kind'],
    flags: Number.isInteger(field.flags) && field.flags >= 0 ? field.flags : 0,
    ...(value !== null ? { value } : {}),
    ...(defaultValue !== null ? { defaultValue } : {}),
    ...(options ? { options } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    widgets: group.map((p) =>
      widgetOf(
        form,
        field,
        p,
        onValues.get(p.widget),
        widgetValues.get(p.widget),
        drawnFromValue,
        leftOut
      )
    ),
  }
}

/** PDF.js's alignment: a whole number 0, 1 or 2. */
const alignmentOf = (q: number | null | undefined): number | undefined =>
  typeof q === 'number' && Number.isInteger(q) && q >= 0 && q <= 2 ? q : undefined

function widgetOf(
  form: FormFactsShape,
  field: FieldFactsShape,
  { widget: w, id, page, at }: Placed,
  onValue: string | undefined,
  value: string | undefined,
  drawnFromValue: boolean,
  leftOut: ReadonlyMap<string, string>
): FileWidget {
  const rect = rectOf(w)
  const border = borderOf(w, rect)
  let flags = knownFlags(w.flags)
  // PDF.js hides a text widget with `/PMD` (a barcode) without setting Hidden in its flags.
  if (field.kind === 'text' && w.paperMetadata && (flags & (F_HIDDEN | F_NO_VIEW)) === 0)
    flags |= F_HIDDEN
  const borderColor = rgbOf(w.borderColor, null)
  const backgroundColor = rgbOf(w.backgroundColor, null)
  const alignment =
    field.kind === 'text'
      ? (alignmentOf(w.alignment) ?? alignmentOf(form.alignment))
      : undefined
  const da = parseDefaultAppearance(
    defaultAppearanceText(w.defaultAppearance, form.defaultAppearance)
  )
  return {
    id,
    page,
    at,
    rect,
    flags,
    hasAppearance: w.hasAppearance || drawnFromValue,
    ...(onValue !== undefined ? { onValue } : {}),
    ...(value !== undefined ? { value } : {}),
    border,
    ...(borderColor ? { borderColor } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    rotation: rotationOf(w),
    ...(alignment !== undefined ? { alignment } : {}),
    tooltip: w.tooltip === undefined ? '' : textOf(w.tooltip),
    defaultAppearance: { fontSize: da.fontSize, fontName: da.fontName, color: da.color },
    actions: withLeftOut(actionsOf(field, w), leftOut),
  }
}

/** A widget's actions as PDF.js reads them. */
function actionsOf(field: FieldFactsShape, w: WidgetFactsShape): FileWidgetActions {
  const { scripts, keystrokeInFormat } = widgetScripts(field.kind, w)
  const out: FileWidgetActions =
    Object.keys(scripts).length > 0
      ? { scripts, ...(keystrokeInFormat ? { keystrokeInFormat: true as const } : {}) }
      : {}
  if (field.kind === 'button') Object.assign(out, buttonAction(w))
  return out
}

/**
 * What PDF.js's `parseDestDictionary` reads from a push button: a URI's address, the address a
 * JavaScript action opens with `app.launchURL`, a Named action's name, and a ResetForm's fields.
 * With no `/A` dictionary it reads a mouse-down script, else a mouse-up one. A button with no
 * action and no tooltip has none.
 */
function buttonAction(w: WidgetFactsShape): FileWidgetActions {
  const hasActions = Object.keys(w.scripts).length > 0 || w.action !== undefined
  if (!hasActions && (w.tooltip === undefined || textOf(w.tooltip) === '')) return {}
  const action = w.action
  const script = action
    ? action.kind === 'JavaScript'
      ? w.scripts.A?.[0]
      : undefined
    : (w.scripts.D?.[0] ?? w.scripts.U?.[0])
  if (script !== undefined) {
    const found = urlInScript(textOf(script))
    if (!found) return {}
    const url = validUrl(cleanAddress(found.url))
    return { ...(url !== undefined ? { url } : {}), newWindow: found.newWindow }
  }
  switch (action?.kind) {
    case 'URI': {
      const url = action.uri ? validUrl(cleanUri(action.uri)) : undefined
      return url !== undefined ? { url } : {}
    }
    case 'Launch':
    case 'GoToR': {
      const address = launchAddress(action)
      const url = address === undefined ? undefined : validUrl(cleanAddress(address))
      return url !== undefined ? { url } : {}
    }
    case 'Named':
      return action.name ? { named: action.name } : {}
    case 'ResetForm': {
      const reset = action.reset
      return {
        resetForm: {
          fields: (reset?.fields ?? []).map(textOf),
          refs: (reset?.refs ?? []).map(refId),
          include: ((reset?.flags ?? 0) & 1) === 0,
        },
      }
    }
    default:
      return {}
  }
}

/** The protocols PDF.js's `createValidAbsoluteUrl` lets through. */
const PROTOCOLS: ReadonlySet<string> = new Set([
  'http:',
  'https:',
  'ftp:',
  'mailto:',
  'tel:',
])

/** A cleaned address PDF.js gives a widget as its `url`: one of its protocols, else none. */
function validUrl(address: string | undefined): string | undefined {
  return address !== undefined && PROTOCOLS.has(new URL(address).protocol)
    ? address
    : undefined
}

/**
 * The address PDF.js reads from a Launch's or GoToR's `/F`: a string's bytes, or a file
 * specification's file name (`/UF`, else `/F`). `undefined` when `/F` is neither.
 */
function launchAddress(action: FieldActionShape): string | undefined {
  if (action.fileKind === 'string') return latin1(action.file ?? new Uint8Array())
  if (action.fileKind !== 'spec') return undefined
  const name = action.specUnicodeFile ?? action.specFile
  return name === undefined ? '' : specFileName(name)
}

/** The actions with any reset reference to a left-out widget given as that widget's field name. */
function withLeftOut(
  actions: FileWidgetActions,
  leftOut: ReadonlyMap<string, string>
): FileWidgetActions {
  const reset = actions.resetForm
  if (!reset?.refs.some((r) => leftOut.has(r))) return actions
  return {
    ...actions,
    resetForm: {
      fields: [...reset.fields, ...reset.refs.flatMap((r) => leftOut.get(r) ?? [])],
      refs: reset.refs.filter((r) => !leftOut.has(r)),
      include: reset.include,
    },
  }
}
