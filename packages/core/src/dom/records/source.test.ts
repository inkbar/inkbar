import { describe, expect, it, vi } from 'vitest'

import { staticDefaults } from '../../model/annotations/defaults'
import { createHistory } from '../../model/annotations/history'
import { createAnnotationStore } from '../../model/annotations/store'
import { writable } from '../../model/readable'
import { definePlugin } from '../plugins/define'
import { createPluginHost } from '../plugins/host'
import { createSearchController } from '../search/controller'

import { recordsSource, searchSource, type RecordsSourceOptions } from './source'

import type { DocumentStatus, InkDocument } from '../../model/document'
import type { Rect } from '../../model/geometry'
import type { RecordBase } from '../../model/records'
import type { SearchHit } from '../../model/search'
import type { MarksRegistration } from '../plugins/registry'
import type { SearchState, ViewerSearch } from '../search/controller'
import type { Viewport } from '../viewport'

interface Suggestion extends RecordBase {
  page: number
  rect: Rect
  reason: string
  status: string
}

const suggestion = (
  id: string,
  page: number,
  y: number,
  status = 'open',
  x = 100
): Suggestion => ({
  id,
  page,
  rect: { x, y, width: 50, height: 10 },
  reason: `Reason ${id}`,
  status,
})

function fakeDocument(key: string): InkDocument {
  return {
    key,
    status: writable<DocumentStatus>({ state: 'ready' }),
  } as unknown as InkDocument
}

/** A host over a real history whose plugin `sandbox` keeps `suggestions`. */
function setup(initial: Suggestion[]) {
  const plugin = definePlugin('sandbox', (api) => {
    api.records<Suggestion>('suggestions', { initial: () => initial })
  })
  const history = createHistory(
    createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
  )
  const pluginHost = createPluginHost({
    plugins: [plugin()],
    document: writable<InkDocument | null>(fakeDocument('a')),
    history: () => history,
    activated: writable<string | null>(null),
    setActivated() {},
    root: writable<HTMLElement | null>(null),
  })
  const scrollToRect = vi.fn()
  const scrollToPage = vi.fn()
  const viewport = writable<Viewport | null>({
    scrollToRect,
    scrollToPage,
  } as unknown as Viewport)
  const records = pluginHost.records<Suggestion>('sandbox.suggestions')
  /** Registers a marks call over the suggestions, as `plugin.marks` does. */
  const register = (reg: Partial<MarksRegistration<Suggestion>>) =>
    pluginHost.marks.add('sandbox.suggestions', {
      plugin: 'sandbox',
      where: () => true,
      label: (s: Suggestion) => s.reason,
      rect: (s: Suggestion) => s.rect,
      batch: (fn: () => void) => history.batch(fn),
      ...reg,
    })
  const source = (opts?: RecordsSourceOptions<Suggestion>) =>
    recordsSource<Suggestion>({ pluginHost, viewport }, 'sandbox.suggestions', opts)
  return { pluginHost, history, records, register, source, scrollToRect, scrollToPage }
}

const ids = (items: readonly { id: string }[]) => items.map((i) => i.id)

