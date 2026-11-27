// The file's JavaScript as PDF.js 6.4.299 reads it, from the facts the engine reports: the
// document's scripts and actions, each page's actions, each widget's scripts, `/CO`, the fields
// the sandbox is started with, and whether the file has any JavaScript at all. The engine gives
// every source of each action's chain as written; each rule here is PDF.js's.
import { refId, rgbOf, rotationOf, textOf } from './file-values'

import type {
  FieldFactsShape,
  FieldGroupFactsShape,
  FieldTreeEntryShape,
  FileTextShape,
  FormFactsShape,
  ScriptFactsShape,
  WidgetFactsShape,
} from './types'
import type { FileFieldContainer, FileScripts } from '../reader/file'

/** @internal A standard date or time script, as PDF.js matches one. */
export const DATE_TIME =
  /^AF(Date|Time)_(?:Keystroke|Format)(?:Ex)?\(['"]?([^'"]+)['"]?\);$/

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

/**
 * The dictionaries PDF.js's `#collectFieldObjects` gives the sandbox an object for, as
 * `FileScripts.fields`, from the field tree the engine reports. As PDF.js does, it walks
 * `/Fields` depth first, each list in the file's order, following references only and each once,
 * and skips a Link dictionary with what lies under it. A dictionary with `/T` is named by the name
 * above it in the walk and its own `/T`; one without is named as the one above it (PDF.js looks up
 * `/Parent` then, which the walk has already named unless `/Parent` leads elsewhere). A dictionary
 * with `/Kids` written as references and no Widget `/Subtype` gives a container object; a widget
 * of a field of a kind PDF.js reads gives a widget object; any other gives none. `ids` gets each
 * object's name by id, the first one only.
 */
function walkFieldObjects(
  form: FormFactsShape,
  ids: Map<string, string>
): { fields: FileScripts['fields']; widgets: Map<string, ReachedWidget> } {
  const groups = new Map<string, FieldGroupFactsShape>()
  for (const g of form.groups)
    if (g.objectNumber !== undefined)
      groups.set(
        refId({ objectNumber: g.objectNumber, generation: g.generation ?? 0 }),
        g
      )
  const widgets = new Map<string, ReachedWidget>()
  for (const field of form.fields) {
    if (field.kind === 'unknown') continue
    for (const widget of field.widgets) {
      if (widget.objectNumber === undefined) continue
      const id = refId({
        objectNumber: widget.objectNumber,
        generation: widget.generation ?? 0,
      })
      if (!widgets.has(id)) widgets.set(id, { field, widget })
    }
  }

  // The entries of each name, names in the order the walk first reaches them.
  const byName = new Map<string, FileScripts['fields']>()
  const reached = new Map<string, ReachedWidget>()
  const visited = new Set<string>()
  const walk = (
    entry: FieldTreeEntryShape,
    above: string,
    parentParts: string[] | null
  ): void => {
    if (!entry.ref) return
    const id = refId(entry.ref)
    if (visited.has(id)) return
    visited.add(id)
    if (!entry.dictionary) return
    const group = groups.get(id)
    // The engine gives `/Subtype` only for a dictionary with `/Kids`: a Link without them gets a
    // name slot here, where PDF.js returns before naming it. Missing fact: every walked
    // dictionary's `/Subtype`.
    if (group?.subtype === 'Link') return
    const t = entry.partialName === undefined ? undefined : partOf(entry.partialName)
    const name = t === undefined ? above : above === '' ? t : `${above}.${t}`
    let list = byName.get(name)
    if (!list) byName.set(name, (list = []))
    // Its own `/T` and those up its `/Parent` chain, while that chain is the walk's.
    const own =
      entry.otherParent === true || parentParts === null
        ? null
        : [...parentParts, ...(t === undefined ? [] : [t])]
    const kids = group?.kids.flatMap((k) => (k.ref ? [refId(k.ref)] : [])) ?? []
    // A second dictionary of a full name the engine already has is merged into that field: its
    // widgets take the field's /V, /FT and /Ff, and a toggle's export values its /Opt. Missing
    // fact: each such dictionary's own /V, /DV, /FT, /Ff and /Opt.
    const widget = widgets.get(id)
    if (group && group.subtype !== 'Widget' && kids.length > 0) {
      list.push({ name, id, widgets: [], container: containerOf(group, kids, own) })
      if (!ids.has(id)) ids.set(id, name)
    } else if (widget) {
      // A Widget with /Kids (a radio parent written as a widget) gives PDF.js a widget-class
      // object; here it gives one only when the engine lists it as a field's widget. Missing
      // fact: the field facts of a Widget dictionary with /Kids that is no field's widget.
      const last = list.at(-1)
      if (last) last.widgets.push(id)
      else list.push({ name, widgets: [id] })
      reached.set(id, widget)
      if (!ids.has(id)) ids.set(id, name)
    }
    for (const kid of group?.kids ?? []) walk(kid, name, own)
  }
  for (const entry of form.fieldsRoot)
    walk(entry, '', entry.otherParent === true ? null : [])
  return { fields: [...byName.values()].flat(), widgets: reached }
}

