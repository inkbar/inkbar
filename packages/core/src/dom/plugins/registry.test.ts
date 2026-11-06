import { describe, expect, it, vi } from 'vitest'

import { staticDefaults } from '../../model/annotations/defaults'
import { createHistory } from '../../model/annotations/history'
import { createAnnotationStore } from '../../model/annotations/store'
import { writable } from '../../model/readable'

import { definePlugin } from './define'
import { createPluginHost } from './host'
import { createMarksRegistry, type MarksRegistration } from './registry'

import type { Records } from './api/records'
import type { DocumentStatus, InkDocument } from '../../model/document'
import type { RecordBase } from '../../model/records'

interface Suggestion extends RecordBase {
  page: number
  status: string
}

const suggestion = (id: string, status = 'open'): Suggestion => ({ id, page: 0, status })

function registration(
  where: (s: Suggestion) => boolean,
  label = 'Suggestion'
): MarksRegistration<Suggestion> {
  return {
    plugin: 'sandbox',
    where,
    label: () => label,
    rect: () => ({ x: 0, y: 0, width: 10, height: 10 }),
    batch: (fn) => fn(),
  }
}

describe('createMarksRegistry', () => {
  it('resolve takes the first registration whose where passes', () => {
    const marks = createMarksRegistry()
    const open = registration((s) => s.status === 'open', 'Open')
    const accepted = registration((s) => s.status === 'accepted', 'Accepted')
    marks.add('sandbox.suggestions', open)
    marks.add('sandbox.suggestions', accepted)
    expect(marks.of('sandbox.suggestions')).toEqual([open, accepted])
    expect(marks.resolve('sandbox.suggestions', suggestion('a', 'accepted'))).toBe(
      accepted
    )
    expect(marks.resolve('sandbox.suggestions', suggestion('a', 'open'))).toBe(open)
    expect(
      marks.resolve('sandbox.suggestions', suggestion('a', 'dismissed'))
    ).toBeUndefined()
    expect(marks.resolve('other.key', suggestion('a'))).toBeUndefined()
  })

  it('add returns an unregister', () => {
    const marks = createMarksRegistry()
    const first = registration(() => true)
    const second = registration(() => true)
    const stop = marks.add('sandbox.suggestions', first)
    marks.add('sandbox.suggestions', second)
    expect(marks.keys()).toEqual(['sandbox.suggestions'])
    stop()
    expect(marks.of('sandbox.suggestions')).toEqual([second])
    // A second call changes nothing.
    stop()
    expect(marks.of('sandbox.suggestions')).toEqual([second])
    marks.add('sandbox.other', first)()
    expect(marks.keys()).toEqual(['sandbox.suggestions'])
    expect(marks.of('sandbox.other')).toEqual([])
  })

  it('watch fires on add and remove', () => {
    const marks = createMarksRegistry()
    const listener = vi.fn()
    const unwatch = marks.watch(listener)
    const stop = marks.add(
      'sandbox.suggestions',
      registration(() => true)
    )
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
    expect(listener).toHaveBeenCalledTimes(2)
    unwatch()
    marks.add(
      'sandbox.suggestions',
      registration(() => true)
    )
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('record selection', () => {
  function fakeDocument(key: string): InkDocument {
    return {
      key,
      status: writable<DocumentStatus>({ state: 'ready' }),
    } as unknown as InkDocument
  }

  /** A host over a real history whose plugin `sandbox` keeps `suggestions`. */
  function setup() {
    const out: { suggestions?: Records<Suggestion> } = {}
    const plugin = definePlugin('sandbox', (api) => {
      out.suggestions = api.records<Suggestion>('suggestions')
    })
    const document = writable<InkDocument | null>(fakeDocument('a'))
    const history = createHistory(
      createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
    )
    const host = createPluginHost({
      plugins: [plugin()],
      document,
      history: () => history,
      activated: writable<string | null>(null),
      setActivated() {},
      root: writable<HTMLElement | null>(null),
    })
    const suggestions = out.suggestions!
    suggestions.add(suggestion('a'))
    suggestions.add(suggestion('b'))
    const selection = host.selection('sandbox.suggestions')
    return { host, document, history, suggestions, selection }
  }

  it('is the same object per key, and selects a present record', () => {
    const { host, selection } = setup()
    expect(host.selection('sandbox.suggestions')).toBe(selection)
    expect(selection.selected.get()).toBeNull()
    const seen = vi.fn()
    selection.selected.subscribe(seen)
    selection.select('a')
    expect(selection.selected.get()).toBe('a')
    expect(seen).toHaveBeenCalledWith('a')
    selection.select('missing')
    expect(selection.selected.get()).toBe('a')
    selection.select(null)
    expect(selection.selected.get()).toBeNull()
  })

  it('selection clears when the record is removed', () => {
    const { suggestions, selection } = setup()
    selection.select('a')
    suggestions.remove('b')
    expect(selection.selected.get()).toBe('a')
    suggestions.remove('a')
    expect(selection.selected.get()).toBeNull()
  })

  it('selection clears when it stops resolving', () => {
    const { host, suggestions, selection } = setup()
    host.marks.add(
      'sandbox.suggestions',
      registration((s) => s.status === 'open')
    )
    host.marks.add(
      'sandbox.suggestions',
      registration((s) => s.status === 'accepted')
    )
    selection.select('a')
    suggestions.update('a', { status: 'accepted' })
    expect(selection.selected.get()).toBe('a')
    suggestions.update('a', { status: 'dismissed' })
    expect(selection.selected.get()).toBeNull()
    // A record that resolves to nothing cannot be selected.
    selection.select('a')
    expect(selection.selected.get()).toBeNull()
  })

  it('selection keeps a record that still resolves when registrations change', () => {
    const { host, selection } = setup()
    selection.select('a')
    host.marks.add(
      'sandbox.suggestions',
      registration((s) => s.status === 'open')
    )
    expect(selection.selected.get()).toBe('a')
    host.marks.add(
      'sandbox.other',
      registration(() => false)
    )
    expect(selection.selected.get()).toBe('a')
    selection.select('b')
    host.marks.add(
      'sandbox.suggestions',
      registration(() => false)
    )
    expect(selection.selected.get()).toBe('b')
  })

  it('selection rechecks when the registrations for its key change', () => {
    const { host, selection } = setup()
    // No registrations: any present record resolves.
    selection.select('a')
    host.marks.add(
      'sandbox.suggestions',
      registration((s) => s.status === 'accepted')
    )
    expect(selection.selected.get()).toBeNull()
  })

  it('selection with no registrations keeps any present record', () => {
    const { suggestions, selection } = setup()
    selection.select('a')
    suggestions.update('a', { status: 'dismissed' })
    expect(selection.selected.get()).toBe('a')
  })

  it('selection clears when the document closes', () => {
    const { document, selection, suggestions } = setup()
    selection.select('a')
    document.set(null)
    expect(selection.selected.get()).toBeNull()
    selection.select('a')
    expect(selection.selected.get()).toBeNull()

    // It follows the next document's store.
    document.set(fakeDocument('b'))
    suggestions.add(suggestion('c'))
    selection.select('c')
    expect(selection.selected.get()).toBe('c')
    document.set(fakeDocument('c'))
    expect(selection.selected.get()).toBeNull()
  })

  it('selection clears on undo of the add', () => {
    const { history, suggestions, selection } = setup()
    suggestions.add(suggestion('c'))
    selection.select('c')
    history.undo()
    expect(suggestions.has('c')).toBe(false)
    expect(selection.selected.get()).toBeNull()
  })

  it('selection for a key with no store stays empty', () => {
    const { host } = setup()
    const none = host.selection('nope.x')
    none.select('a')
    expect(none.selected.get()).toBeNull()
  })

  it('selection stops following its store when the host is destroyed', () => {
    const { host, suggestions, selection } = setup()
    selection.select('a')
    host.destroy()
    // The store is gone with the document, but the cleared value stays reachable.
    expect(selection.selected.get()).toBeNull()
    expect(suggestions.has('a')).toBe(false)
  })
})
