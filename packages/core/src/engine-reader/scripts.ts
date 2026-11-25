// The file's JavaScript as PDF.js 6.4.299 reads it, from the facts the engine reports: the
// document's scripts and actions, each page's actions, each widget's scripts, `/CO`, the fields
// the sandbox is started with, and whether the file has any JavaScript at all. The engine gives
// every source of each action's chain as written; each rule here is PDF.js's.
import { DATE_TIME } from '../pdfjs/sandbox-fields'

import { refId, textOf } from './file-values'

import type {
  FieldFactsShape,
  FormFactsShape,
  ScriptFactsShape,
  WidgetFactsShape,
} from './types'
import type { FileScripts } from '../reader/file'

/** A widget's additional-action keys by the event names PDF.js gives them, and `A` its own `/A`. */
const WIDGET_EVENTS: ReadonlyMap<string, string> = new Map([
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

/** The catalog's additional-action keys PDF.js reads, by its event names. */
const DOCUMENT_EVENTS: ReadonlyMap<string, string> = new Map([
  ['WC', 'WillClose'],
  ['WS', 'WillSave'],
  ['DS', 'DidSave'],
  ['WP', 'WillPrint'],
  ['DP', 'DidPrint'],
])

/** A page's additional-action keys PDF.js reads, by its event names. */
const PAGE_EVENTS: ReadonlyMap<string, string> = new Map([
  ['O', 'PageOpen'],
  ['C', 'PageClose'],
])

/** The events PDF.js lists among the document's scripts, which core keeps as its actions. */
const ACTION_EVENTS: ReadonlySet<string> = new Set([
  'OpenAction',
  ...DOCUMENT_EVENTS.values(),
])

/** The field kinds PDF.js builds a field object with actions for. */
const SCRIPTED_KINDS: ReadonlySet<FieldFactsShape['kind']> = new Set([
  'text',
  'checkbox',
  'radio',
  'button',
  'combo',
  'list',
])

/**
 * An action chain's sources as PDF.js's `_collectJS` keeps them: NULs dropped, a source left empty
 * dropped, each trimmed.
 */
function collected(sources: readonly string[]): string[] {
  return sources.flatMap((source) => {
    const code = source.replaceAll('\0', '')
    return code ? [code.trim()] : []
  })
}

/**
 * The script PDF.js reads from a named or open action: the action's own source, NULs dropped,
 * untrimmed; `undefined` when that leaves nothing. PDF.js does not follow its `/Next`.
 */
function ownSource(sources: readonly string[] | undefined): string | undefined {
  const code = sources?.[0]?.replaceAll('\0', '')
  return code ? code : undefined
}

/** `scripts` by event name: each key `events` names, its sources as PDF.js collects them. */
function byEvent(
  scripts: Record<string, string[]>,
  events: ReadonlyMap<string, string>
): [string, string[]][] {
  return Object.entries(scripts).flatMap(([key, sources]) => {
    const event = events.get(key)
    const list = event ? collected(sources) : []
    return event && list.length > 0 ? [[event, list] as [string, string[]]] : []
  })
}

/**
 * @internal A widget's scripts by event as PDF.js gives them, and whether its Keystroke script is
 * among its Format scripts: a text field with one date or time Keystroke script and one Format
 * script has both under Format, the Format first, as PDF.js gives them for its own date input.
 * Built from entries, so a key such as `__proto__` stays an own key.
 */
export function widgetScripts(
  kind: FieldFactsShape['kind'],
  w: WidgetFactsShape
): { scripts: Record<string, string[]>; keystrokeInFormat: boolean } {
  const scripts: Record<string, string[]> = Object.fromEntries(
    byEvent(w.scripts, WIDGET_EVENTS)
  )
  let keystrokeInFormat = false
  if (kind === 'text') {
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
      keystrokeInFormat = true
    }
  }
  return { scripts, keystrokeInFormat }
}

/** The widgets of `field` PDF.js builds field objects for: those written as indirect objects. */
function reached(field: FieldFactsShape): WidgetFactsShape[] {
  // PDF.js walks `/Fields` by reference: a field or widget written inline is not reached.
  if (field.origin !== 'acroform' || field.objectNumber === undefined) return []
  if (field.kind === 'unknown') return []
  return field.widgets.filter((w) => w.objectNumber !== undefined)
}

/**
 * @internal The file's JavaScript in core's shape, as the PDF.js reader gives it, and whether the
 * file has any: as with PDF.js, it has when the document has a script or action, or a widget of a
 * field `/Fields` reaches has one; a page's own actions do not count. `form` is the form's facts,
 * `undefined` when it could not be read. `scripts` is given either way: the sandbox's fields are
 * built from its `fields`.
 */
export function fileScriptsFromEngine(
  facts: ScriptFactsShape,
  form: FormFactsShape | undefined
): { scripts: FileScripts; hasScripts: boolean } {
  // PDF.js's `jsActions`: the catalog's additional actions in the file's order, then each name of
  // the name tree and the open action, each with the source of its own action.
  const actions = new Map<string, string[]>(
    byEvent(facts.documentActions, DOCUMENT_EVENTS)
  )
  const named = new Map<string, string>()
  // The engine lists every source of a name's chain; the first is the action's own.
  for (let i = 0; i < facts.document.length;) {
    const { name } = facts.document[i]!
    const text = name === null ? undefined : textOf(name)
    const sources: string[] = []
    for (; i < facts.document.length && sameName(facts.document[i]!.name, name); i++)
      sources.push(facts.document[i]!.source)
    const source = ownSource(sources)
    if (text !== undefined && source !== undefined) named.set(text, source)
  }
  const open = Object.hasOwn(facts.documentActions, 'OpenAction')
    ? ownSource(facts.documentActions.OpenAction)
    : undefined
  if (open !== undefined) named.set('OpenAction', open)
  for (const [name, source] of named) {
    const list = actions.get(name)
    if (list) list.push(source)
    else actions.set(name, [source])
  }

  const document: FileScripts['document'] = []
  const documentActions: FileScripts['documentActions'] = {}
  for (const [name, sources] of actions) {
    if (ACTION_EVENTS.has(name)) documentActions[name] = sources
    else for (const source of sources) document.push({ name, source })
  }

  const fields: FileScripts['fields'] = []
  const names = new Map<string, string>()
  let fieldScripts = false
  for (const field of form?.fields ?? []) {
    const widgets = reached(field)
    if (widgets.length === 0) continue
    const own = refId({
      objectNumber: field.objectNumber!,
      generation: field.generation ?? 0,
    })
    const ids = widgets.map((w) =>
      refId({ objectNumber: w.objectNumber!, generation: w.generation ?? 0 })
    )
    const id = ids.includes(own) ? undefined : own
    fields.push({ name: field.name, ...(id !== undefined ? { id } : {}), widgets: ids })
    for (const each of id !== undefined ? [id, ...ids] : ids)
      if (!names.has(each)) names.set(each, field.name)
    if (
      !fieldScripts &&
      SCRIPTED_KINDS.has(field.kind) &&
      widgets.some((w) => Object.keys(widgetScripts(field.kind, w).scripts).length > 0)
    )
      fieldScripts = true
  }

  const calculationOrderIds = (form?.calculationOrderRefs ?? []).flatMap((ref) =>
    ref ? [refId(ref)] : []
  )
  return {
    scripts: {
      calculationOrder: calculationOrderIds.flatMap((id) => names.get(id) ?? []),
      calculationOrderIds,
      document,
      documentActions,
      fields,
    },
    hasScripts: fieldScripts || actions.size > 0,
  }
}

/** Whether two names of the tree are the same, as text or bytes. */
function sameName(a: ScriptFactsShape['document'][number]['name'], b: typeof a): boolean {
  if (a === null || b === null) return a === b
  return textOf(a) === textOf(b)
}

/**
 * @internal Page `page`'s actions by event as PDF.js reads them (`PageOpen`, `PageClose`); `{}`
 * when it has none. Built from entries, as the PDF.js reader builds them.
 */
export function pageScriptsFromEngine(
  facts: ScriptFactsShape,
  page: number
): Record<string, string[]> {
  const own = facts.pageActions.find((p) => p.page === page)
  return own ? Object.fromEntries(byEvent(own.scripts, PAGE_EVENTS)) : {}
}
