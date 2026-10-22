import { describe, expect, it } from 'vitest'

import { staticDefaults } from '../../../model/annotations/defaults'
import { createHistory } from '../../../model/annotations/history'
import { createAnnotationStore } from '../../../model/annotations/store'
import { writable } from '../../../model/readable'
import { definePlugin, type InkPlugin } from '../define'
import { createPluginHost } from '../host'

import type { PluginApi, PluginOptions } from './api'
import type { Records } from './records'
import type { DocumentStatus, InkDocument } from '../../../model/document'
import type { RecordBase } from '../../../model/records'

interface Note extends RecordBase {
  status: string
}

const a: Note = { id: 'a', status: 'open' }
const b: Note = { id: 'b', status: 'done' }
const c: Note = { id: 'c', status: 'open' }

function fakeDocument(key: string): InkDocument {
  return {
    key,
    status: writable<DocumentStatus>({ state: 'ready' }),
  } as unknown as InkDocument
}

/** A host over a real history, so tests can count undo steps. */
function hostWith(plugins: InkPlugin[]) {
  const document = writable<InkDocument | null>(null)
  const history = createHistory(
    createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
  )
  const host = createPluginHost({
    plugins,
    document,
    history: () => history,
    activated: writable<string | null>(null),
    setActivated() {},
    root: writable<HTMLElement | null>(null),
  })
  return { host, document, history }
}

/** One plugin that keeps notes; returns its API and records handle once set up. */
function notesPlugin(
  options?: PluginOptions,
  make: (plugin: PluginApi) => Records<Note> = (plugin) => plugin.records<Note>('notes')
) {
  let plugin!: PluginApi
  let notes!: Records<Note>
  const factory = definePlugin('notes', (p) => {
    plugin = p
    notes = make(p)
  })
  const env = hostWith([factory(options)])
  return { ...env, plugin, notes }
}

describe('plugin.records', () => {
  it('reads are empty and writes do nothing with no document open', () => {
    const { notes } = notesPlugin()
    expect(notes.all()).toEqual([])
    expect(notes.list.get()).toEqual([])
    expect(notes.find('a')).toBeUndefined()
    expect(notes.has('a')).toBe(false)
    expect(notes.where({ status: 'open' })).toEqual([])
    expect(notes.add(a)).toBeUndefined()
    expect(notes.addMissing([a])).toEqual([])
    expect(notes.update('a', { status: 'done' })).toBeUndefined()
    expect(notes.remove('a')).toBeUndefined()
    expect(notes.store()).toBeNull()
  })

  it('follows the open document', () => {
    const { notes, document } = notesPlugin()
    const docA = fakeDocument('a')
    document.set(docA)
    notes.add(a)
    expect(notes.all()).toEqual([a])
    expect(notes.find('a')).toEqual(a)
    expect(notes.has('a')).toBe(true)

    const seen: (readonly Note[])[] = []
    notes.list.subscribe((list) => seen.push(list))
    document.set(fakeDocument('b'))
    expect(notes.all()).toEqual([])
    expect(seen).toEqual([[]])
    notes.add(b)
    expect(seen).toEqual([[], [b]])
    expect(notes.store()?.key).toBe('notes.notes')
  })

  it('addMissing adds only new ids, in one undo step', () => {
    const { notes, document, history } = notesPlugin()
    document.set(fakeDocument('a'))
    notes.add(a)
    expect(notes.addMissing([a, b, c])).toEqual([b, c])
    expect(notes.all()).toEqual([a, b, c])
    history.undo()
    expect(notes.all()).toEqual([a])
  })

  it('every write is one undo step', () => {
    const { notes, document, history } = notesPlugin()
    document.set(fakeDocument('a'))
    notes.add(a)
    notes.update('a', { status: 'done' })
    notes.remove('a')
    history.undo()
    expect(notes.all()).toEqual([{ ...a, status: 'done' }])
    history.undo()
    expect(notes.all()).toEqual([a])
    history.undo()
    expect(notes.all()).toEqual([])
  })

  it('where takes a partial or a predicate', () => {
    const { notes, document } = notesPlugin()
    document.set(fakeDocument('a'))
    notes.addMissing([a, b, c])
    expect(notes.where({ status: 'open' })).toEqual([a, c])
    expect(notes.where({ id: 'b', status: 'open' })).toEqual([])
    expect(notes.where((n) => n.id !== 'a')).toEqual([b, c])
  })

  it('in(doc) stays on its document and goes inert when it closes', () => {
    const { notes, document } = notesPlugin()
    const docA = fakeDocument('a')
    document.set(docA)
    const h = notes.in(docA)
    expect(h.add(a)).toEqual(a)
    expect(notes.all()).toEqual([a])

    document.set(fakeDocument('b'))
    const before = notes.store()
    expect(h.add(b)).toBeUndefined()
    expect(h.addMissing([c])).toEqual([])
    expect(h.all()).toEqual([])
    expect(h.list.get()).toEqual([])
    expect(h.store()).toBeNull()
    expect(notes.all()).toEqual([])
    expect(notes.store()).toBe(before)
  })

  it('in(doc) for a document that is not open is inert from the start', () => {
    const { notes, document } = notesPlugin()
    document.set(fakeDocument('a'))
    const h = notes.in(fakeDocument('b'))
    expect(h.add(a)).toBeUndefined()
    expect(notes.all()).toEqual([])
  })

  it('in(doc) called while the document is changing does not reach the old store', () => {
    let notes!: Records<Note>
    const document = writable<InkDocument | null>(null)
    const docA = fakeDocument('a')
    const docB = fakeDocument('b')
    const factory = definePlugin('notes', (plugin) => {
      notes = plugin.records<Note>('notes')
      // Subscribed before the host, so it runs before the stores swap.
      plugin.document.subscribe((doc) => {
        if (doc === docB) notes.in(docB).add(a)
      })
    })
    const history = createHistory(
      createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
    )
    createPluginHost({
      plugins: [factory()],
      document,
      history: () => history,
      activated: writable<string | null>(null),
      setActivated() {},
      root: writable<HTMLElement | null>(null),
    })
    document.set(docA)
    document.set(docB)
    expect(notes.all()).toEqual([])
    document.set(docA)
    expect(notes.all()).toEqual([])
  })

  it('plugin.batch makes several calls one step', () => {
    const { plugin, notes, document, history } = notesPlugin()
    document.set(fakeDocument('a'))
    notes.add(a)
    plugin.batch(() => {
      notes.add(b)
      notes.update('a', { status: 'done' })
      notes.remove('b')
      notes.add(c)
    })
    expect(notes.all()).toEqual([{ ...a, status: 'done' }, c])
    history.undo()
    expect(notes.all()).toEqual([a])
  })

  it('the factory passes host records options to plugin.records', () => {
    const fromOptions = notesPlugin({ records: { notes: { initial: () => [a] } } })
    fromOptions.document.set(fakeDocument('a'))
    expect(fromOptions.notes.all()).toEqual([a])

    const explicit = notesPlugin(
      { records: { notes: { initial: () => [a] } } },
      (plugin) => plugin.records<Note>('notes', { initial: () => [] })
    )
    explicit.document.set(fakeDocument('a'))
    expect(explicit.notes.all()).toEqual([])
  })

  it('passes onChange from the host options', () => {
    const changes: (readonly Note[])[] = []
    const { notes, document } = notesPlugin({
      records: { notes: { onChange: (list: readonly Note[]) => changes.push(list) } },
    })
    document.set(fakeDocument('a'))
    notes.add(a)
    expect(changes).toEqual([[a]])
  })
})
