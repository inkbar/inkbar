import { describe, expect, it, vi, type Mock } from 'vitest'

import { staticDefaults } from '../../model/annotations/defaults'
import { createHistory } from '../../model/annotations/history'
import { createAnnotationStore } from '../../model/annotations/store'
import { writable } from '../../model/readable'
import { definePlugin } from '../plugins/define'
import { createPluginHost } from '../plugins/host'

import { createRecordListController, type RecordListController } from './list'
import { recordsSource, searchSource } from './source'

import type { DocumentStatus, InkDocument } from '../../model/document'
import type { Rect } from '../../model/geometry'
import type { RecordBase } from '../../model/records'
import type { SearchHit } from '../../model/search'
import type { SearchState, ViewerSearch } from '../search/controller'
import type { Viewport } from '../viewport'

interface Suggestion extends RecordBase {
  page: number
  rect: Rect
  status: string
}

const suggestion = (id: string, y: number, status = 'open'): Suggestion => ({
  id,
  page: 0,
  rect: { x: 100, y, width: 50, height: 10 },
  status,
})

function fakeDocument(key: string): InkDocument {
  return {
    key,
    status: writable<DocumentStatus>({ state: 'ready' }),
  } as unknown as InkDocument
}

/**
 * A list controller over `sandbox.suggestions`, whose open records have a mark with an Accept
 * action that marks the record accepted and adds a redaction, as the sandbox's suggestions do.
 */
function setup(byDocument: Record<string, Suggestion[]>) {
  const plugin = definePlugin('sandbox', (api) => {
    api.records<Suggestion>('suggestions', {
      initial: (doc) => byDocument[doc.key] ?? [],
    })
  })
  const annotations = createAnnotationStore({
    mode: { mode: 'uncontrolled' },
    defaults: staticDefaults,
  })
  const history = createHistory(annotations)
  const document = writable<InkDocument | null>(fakeDocument('a'))
  const pluginHost = createPluginHost({
    plugins: [plugin()],
    document,
    history: () => history,
    activated: writable<string | null>(null),
    setActivated() {},
    root: writable<HTMLElement | null>(null),
  })
  const records = pluginHost.records<Suggestion>('sandbox.suggestions')
  const batch = vi.fn((fn: () => void) => history.batch(fn))
  pluginHost.marks.add('sandbox.suggestions', {
    plugin: 'sandbox',
    where: (s: Suggestion) => s.status === 'open',
    label: (s: Suggestion) => `Suggestion ${s.id}`,
    rect: (s: Suggestion) => s.rect,
    card: (s: Suggestion) => ({
      title: `Suggestion ${s.id}`,
      actions: {
        Accept() {
          records.update(s.id, { status: 'accepted' })
          annotations.add({ type: 'redact', page: s.page, rect: s.rect })
        },
      },
    }),
    batch,
  })
  const scrollToRect = vi.fn()
  const viewport = writable<Viewport | null>({
    scrollToRect,
    scrollToPage: vi.fn(),
  } as unknown as Viewport)
  const source = recordsSource<Suggestion>(
    { pluginHost, viewport },
    'sandbox.suggestions'
  )
  const controller = createRecordListController(source)
  const selection = pluginHost.selection('sandbox.suggestions')
  return {
    controller,
    records,
    annotations,
    history,
    document,
    batch,
    scrollToRect,
    selection,
  }
}

const rowIds = (c: RecordListController) => c.rows.get().map((r) => r.item.id)

interface FakeEl {
  id: string | null
  tabIndex: number
  focus: Mock<() => void>
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  hasAttribute(name: string): boolean
  contains(node: unknown): boolean
}

/**
 * A list element as a binding renders it, without a layout engine: one row per controller row,
 * re-rendered on each change and kept by id, and a document that tracks focus.
 */
