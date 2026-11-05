/*
 * What a record list lists: a source of items, each with a page and maybe a rect, the card each
 * one shows, a selection, and how to reveal an item and run its actions. `recordsSource` lists
 * a plugin's records the way its marks draw them; `searchSource` lists the viewer's search hits.
 * A host can write its own.
 */
import { derived, type Readable } from '../../model/readable'
import { isBlankQuery } from '../../model/search-text'
import { readingOrder } from '../plugins/registry'

import type { Rect } from '../../model/geometry'
import type { RecordBase, RecordChange, RecordStore } from '../../model/records'
import type { SearchHit } from '../../model/search'
import type { CardSpec } from '../plugins/api/card'
import type { PluginHost } from '../plugins/host'
import type { ViewerSearch } from '../search/controller'
import type { Viewport } from '../viewport'

/** One thing a list shows: an id unique in the list, its 0-based page, and where on it. */
export interface ListItem {
  id: string
  page: number
  /** In user space. */
  rect?: Rect
}

export interface RecordListSource<I extends ListItem = ListItem> {
  /** What is listed, filtered and in order. */
  readonly items: Readable<readonly I[]>
  /** The card `item` shows, or null for none. */
  card(item: I): CardSpec | null
  /** The selected item's id, or null. */
  readonly selected: Readable<string | null>
  select(id: string | null): void
  /** Scrolls the viewport to the item; for records, to its mark's rect. */
  reveal(item: I): void
  /** Runs an action as one undo step. */
  run(item: I, fn: () => void): void
  /**
   * Whether the change to `items` being emitted came from undo or redo, or from another
   * document opening: a change nobody made from the list, which the list does not announce.
   */
  readonly replaying: () => boolean
  /**
   * Polite text to announce, in place of the list's own "N items". A source whose items change
   * as a scan runs announces once it settles.
   */
  readonly announcement?: Readable<string>
}

export interface RecordsSourceOptions<T> {
  /** The card each record shows. Default: its mark's card, else its mark's label (or id) and no actions. */
  card?(record: T): CardSpec
  /** Which records to list. Default: those that have a mark, or every record when no `marks` call covers them. */
  where?(record: T): boolean
  /** The order. Default: page, then top to bottom and left to right by the mark's rect. */
  sort?(a: T, b: T): number
}

export interface RecordsSourceDeps {
  pluginHost: PluginHost
  /** The viewport `reveal` scrolls; null while none is mounted. */
  viewport: Readable<Viewport | null>
}

const NO_ITEMS: readonly never[] = Object.freeze([])

const sameList = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i])

const isRect = (value: unknown): value is Rect =>
  typeof value === 'object' &&
  value !== null &&
  ['x', 'y', 'width', 'height'].every(
    (k) => typeof (value as Record<string, unknown>)[k] === 'number'
  )

function reducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * The records a plugin keeps under `key` (`<plugin>.<name>`), as its marks show them: each
 * record takes its card, label and rect from the first `marks` registration whose `where` it
 * passes, and its actions run in that plugin's undo step. Follows the open document. The
 * selection is the host's for `key`, shared with the marks and every other list.
 */