describe('recordsSource', () => {
  it('records source filters by the registrations and sorts in reading order', () => {
    const { register, source, records } = setup([
      suggestion('a', 1, 500),
      suggestion('b', 0, 100),
      suggestion('c', 0, 600),
      suggestion('d', 0, 600, 'open', 20),
      suggestion('e', 0, 300, 'dismissed'),
      suggestion('f', 0, 200, 'accepted'),
    ])
    register({ where: (s) => s.status === 'open' })
    register({ where: (s) => s.status === 'accepted' })
    const src = source()
    // Page first, then top to bottom (user space grows upwards), then left to right.
    expect(ids(src.items.get())).toEqual(['d', 'c', 'f', 'b', 'a'])

    const seen = vi.fn<(items: readonly Suggestion[]) => void>()
    src.items.subscribe(seen)
    records.update('e', { status: 'open' })
    expect(ids(seen.mock.lastCall![0])).toEqual(['d', 'c', 'e', 'f', 'b', 'a'])
    expect(ids(src.items.get())).toEqual(['d', 'c', 'e', 'f', 'b', 'a'])
    // A change to a record nothing lists emits nothing.
    seen.mockClear()
    records.add(suggestion('g', 0, 50, 'dismissed'))
    expect(seen).not.toHaveBeenCalled()
  })

  it("uses the first resolving registration's card", () => {
    const { register, source } = setup([
      suggestion('a', 0, 500),
      suggestion('b', 0, 400, 'accepted'),
      suggestion('c', 0, 300, 'flagged'),
    ])
    const accept = vi.fn()
    register({
      where: (s) => s.status === 'open',
      card: (s) => ({ title: `Open ${s.reason}`, actions: { Accept: accept } }),
    })
    register({
      where: (s) => s.status !== 'flagged',
      card: () => ({ title: 'Any', actions: {} }),
    })
    register({ where: (s) => s.status === 'flagged', label: (s) => `Flag ${s.id}` })
    const src = source()
    const [a, b, c] = src.items.get()
    expect(src.card(a!)).toEqual({ title: 'Open Reason a', actions: { Accept: accept } })
    expect(src.card(b!)).toEqual({ title: 'Any', actions: {} })
    // A registration with no card lists the mark's label, with no actions.
    expect(src.card(c!)).toEqual({ title: 'Flag c', actions: {} })
  })

  it('host card and where override the registration', () => {
    const { register, source } = setup([
      suggestion('a', 0, 500),
      suggestion('b', 0, 400, 'dismissed'),
      suggestion('c', 0, 300, 'dismissed'),
    ])
    register({
      where: (s) => s.status === 'open',
      card: () => ({ title: 'Plugin', actions: {} }),
    })
    const src = source({
      where: (s) => s.status === 'dismissed' || s.id === 'a',
      card: (s) => ({ title: `Host ${s.id}`, actions: {} }),
      sort: (x, y) => y.id.localeCompare(x.id),
    })
    // Records no registration resolves are listed when the host's `where` passes them.
    expect(ids(src.items.get())).toEqual(['c', 'b', 'a'])
    for (const item of src.items.get())
      expect(src.card(item)).toEqual({ title: `Host ${item.id}`, actions: {} })
  })

  it('records with no marks list by id with no actions', () => {
    const { source, records, history, scrollToRect } = setup([
      suggestion('b', 0, 400),
      suggestion('a', 1, 500),
    ])
    const src = source()
    expect(ids(src.items.get())).toEqual(['b', 'a'])
    expect(src.card(src.items.get()[0]!)).toEqual({ title: 'b', actions: {} })
    // Actions run in the host handle's batch: one undo step.
    src.run(src.items.get()[0]!, () => {
      records.update('b', { status: 'accepted' })
      records.remove('a')
    })
    expect(records.has('a')).toBe(false)
    history.undo()
    expect(records.find('b')!.status).toBe('open')
    expect(records.has('a')).toBe(true)
    // With no registration, reveal goes to the record's own rect.
    src.reveal(records.find('a')!)
    expect(scrollToRect).toHaveBeenCalledWith(
      1,
      suggestion('a', 1, 500).rect,
      expect.anything()
    )
  })

  it("reveals a record at its registration's rect and selects through the host", () => {
    const { register, source, pluginHost, scrollToRect } = setup([
      suggestion('a', 2, 500),
    ])
    register({ rect: () => ({ x: 1, y: 2, width: 3, height: 4 }) })
    const src = source()
    src.reveal(src.items.get()[0]!)
    expect(scrollToRect).toHaveBeenCalledWith(
      2,
      { x: 1, y: 2, width: 3, height: 4 },
      expect.anything()
    )
    src.select('a')
    expect(pluginHost.selection('sandbox.suggestions').selected.get()).toBe('a')
    expect(src.selected.get()).toBe('a')
  })

  it('replaying is set while undo and redo change the items', () => {
    const { source, records, history } = setup([suggestion('a', 0, 500)])
    const src = source()
    const during: boolean[] = []
    src.items.subscribe(() => during.push(src.replaying()))
    records.add(suggestion('b', 0, 400))
    history.undo()
    history.redo()
    records.remove('a')
    expect(during).toEqual([false, true, true, false])
    expect(src.replaying()).toBe(false)
  })
})

const hit = (page: number, start: number, text: string): SearchHit => ({
  page,
  start,
  end: start + text.length,
  text,
  quads: [],
  rect: { x: start, y: 700, width: 10, height: 10 },
  exact: true,
  before: `before ${start} `,
  after: ` after ${start}`,
})

/** A search controller over a document that finds `hits`. */
async function searchOver(hits: SearchHit[]) {
  const doc = {
    pages: [{}, {}, {}],
    async *search() {
      await Promise.resolve()
      yield* hits
    },
  } as unknown as InkDocument
  const search = createSearchController({
    document: writable<InkDocument | null>(doc),
    viewport: () => null,
    debounceMs: 0,
  })
  search.open('word')
  await vi.waitFor(() => {
    if (search.state.get().scanning) throw new Error('scanning')
  })
  return search
}

