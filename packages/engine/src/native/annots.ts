// A page's annotations as the module's `INK_Annots_Page` report gives them.
import {
  array,
  bad,
  boolean,
  count,
  fileText,
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
  takeJson,
  type Json,
} from './report.ts'

import type { AnnotationFacts, AppearanceFacts, PageAnnotations } from '../types.ts'
import type { Heap } from './strings.ts'

const APPEARANCES = ['stream', 'states'] as const

/**
 * A name the report writes as `null` only when its budget ran out. Then the entry says
 * `truncated` (`cut`), and the name is left out.
 */
export function cutName(
  item: Json,
  key: string,
  what: string,
  cut = item.truncated === true
): string | undefined {
  const value = item[key]
  if (value !== null) return name(value, what, key)
  if (!cut) throw bad(what, key, 'a name, or null in a cut entry')
  return undefined
}

/** The keys an annotation and a widget share, written alike for both. */
export function appearanceFacts(item: Json, what: string): AppearanceFacts {
  const facts: AppearanceFacts = {
    rect: item.rect === null ? null : numbers(item.rect, what, 'rect'),
    rectOk: boolean(item.rectOk, what, 'rectOk'),
    flags: number(item.flags, what, 'flags'),
    hasAppearance: boolean(item.hasAppearance, what, 'hasAppearance'),
    appearanceStates: present(item.states)
      ? array(item.states, what, 'states').map((s) => name(s, what, 'states'))
      : [],
  }
  if (facts.rect && facts.rect.length > 4) throw bad(what, 'rect', 'four numbers at most')
  if (!('appearance' in item)) throw bad(what, 'appearance', 'stream, states or null')
  if (item.appearance !== null)
    facts.appearance = oneOf(APPEARANCES, item.appearance, what, 'appearance')
  if (present(item.states) !== (facts.appearance === 'states'))
    throw bad(what, 'states', 'a list exactly when the appearance is states')
  if ('as' in item) {
    const state = cutName(item, 'as', what)
    if (state !== undefined) facts.appearanceState = state
  }
  if (present(item.borderStyle)) {
    const style = object(item.borderStyle, what, 'borderStyle')
    facts.borderStyle = {
      width: numberOrNull(style.width, what, 'borderStyle.width'),
      style: style.style === null ? null : name(style.style, what, 'borderStyle.style'),
    }
  }
  if (present(item.border)) facts.border = numbers(item.border, what, 'border')
  return facts
}

function annotation(raw: unknown, what: string): AnnotationFacts {
  const item = object(raw, what, 'annots')
  const entry: AnnotationFacts = {
    index: count(item.index, what, 'index'),
    subtype: cutName(item, 'subtype', what) ?? '',
    ...objectId(item, what),
    ...appearanceFacts(item, what),
  }
  for (const key of ['quads', 'color', 'interiorColor', 'line', 'vertices'] as const)
    if (present(item[key])) entry[key] = numbers(item[key], what, key)
  if (present(item.opacity)) entry.opacity = number(item.opacity, what, 'opacity')
  else if (item.opacity === null) entry.opacity = null
  for (const key of ['contents', 'author', 'created', 'modified'] as const)
    if (present(item[key])) entry[key] = fileText(item[key], what, key)
  for (const key of ['icon', 'intent'] as const)
    if (key in item) {
      const value = cutName(item, key, what)
      if (value !== undefined) entry[key] = value
    }
  if (present(item.inReplyTo)) entry.inReplyTo = ref(item.inReplyTo, what, 'inReplyTo')
  if (present(item.lineEndings))
    entry.lineEndings = array(item.lineEndings, what, 'lineEndings').map((n) =>
      n === null ? null : name(n, what, 'lineEndings')
    )
  if (present(item.inkLists))
    entry.inkLists = array(item.inkLists, what, 'inkLists').map((path) =>
      path === null ? null : numbers(path, what, 'inkLists')
    )
  if (present(item.da)) entry.defaultAppearance = fileText(item.da, what, 'da')
  if ('q' in item) entry.alignment = numberOrNull(item.q, what, 'q')
  if (onlyTrue(item.pmd, what, 'pmd')) entry.paperMetadata = true
  if (present(item.parent)) entry.parent = ref(item.parent, what, 'parent')
  if (onlyTrue(item.truncated, what, 'truncated')) entry.truncated = true
  return entry
}

/** The JSON `INK_Annots_Page` returns. */
export function parsePageAnnotations(text: string): PageAnnotations {
  const what = "A page's annotations"
  const root = object(parse(text, what), what, 'root')
  const truncated = boolean(root.truncated, what, 'truncated')
  const result: PageAnnotations = {
    annotations: array(root.annots, what, 'annots').map((raw) => annotation(raw, what)),
    truncated,
  }
  if (!('tabs' in root)) throw bad(what, 'tabs', 'a name or null')
  if (root.tabs !== null) result.tabs = name(root.tabs, what, 'tabs')
  return result
}

export function readPageAnnotations(
  heap: Heap,
  doc: number,
  index: number
): PageAnnotations {
  return parsePageAnnotations(
    takeJson(heap, heap.fn.INK_Annots_Page(doc, index), "A page's annotations")
  )
}