/** A widget PDF.js's walk reaches, with its field. */
interface ReachedWidget {
  field: FieldFactsShape
  widget: WidgetFactsShape
}

/** A `/T` as PDF.js's `stringToPDFString` reads it; one that is no string reads as empty. */
const partOf = (t: FileTextShape | null): string => (t === null ? '' : textOf(t))

/**
 * A container's facts as PDF.js reads them. Its full name is its own `/T` and each up its
 * `/Parent` chain (`parts`, when that chain is the walk's), else the engine's name, which leaves
 * an empty `/T` out where PDF.js keeps it.
 */
function containerOf(
  group: FieldGroupFactsShape,
  kids: string[],
  parts: string[] | null
): FileFieldContainer {
  const scripts = Object.fromEntries(byEvent(group.scripts, WIDGET_EVENTS))
  const borderColor = rgbOf(group.borderColor, null)
  const backgroundColor = rgbOf(group.backgroundColor, null)
  return {
    fullName: parts ? parts.join('.') : group.name,
    kids,
    ...(Object.keys(scripts).length > 0 ? { scripts } : {}),
    page: group.page ?? -1,
    ...(borderColor ? { borderColor } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    rotation: rotationOf(group),
  }
}

/**
 * @internal The file's JavaScript in core's shape, as core read it with PDF.js, and whether the
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

  const names = new Map<string, string>()
  const walked = form
    ? walkFieldObjects(form, names)
    : { fields: [], widgets: new Map<string, ReachedWidget>() }
  // PDF.js counts the actions of every object it builds: a container's, and a widget's of a
  // kind it builds one with actions for.
  const fieldScripts =
    walked.fields.some((e) => e.container?.scripts !== undefined) ||
    [...walked.widgets.values()].some(
      ({ field, widget }) =>
        SCRIPTED_KINDS.has(field.kind) &&
        Object.keys(widgetScripts(field.kind, widget).scripts).length > 0
    )

  const calculationOrderIds = (form?.calculationOrderRefs ?? []).flatMap((ref) =>
    ref ? [refId(ref)] : []
  )
  return {
    scripts: {
      calculationOrder: calculationOrderIds.flatMap((id) => names.get(id) ?? []),
      calculationOrderIds,
      document,
      documentActions,
      fields: walked.fields,
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
 * when it has none. Built from entries, as core built them with PDF.js.
 */
export function pageScriptsFromEngine(
  facts: ScriptFactsShape,
  page: number
): Record<string, string[]> {
  const own = facts.pageActions.find((p) => p.page === page)
  return own ? Object.fromEntries(byEvent(own.scripts, PAGE_EVENTS)) : {}
}