function fakeList(controller: RecordListController) {
  const doc = { activeElement: null as FakeEl | null, defaultView: null }
  const make = (id: string | null): FakeEl => {
    const attrs = new Map<string, string>()
    const el: FakeEl = {
      id,
      tabIndex: -1,
      focus: vi.fn<() => void>(() => {
        doc.activeElement = el
      }),
      getAttribute: (name) =>
        name === 'data-ink-record' ? id : (attrs.get(name) ?? null),
      setAttribute: (name, value) => attrs.set(name, value),
      hasAttribute: (name) => attrs.has(name),
      contains: (node) => node === el,
    }
    return el
  }
  const rows = new Map<string, FakeEl>()
  let shown: FakeEl[] = []
  const render = () => {
    shown = controller.rows.get().map((r) => {
      const el = rows.get(r.item.id) ?? make(r.item.id)
      rows.set(r.item.id, el)
      return el
    })
    // A row that leaves takes focus with it, as a removed element does.
    if (
      doc.activeElement &&
      doc.activeElement !== root &&
      !shown.includes(doc.activeElement)
    )
      doc.activeElement = null
  }
  const root = {
    ...make(null),
    ownerDocument: doc,
    contains: (node: unknown) => node === root || shown.includes(node as FakeEl),
    querySelectorAll: () => shown,
    addEventListener() {},
    removeEventListener() {},
  }
  root.focus = vi.fn<() => void>(() => {
    doc.activeElement = root
  })
  render()
  controller.rows.subscribe(render)
  const row = (id: string) => rows.get(id)!
  return { el: root as unknown as HTMLElement, root, doc, row }
}