describe('searchSource', () => {
  it('search source lists hits with excerpts and selects through search.select', async () => {
    const search = await searchOver([
      hit(0, 5, 'word'),
      hit(0, 20, 'word'),
      hit(2, 3, 'word'),
    ])
    const select = vi.spyOn(search, 'select')
    const src = searchSource(search)
    const items = src.items.get()
    expect(ids(items)).toEqual(['0:0', '0:1', '2:0'])
    expect(items[2]).toMatchObject({ page: 2, rect: hit(2, 3, 'word').rect })
    expect(src.card(items[1]!)).toEqual({
      title: 'Page 1',
      meta: 'Match 2',
      excerpt: { before: 'before 20 ', match: 'word', after: ' after 20' },
      actions: {},
    })
    src.select('0:1')
    expect(select).toHaveBeenCalledWith(1)
    expect(src.selected.get()).toBe('0:1')
    expect(src.replaying()).toBe(false)
    search.destroy()
  })

  it('search source follows current', async () => {
    const search = await searchOver([hit(0, 5, 'word'), hit(1, 2, 'word')])
    const src = searchSource(search)
    const seen = vi.fn()
    src.selected.subscribe(seen)
    expect(src.selected.get()).toBe('0:0')
    search.next()
    expect(src.selected.get()).toBe('1:0')
    expect(seen).toHaveBeenLastCalledWith('1:0')
    search.close()
    expect(src.selected.get()).toBeNull()
    search.destroy()
  })

  it('announces the settled result count', async () => {
    const search = await searchOver([hit(0, 5, 'word'), hit(1, 2, 'word')])
    const src = searchSource(search)
    expect(src.announcement!.get()).toBe('2 results')
    search.setQuery('')
    expect(src.announcement!.get()).toBe('')
    search.destroy()
  })

  it('search source ids stay put as earlier pages land', () => {
    // As a scan from page 2 finds page 2's hits, then wraps round to page 0.
    const state = writable<SearchState>({
      open: true,
      query: 'word',
      matchCase: false,
      hits: [hit(2, 3, 'word'), hit(2, 9, 'word')],
      current: 1,
      scanning: true,
    })
    const select = vi.fn()
    const search = { state, select } as unknown as ViewerSearch
    const src = searchSource(search)
    const seen = vi.fn()
    src.items.subscribe(() => {})
    src.selected.subscribe(seen)
    expect(ids(src.items.get())).toEqual(['2:0', '2:1'])
    expect(src.selected.get()).toBe('2:1')
    // Page 0's hits go in before them, and the current index moves with them.
    state.set({
      ...state.get(),
      hits: [hit(0, 1, 'word'), hit(0, 5, 'word'), hit(2, 3, 'word'), hit(2, 9, 'word')],
      current: 3,
    })
    expect(ids(src.items.get())).toEqual(['0:0', '0:1', '2:0', '2:1'])
    expect(src.selected.get()).toBe('2:1')
    expect(seen).not.toHaveBeenCalled()
    // An id maps back to the hit's index in the whole list.
    src.select('2:0')
    expect(select).toHaveBeenCalledWith(2)
    src.select('9:9')
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('keeps the items and cards of listed hits as earlier pages land', () => {
    const later = [hit(2, 3, 'word'), hit(2, 9, 'word')]
    const state = writable<SearchState>({
      open: true,
      query: 'word',
      matchCase: false,
      hits: later,
      current: 0,
      scanning: true,
    })
    const src = searchSource({ state, select: vi.fn() } as unknown as ViewerSearch)
    src.items.subscribe(() => {})
    const before = src.items.get()
    const cards = before.map((item) => src.card(item))
    expect(cards[1]).toMatchObject({ title: 'Page 3', meta: 'Match 2' })
    // The same hit objects, after page 0's: a new array, as the scan's flush makes.
    state.set({ ...state.get(), hits: [hit(0, 1, 'word'), ...later], current: 1 })
    const after = src.items.get()
    expect(after).toHaveLength(3)
    expect(after[1]).toBe(before[0])
    expect(after[2]).toBe(before[1])
    expect(src.card(after[2]!)).toEqual(cards[1])
    expect(src.card(after[0]!)).toMatchObject({ title: 'Page 1', meta: 'Match 1' })
  })
})
