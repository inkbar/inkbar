// The form's fields from the facts the engine reports, as the PDF.js reader builds them from the
// widgets PDF.js lists: the same fields in the same order with the values PDF.js 6.4.299 gives,
// its quirks included.
import {
  annotationId,
  borderOf,
  F_HIDDEN,
  F_NO_VIEW,
  knownFlags,
  parseDefaultAppearance,
  rectOf,
  refId,
  rgbOf,
  textOf,
} from './file-values'
import { cleanAddress, cleanUri, urlInScript } from './targets'

import type { PageFormContext, WidgetContext } from './annotations'
import type {
  FieldFactsShape,
  FieldValueKindShape,
  FieldValueShape,
  FormFactsShape,
  WidgetFactsShape,
} from './types'
import type {
  FileAnnotation,
  FileField,
  FileWidget,
  FileWidgetActions,
} from '../reader/file'

/**
 * The event names PDF.js gives a widget's scripts (its `AnnotationActionEventType`), by the
 * `/AA` key they are under, and `Action` for the widget's own `/A`. A key not here is not read.
 */
const EVENTS: ReadonlyMap<string, string> = new Map([
  ['A', 'Action'],
  ['E', 'Mouse Enter'],
  ['X', 'Mouse Exit'],
  ['D', 'Mouse Down'],
  ['U', 'Mouse Up'],
  ['Fo', 'Focus'],
  ['Bl', 'Blur'],
  ['PO', 'PageOpen'],
  ['PC', 'PageClose'],
  ['PV', 'PageVisible'],
  ['PI', 'PageInvisible'],
  ['K', 'Keystroke'],
  ['F', 'Format'],
  ['V', 'Validate'],
  ['C', 'Calculate'],
])

/** The date and time scripts PDF.js turns into one Format list for its own date input. */
const DATE_TIME = /^AF(Date|Time)_(?:Keystroke|Format)(?:Ex)?\(['"]?([^'"]+)['"]?\);$/

type Value = string | string[] | null

/** `/V` or `/DV` as PDF.js's `_decodeFormValue` gives it: text, a name, or a list of them. */
function decode(kind: FieldValueKindShape, value: FieldValueShape | undefined): Value {
  if (value === undefined || kind === 'none' || kind === 'other') return null
  if (Array.isArray(value)) {
    const list = value.flatMap((v) => (v === null ? [] : [textOf(v)]))
    return list.length > 0 ? list : null
  }
  return textOf(value)
}