export function recordsSource<T extends RecordBase & { page: number }>(
  deps: RecordsSourceDeps,
  key: string,
  opts: RecordsSourceOptions<T> = {}
): RecordListSource<T> {
  const { pluginHost } = deps
  const records = pluginHost.records<T>(key)
  const selection = pluginHost.selection(key)
  const marks = pluginHost.marks

  const resolve = (record: T) => marks.resolve<T>(key, record)
  const rectOf = (record: T): Rect | undefined => {
    const reg = resolve(record)
    if (reg) return reg.rect(record)
    const own = (record as { rect?: unknown }).rect
    return isRect(own) ? own : undefined
  }
  const passes = (record: T): boolean =>
    opts.where
      ? opts.where(record)
      : marks.of(key).length === 0 || resolve(record) !== undefined
  const order = opts.sort?.bind(opts) ?? readingOrder<T>(rectOf)
  const compute = (): readonly T[] => {
    const list = records.all().filter(passes)
    return list.length === 0 ? NO_ITEMS : list.sort(order)
  }

  // Live while subscribed: the store's changes say which are undo and redo.
  const subs = new Set<(items: readonly T[]) => void>()
  let value: readonly T[] = NO_ITEMS
  let replay = false
  let store: RecordStore<T> | null = null
  let stopChanges: (() => void) | undefined
  let stopWatching: (() => void) | undefined

  const publish = (replaying: boolean, force = false) => {
    const next = compute()
    if (!force && sameList(next, value)) return
    value = next
    replay = replaying
    try {
      for (const fn of [...subs]) fn(next)
    } finally {
      replay = false
    }
  }
  /** Follows the store the handle holds now; another store is another document. */
  const follow = () => {
    const next = records.store()
    if (next === store) return
    stopChanges?.()
    store = next
    stopChanges = next?.on('change', (change: RecordChange<T>) =>
      publish(change.kind === 'replace')
    )
    publish(true)
  }
  const start = () => {
    store = records.store()
    value = compute()
    stopChanges = store?.on('change', (change: RecordChange<T>) =>
      publish(change.kind === 'replace')
    )
    // The list emits on a store swap, before a change's own event; `follow` tells them apart.
    const stopList = records.list.subscribe(follow)
    // The viewport changes with the document too, which catches a swap between empty stores.
    const stopViewport = deps.viewport.subscribe(follow)
    // Registrations change cards and filters, not records: never announced.
    const stopMarks = marks.watch(() => publish(true, true))
    stopWatching = () => {
      stopList()
      stopViewport()
      stopMarks()
      stopChanges?.()
      stopChanges = undefined
      store = null
    }
  }

  const items: Readable<readonly T[]> = {
    get: () => (subs.size > 0 ? value : compute()),
    subscribe(fn) {
      if (subs.size === 0) start()
      subs.add(fn)
      return () => {
        if (!subs.delete(fn) || subs.size > 0) return
        stopWatching?.()
        stopWatching = undefined
      }
    },
  }

  return {
    items,
    card(record) {
      if (opts.card) return opts.card(record)
      const reg = resolve(record)
      return (
        reg?.card?.(record) ?? { title: reg?.label(record) ?? record.id, actions: {} }
      )
    },
    selected: selection.selected,
    select: (id) => selection.select(id),
    reveal(record) {
      const viewport = deps.viewport.get()
      if (!viewport) return
      const behavior: ScrollBehavior = reducedMotion() ? 'instant' : 'smooth'
      const rect = rectOf(record)
      if (rect) viewport.scrollToRect(record.page, rect, { behavior })
      else viewport.scrollToPage(record.page, { behavior })
    },
    run(record, fn) {
      const reg = resolve(record)
      if (reg) reg.batch(fn)
      else records.batch(fn)
    },
    replaying: () => replay,
  }
}

/**
 * The viewer's search hits: one item per hit, id `<page>:<index>` with `index` into
 * `state.hits`, its page as the card's meta and its context as the excerpt, with no actions.
 * Selecting one makes it the current hit, as the find bar's next and previous do, and the
 * current hit is the selected item. It announces the result count once a scan settles.
 */
export function searchSource(search: ViewerSearch): RecordListSource {
  const hitOf = new WeakMap<ListItem, { hit: SearchHit; index: number }>()
  let lastHits: readonly SearchHit[] | null = null
  let lastItems: readonly ListItem[] = NO_ITEMS
  const itemsFor = (hits: readonly SearchHit[]): readonly ListItem[] => {
    if (hits === lastHits) return lastItems
    lastHits = hits
    lastItems = hits.map((hit, index) => {
      const item: ListItem = {
        id: `${hit.page}:${index}`,
        page: hit.page,
        rect: hit.rect,
      }
      hitOf.set(item, { hit, index })
      return item
    })
    return lastItems
  }

  let said = ''
  const announcement = derived(search.state, (s) => {
    if (isBlankQuery(s.query)) said = ''
    else if (!s.scanning)
      said =
        s.hits.length === 0
          ? 'No results'
          : `${s.hits.length} ${s.hits.length === 1 ? 'result' : 'results'}`
    return said
  })

  return {
    items: derived(search.state, (s) => itemsFor(s.hits)),
    card(item) {
      const found = hitOf.get(item)
      if (!found) return null
      const { hit, index } = found
      return {
        title: `Match ${index + 1}`,
        meta: `Page ${hit.page + 1}`,
        excerpt: { before: hit.before, match: hit.text, after: hit.after },
        actions: {},
      }
    },
    selected: derived(search.state, (s) => {
      const hit = s.hits[s.current]
      return hit ? `${hit.page}:${s.current}` : null
    }),
    select(id) {
      if (id === null) return
      const index = Number(id.slice(id.indexOf(':') + 1))
      search.select(index)
    },
    // Making a hit current scrolls to it already.
    reveal() {},
    run: (_, fn) => fn(),
    replaying: () => false,
    announcement,
  }
}