describe('createRecordListController', () => {
  it('choose selects and reveals', () => {
    const { controller, scrollToRect, selection } = setup({
      a: [suggestion('a', 500), suggestion('b', 400)],
    })
    expect(rowIds(controller)).toEqual(['a', 'b'])
    expect(controller.count.get()).toBe(2)
    controller.choose('b')
    expect(selection.selected.get()).toBe('b')
    expect(controller.rows.get().map((r) => r.selected)).toEqual([false, true])
    expect(scrollToRect).toHaveBeenCalledWith(
      0,
      suggestion('b', 400).rect,
      expect.anything()
    )
    expect(controller.rows.get()[1]!.card).toMatchObject({ title: 'Suggestion b' })
    // An id the list lacks does nothing.
    controller.choose('nope')
    expect(selection.selected.get()).toBe('b')
  })

  it('act runs in the registration batch', () => {
    const { controller, records, annotations, history, batch } = setup({
      a: [suggestion('a', 500), suggestion('b', 400)],
    })
    controller.act('a', 'Accept')
    expect(batch).toHaveBeenCalledTimes(1)
    expect(records.find('a')!.status).toBe('accepted')
    expect(annotations.list.get()).toHaveLength(1)
    expect(rowIds(controller)).toEqual(['b'])
    // One undo restores both.
    history.undo()
    expect(records.find('a')!.status).toBe('open')
    expect(annotations.list.get()).toHaveLength(0)
    expect(rowIds(controller)).toEqual(['a', 'b'])
    // An unknown action or row does nothing.
    controller.act('a', 'Nope')
    controller.act('nope', 'Accept')
    expect(batch).toHaveBeenCalledTimes(1)
  })

  it('focus moves to the next row after an act removes it', () => {
    const { controller } = setup({
      a: [suggestion('a', 500), suggestion('b', 400), suggestion('c', 300)],
    })
    const { el, doc, row } = fakeList(controller)
    controller.attach(el)
    row('b').focus()
    controller.act('b', 'Accept')
    expect(doc.activeElement).toBe(row('c'))
  })

  it('focus moves to the previous row when it was last', () => {
    const { controller } = setup({
      a: [suggestion('a', 500), suggestion('b', 400), suggestion('c', 300)],
    })
    const { el, doc, row } = fakeList(controller)
    controller.attach(el)
    row('c').focus()
    controller.act('c', 'Accept')
    expect(doc.activeElement).toBe(row('b'))
  })

  it('focus moves to the list root when none left', () => {
    const { controller } = setup({ a: [suggestion('a', 500)] })
    const { el, root, doc, row } = fakeList(controller)
    controller.attach(el)
    row('a').focus()
    controller.act('a', 'Accept')
    expect(doc.activeElement).toBe(root)
    expect(root.getAttribute('tabindex')).toBe('-1')
  })

  it('an act leaves focus alone when it was outside the list', () => {
    const { controller } = setup({ a: [suggestion('a', 500), suggestion('b', 400)] })
    const { el, doc, row } = fakeList(controller)
    controller.attach(el)
    controller.act('a', 'Accept')
    expect(doc.activeElement).toBeNull()
    expect(row('b').focus).not.toHaveBeenCalled()
  })

  it('undo of the selected record clears the selection', () => {
    const { controller, records, history } = setup({ a: [suggestion('a', 500)] })
    records.add(suggestion('d', 100))
    controller.choose('d')
    expect(controller.rows.get().find((r) => r.item.id === 'd')!.selected).toBe(true)
    history.undo()
    expect(rowIds(controller)).toEqual(['a'])
    expect(controller.rows.get().some((r) => r.selected)).toBe(false)
  })

  it('announces adds and removes but not undo', () => {
    const { controller, records, history } = setup({
      a: [suggestion('a', 500), suggestion('b', 400)],
    })
    expect(controller.announcement.get()).toBe('')
    const said = vi.fn()
    controller.announcement.subscribe(said)
    records.add(suggestion('c', 300))
    expect(controller.announcement.get()).toBe('3 items')
    records.remove('a')
    expect(controller.announcement.get()).toBe('2 items')
    // An update that takes a record out of the list counts as a removal.
    records.update('b', { status: 'accepted' })
    expect(controller.announcement.get()).toBe('1 item')
    expect(said).toHaveBeenCalledTimes(3)
    history.undo()
    history.undo()
    expect(controller.count.get()).toBe(3)
    history.redo()
    expect(controller.count.get()).toBe(2)
    expect(said).toHaveBeenCalledTimes(3)
    expect(controller.announcement.get()).toBe('1 item')
    // A change that leaves the count alone says nothing.
    records.update('c', { rect: { x: 1, y: 1, width: 1, height: 1 } })
    expect(said).toHaveBeenCalledTimes(3)
  })

  it('resets on document change', () => {
    const { controller, document, selection } = setup({
      a: [suggestion('a', 500), suggestion('b', 400)],
      b: [suggestion('x', 500), suggestion('y', 400), suggestion('z', 300)],
    })
    const { el } = fakeList(controller)
    controller.attach(el)
    controller.choose('a')
    const said = vi.fn()
    controller.announcement.subscribe(said)
    document.set(fakeDocument('b'))
    expect(rowIds(controller)).toEqual(['x', 'y', 'z'])
    expect(controller.count.get()).toBe(3)
    expect(selection.selected.get()).toBeNull()
    expect(controller.rows.get().some((r) => r.selected)).toBe(false)
    expect(said).not.toHaveBeenCalled()
    document.set(null)
    expect(rowIds(controller)).toEqual([])
    expect(controller.count.get()).toBe(0)
    expect(said).not.toHaveBeenCalled()
  })

  it('stops following its source after destroy', () => {
    const { controller, records } = setup({ a: [suggestion('a', 500)] })
    controller.destroy()
    records.add(suggestion('b', 400))
    expect(rowIds(controller)).toEqual(['a'])
    expect(controller.count.get()).toBe(1)
  })

  it('focus moves on when undo or redo removes the focused row', () => {
    const { controller, history } = setup({
      a: [suggestion('a', 500), suggestion('b', 400), suggestion('c', 300)],
    })
    const { el, doc, row } = fakeList(controller)
    controller.attach(el)
    controller.act('b', 'Accept')
    history.undo()
    expect(rowIds(controller)).toEqual(['a', 'b', 'c'])
    row('b').focus()
    history.redo()
    expect(doc.activeElement).toBe(row('c'))
    // Focus elsewhere in the list stays put.
    history.undo()
    history.redo()
    expect(doc.activeElement).toBe(row('c'))
  })

  it('a focused search result keeps focus as an earlier page lands', () => {
    const hit = (page: number, start: number) =>
      ({ page, start, end: start + 4, text: 'word', before: '', after: '' }) as SearchHit
    const state = writable<SearchState>({
      open: true,
      query: 'word',
      matchCase: false,
      hits: [hit(2, 3), hit(2, 9)],
      current: 0,
      scanning: true,
    })
    const controller = createRecordListController(
      searchSource({ state, select: vi.fn() } as unknown as ViewerSearch)
    )
    const { el, doc, row } = fakeList(controller)
    controller.attach(el)
    row('2:1').focus()
    state.set({ ...state.get(), hits: [hit(0, 1), hit(2, 3), hit(2, 9)], current: 1 })
    expect(rowIds(controller)).toEqual(['0:0', '2:0', '2:1'])
    expect(doc.activeElement).toBe(row('2:1'))
  })
})