/** The value PDF.js reads for a field before its kind's own rules: `/V`, else `/DV` when `/V` is absent. */
function rawValue(field: FieldFactsShape): Value {
  const value = decode(field.valueKind, field.value)
  if (field.valueKind === 'none' && value === null)
    return decode(field.defaultValueKind, field.defaultValue)
  return value
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
      const da = w.defaultAppearance ?? form.defaultAppearance
      ;(context(w.page).widgets as Map<number, WidgetContext>).set(w.index, {
        ...(da !== undefined ? { defaultAppearance: da } : {}),
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
 * its place among them, and a widget it does not list is left out, as is a widget on no page. Fields
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
  const places = new Map<number, Map<string, number>>()
  for (const page of pages.sort((a, b) => a - b)) {
    const ids = new Map<string, number>()
    ;(await listed(page)).forEach((a, at) => {
      if (!ids.has(a.id)) ids.set(a.id, at)
    })
    places.set(page, ids)
  }
  const placed: Placed[] = []
  for (const field of form.fields)
    for (const widget of field.widgets) {
      if (widget.page < 0) continue
      const id = annotationId(widget.page, widget)
      const at = places.get(widget.page)?.get(id)
      if (at !== undefined) placed.push({ field, widget, id, page: widget.page, at })
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

  const fields: FileField[] = []
  for (const [field, group] of groups) {
    if (field.kind === 'unknown' || field.name === '') continue
    fields.push(fieldOf(form, field, group, leftOut))
  }
  return fields
}

/** A checkbox widget's on-state and export value as PDF.js picks them, with the field's value `value`. */
function checkboxOn(
  w: WidgetFactsShape,
  value: Value
): { onState: string; exportValue: string } {
  const own = w.appearanceState !== undefined ? w.appearanceState : value
  const yes = typeof own === 'string' && own !== 'Off' ? own : 'Yes'
  const states = w.appearanceStates
  let onState: string
  if (states.length === 0) onState = yes
  else if (states.length === 1) onState = states[0] === 'Off' ? yes : states[0]!
  else if (states.includes(yes)) onState = yes
  else onState = states.find((s) => s !== 'Off')!
  // The engine maps its own on-state through `/Opt`; PDF.js's is the same unless the file
  // names a state the appearance does not have.
  const exportValue =
    onState === w.onState && w.exportValue !== undefined ? w.exportValue : onState
  return { onState, exportValue }
}

function fieldOf(
  form: FormFactsShape,
  field: FieldFactsShape,
  group: readonly Placed[],
  leftOut: ReadonlyMap<string, string>
): FileField {
  const raw = rawValue(field)
  const defaultRaw = decode(field.defaultValueKind, field.defaultValue)
  const first = group[0]!.widget
  // A state's export value, as PDF.js's `_getExportValue` maps one through the widgets' on-states.
  const exported = (
    state: Value,
    on?: { onState: string; exportValue: string }
  ): Value => {
    if (typeof state !== 'string' || state === 'Off') return state
    if (on && state === on.onState) return on.exportValue
    for (const { widget } of group)
      if (widget.onState === state && widget.exportValue !== undefined)
        return widget.exportValue
    return state
  }

  let value: Value = raw
  let defaultValue: Value = defaultRaw
  let options: FileField['options']
  let maxLength: number | undefined
  const onValues = new Map<WidgetFactsShape, string>()
  switch (field.kind) {
    case 'text':
      value = typeof raw === 'string' ? raw : ''
      maxLength =
        Number.isInteger(field.maxLength) && field.maxLength! > 0 ? field.maxLength : 0
      break
    case 'checkbox': {
      for (const { widget } of group)
        onValues.set(widget, checkboxOn(widget, raw).exportValue)
      const on = checkboxOn(first, raw)
      const own = first.appearanceState !== undefined ? first.appearanceState : raw
      value =
        own === 'Off' || own === on.onState || own === on.exportValue
          ? exported(own, on)
          : 'Off'
      defaultValue = exported(defaultRaw, on) ?? 'Off'
      break
    }
    case 'radio':
      for (const { widget } of group)
        if (widget.exportValue !== undefined) onValues.set(widget, widget.exportValue)
      value = exported(raw)
      defaultValue = exported(defaultRaw) ?? 'Off'
      break
    case 'combo':
    case 'list': {
      const list = typeof raw === 'string' ? [raw] : (raw ?? [])
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
      widgetOf(form, field, p, onValues.get(p.widget), drawnFromValue, leftOut)
    ),
  }
}

/** PDF.js's alignment: a whole number 0, 1 or 2. */
const alignmentOf = (q: number | null | undefined): number | undefined =>
  typeof q === 'number' && Number.isInteger(q) && q >= 0 && q <= 2 ? q : undefined

/** `/MK /R` as PDF.js keeps it: a whole multiple of 90 in 0–270, else 0. */
function rotationOf(r: number | null | undefined): number {
  if (typeof r !== 'number' || !Number.isInteger(r) || r === 0) return 0
  const angle = ((r % 360) + 360) % 360
  return angle % 90 === 0 ? angle : 0
}

function widgetOf(
  form: FormFactsShape,
  field: FieldFactsShape,
  { widget: w, id, page, at }: Placed,
  onValue: string | undefined,
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
  const daText = w.defaultAppearance ?? form.defaultAppearance
  const da = parseDefaultAppearance(daText === undefined ? '' : textOf(daText))
  return {
    id,
    page,
    at,
    rect,
    flags,
    hasAppearance: w.hasAppearance || drawnFromValue,
    ...(onValue !== undefined ? { onValue } : {}),
    border,
    ...(borderColor ? { borderColor } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    rotation: rotationOf(w.rotation),
    ...(alignment !== undefined ? { alignment } : {}),
    tooltip: w.tooltip === undefined ? '' : textOf(w.tooltip),
    defaultAppearance: { fontSize: da.fontSize, fontName: da.fontName, color: da.color },
    actions: withLeftOut(actionsOf(field, w), leftOut),
  }
}

/** A widget's actions as PDF.js reads them. */
function actionsOf(field: FieldFactsShape, w: WidgetFactsShape): FileWidgetActions {
  // Built from entries, so a key such as `__proto__` is kept as the file's own.
  const scripts: Record<string, string[]> = Object.fromEntries(
    Object.entries(w.scripts).flatMap(([key, sources]) => {
      const event = EVENTS.get(key)
      return event && sources.length > 0 ? [[event, [...sources]]] : []
    })
  )
  if (field.kind === 'text') dateTimeFormat(scripts)
  const out: FileWidgetActions = Object.keys(scripts).length > 0 ? { scripts } : {}
  if (field.kind === 'button') Object.assign(out, buttonAction(w))
  return out
}

/**
 * PDF.js gives a text field with one date or time Keystroke script and one Format script both
 * under Format, for its own date input.
 */
function dateTimeFormat(scripts: Record<string, string[]>): void {
  const format = Object.hasOwn(scripts, 'Format') ? scripts.Format : undefined
  const keystroke = Object.hasOwn(scripts, 'Keystroke') ? scripts.Keystroke : undefined
  if (
    format?.length === 1 &&
    keystroke?.length === 1 &&
    DATE_TIME.test(format[0]!) &&
    DATE_TIME.test(keystroke[0]!)
  ) {
    delete scripts.Keystroke
    scripts.Format = [...format, ...keystroke]
  }
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
    const url = cleanAddress(found.url)
    return { ...(url !== undefined ? { url } : {}), newWindow: found.newWindow }
  }
  switch (action?.kind) {
    case 'URI': {
      const url = action.uri ? cleanUri(action.uri) : undefined
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
