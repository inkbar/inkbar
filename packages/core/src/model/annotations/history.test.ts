import { describe, expect, it, vi } from 'vitest'

import { createRecordStore } from '../records'

import { staticDefaults } from './defaults'
import { createHistory } from './history'
import { createAnnotationStore } from './store'

import type { Annotation } from './types'

const rect = { x: 0, y: 0, width: 20, height: 20 }

describe('history', () => {
  it('undoes and redoes add, update and remove', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const h = createHistory(s)
    expect(h.canUndo.get()).toBe(false)
    const a = s.add({ type: 'text', page: 0, rect, contents: 'one' })
    s.update(a.id, { contents: 'two' })
    s.remove(a.id)
    expect(s.list.get()).toEqual([])
    h.undo()
    expect(s.get(a.id)?.contents).toBe('two')
    h.undo()
    expect(s.get(a.id)?.contents).toBe('one')
    h.undo()
    expect(s.list.get()).toEqual([])
    expect(h.canUndo.get()).toBe(false)
    expect(h.canRedo.get()).toBe(true)
    h.redo()
    h.redo()
    expect(s.get(a.id)?.contents).toBe('two')
  })

  it('a new change after undo discards the redo stack', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const h = createHistory(s)
    s.add({ type: 'text', page: 0, rect })
    h.undo()
    s.add({ type: 'text', page: 1, rect })
    expect(h.canRedo.get()).toBe(false)
  })

  it('replace changes clear history and the limit is enforced', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const h = createHistory(s, { limit: 3 })
    for (let i = 0; i < 5; i++) s.add({ type: 'text', page: i, rect })
    let steps = 0
    while (h.canUndo.get()) {
      h.undo()
      steps++
    }
    expect(steps).toBe(3)
    s.add({ type: 'text', page: 9, rect })
    s.replaceAll([], 'import')
    expect(h.canUndo.get()).toBe(false)
  })

  it('removing a thread root undoes the whole thread', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const h = createHistory(s)
    const root = s.add({ type: 'text', page: 0, rect })
    const reply = s.add({ type: 'text', page: 0, rect, inReplyTo: root.id })
    s.remove(root.id)
    h.undo()
    expect(s.get(root.id)).toBeDefined()
    expect(s.get(reply.id)).toBeDefined()
  })

  it('does not record its own history replaces or foreign history replaces', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const h = createHistory(s)
    s.add({ type: 'text', page: 0, rect })
    h.undo()
    expect(h.canUndo.get()).toBe(false)
    expect(h.canRedo.get()).toBe(true)
    s.replaceAll([], 'history')
    expect(h.canUndo.get()).toBe(false)
    expect(h.canRedo.get()).toBe(true)
  })

  it('clear empties both stacks', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const h = createHistory(s)
    s.add({ type: 'text', page: 0, rect })
    h.undo()
    h.clear()
    expect(h.canUndo.get()).toBe(false)
    expect(h.canRedo.get()).toBe(false)
  })

  it('records nothing in controlled mode', () => {
    let value: Annotation[] = []
    const s = createAnnotationStore({
      mode: {
        mode: 'controlled',
        initial: [],
        onChange: (next) => {
          value = next
        },
      },
      defaults: staticDefaults,
    })
    const h = createHistory(s)
    s.add({ type: 'text', page: 0, rect })
    s.setControlledValue(value)
    expect(h.canUndo.get()).toBe(false)
    h.undo()
    h.redo()
    expect(s.list.get()).toHaveLength(1)
    expect(h.canUndo.get()).toBe(false)
    expect(h.canRedo.get()).toBe(false)
  })

  it('destroy unsubscribes, empties the stacks and disables undo and redo', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const h = createHistory(s)
    s.add({ type: 'text', page: 0, rect })
    s.add({ type: 'text', page: 1, rect })
    h.undo()
    h.destroy()
    expect(h.canUndo.get()).toBe(false)
    expect(h.canRedo.get()).toBe(false)
    s.add({ type: 'text', page: 2, rect })
    expect(h.canUndo.get()).toBe(false)
    h.undo()
    h.redo()
    expect(s.list.get()).toHaveLength(2)
  })
})

describe('history.batch', () => {
  const store = () =>
    createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })

  it('records everything fn changes as one step', () => {
    const s = store()
    const h = createHistory(s)
    h.batch(() => {
      for (let i = 0; i < 9; i++)
        s.add({ type: 'text', page: 0, rect, contents: `n${i}` })
    })
    expect(s.list.get()).toHaveLength(9)
    h.undo()
    expect(s.list.get()).toEqual([])
    expect(h.canUndo.get()).toBe(false)
    h.redo()
    expect(s.list.get()).toHaveLength(9)
  })

  it('still emits one change event per annotation', () => {
    const s = store()
    const h = createHistory(s)
    const kinds: string[] = []
    s.on('change', (c) => kinds.push(c.kind))
    h.batch(() => {
      s.add({ type: 'text', page: 0, rect })
      s.add({ type: 'text', page: 1, rect })
    })
    expect(kinds).toEqual(['add', 'add'])
  })

  it('nested batches join the outer one', () => {
    const s = store()
    const h = createHistory(s)
    h.batch(() => {
      s.add({ type: 'text', page: 0, rect })
      h.batch(() => {
        s.add({ type: 'text', page: 1, rect })
      })
      s.add({ type: 'text', page: 2, rect })
    })
    h.undo()
    expect(s.list.get()).toEqual([])
  })

  it('a batch that changes nothing records nothing and keeps redo', () => {
    const s = store()
    const h = createHistory(s)
    s.add({ type: 'text', page: 0, rect })
    h.undo()
    h.batch(() => undefined)
    expect(h.canUndo.get()).toBe(false)
    expect(h.canRedo.get()).toBe(true)
  })

  it('a throwing fn still closes the batch, records what changed and rethrows', () => {
    const s = store()
    const h = createHistory(s)
    expect(() => {
      h.batch(() => {
        s.add({ type: 'text', page: 0, rect })
        throw new Error('boom')
      })
    }).toThrow('boom')
    expect(h.canUndo.get()).toBe(true)
    h.undo()
    expect(s.list.get()).toEqual([])
    // The batch is closed: the next change is its own step.
    s.add({ type: 'text', page: 1, rect })
    s.add({ type: 'text', page: 2, rect })
    h.undo()
    expect(s.list.get()).toHaveLength(1)
  })

  it('an import inside a batch clears the stacks and the batch restarts from it', () => {
    const s = store()
    const h = createHistory(s)
    s.add({ type: 'text', page: 0, rect })
    h.batch(() => {
      s.replaceAll([], 'import')
      s.add({ type: 'text', page: 3, rect })
    })
    h.undo()
    expect(s.list.get()).toEqual([])
    expect(h.canUndo.get()).toBe(false)
  })

  it('on a destroyed or controlled history it only runs fn', () => {
    const s = store()
    const h = createHistory(s)
    h.destroy()
    let ran = false
    h.batch(() => {
      ran = true
    })
    expect(ran).toBe(true)
    const c = createAnnotationStore({
      mode: { mode: 'controlled', initial: [], onChange: () => undefined },
      defaults: staticDefaults,
    })
    let ranControlled = false
    createHistory(c).batch(() => {
      ranControlled = true
    })
    expect(ranControlled).toBe(true)
  })

  it('a history destroyed inside fn records nothing when the batch closes', () => {
    const s = store()
    const h = createHistory(s)
    const canUndo: boolean[] = []
    h.canUndo.subscribe((v) => canUndo.push(v))
    h.batch(() => {
      s.add({ type: 'text', page: 0, rect })
      h.destroy()
      s.add({ type: 'text', page: 1, rect })
    })
    expect(s.list.get()).toHaveLength(2)
    expect(h.canUndo.get()).toBe(false)
    expect(h.canRedo.get()).toBe(false)
    expect(canUndo.every((v) => !v)).toBe(true)
    h.undo()
    expect(s.list.get()).toHaveLength(2)
  })

  it('an add then a remove inside one batch records nothing and keeps redo', () => {
    const s = store()
    const h = createHistory(s)
    s.add({ type: 'text', page: 0, rect })
    h.undo()
    expect(h.canRedo.get()).toBe(true)
    h.batch(() => {
      const a = s.add({ type: 'text', page: 1, rect })
      s.remove(a.id)
    })
    expect(s.list.get()).toEqual([])
    expect(h.canUndo.get()).toBe(false)
    expect(h.canRedo.get()).toBe(true)
    h.redo()
    expect(s.list.get()).toHaveLength(1)
  })

  it('warns in a dev build when fn returns a promise, and not otherwise', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const s = store()
      const h = createHistory(s)
      h.batch(() => {
        s.add({ type: 'text', page: 0, rect })
      })
      expect(warn).not.toHaveBeenCalled()
      // A thenable stands in for the promise an async fn returns.
      const asyncLike = (() => {
        s.add({ type: 'text', page: 1, rect })
        return { then: () => undefined }
      }) as () => void
      h.batch(asyncLike)
      expect(warn).toHaveBeenCalledOnce()
      expect(warn.mock.calls[0]![0]).toMatch(/returned a promise/)
    } finally {
      warn.mockRestore()
    }
  })
  it('a late fill of embedded fields keeps history and patches every snapshot', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const embedded: Annotation = {
      id: 'pdf:0:1R',
      type: 'text',
      icon: 'Note',
      page: 0,
      rect,
      color: '#FFD400',
      opacity: 1,
      createdAt: '2026-10-12T12:00:00.000Z',
      modifiedAt: '2026-10-12T12:00:00.000Z',
      source: 'pdf',
      locked: true,
    }
    s._setEmbedded([embedded])
    const h = createHistory(s)
    const mine = s.add({ type: 'text', page: 0, rect })
    const patched: Annotation = { ...embedded, icon: 'Key' }
    s._patchEmbedded(new Map([[embedded.id, { icon: 'Key' }]]))
    expect(h.canUndo.get()).toBe(true)
    h.undo()
    expect(s.get(mine.id)).toBeUndefined()
    expect(s.get(embedded.id)).toEqual(patched)
    expect(h.canUndo.get()).toBe(false)
    h.redo()
    expect(s.get(mine.id)).toBeDefined()
    expect(s.get(embedded.id)).toEqual(patched)
  })

  it('a late fill reaches the redo stack too', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const embedded: Annotation = {
      id: 'pdf:0:1R',
      type: 'text',
      icon: 'Note',
      page: 0,
      rect,
      color: '#FFD400',
      opacity: 1,
      createdAt: '2026-10-12T12:00:00.000Z',
      modifiedAt: '2026-10-12T12:00:00.000Z',
      source: 'pdf',
      locked: true,
    }
    s._setEmbedded([embedded])
    const h = createHistory(s)
    s.add({ type: 'text', page: 0, rect })
    h.undo()
    const patched: Annotation = { ...embedded, icon: 'Key' }
    s._patchEmbedded(new Map([[embedded.id, { icon: 'Key' }]]))
    expect(h.canRedo.get()).toBe(true)
    h.redo()
    expect(s.get(embedded.id)).toEqual(patched)
    h.undo()
    expect(s.get(embedded.id)).toEqual(patched)
  })

  it('a late fill keeps an earlier edit undoable', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const embedded: Annotation = {
      id: 'pdf:0:1R',
      type: 'text',
      icon: 'Note',
      page: 0,
      rect,
      color: '#FFD400',
      opacity: 1,
      createdAt: '2026-10-12T12:00:00.000Z',
      modifiedAt: '2026-10-12T12:00:00.000Z',
      source: 'pdf',
      locked: true,
    }
    s._setEmbedded([embedded])
    const h = createHistory(s)
    s.update(embedded.id, { color: '#000000' })
    s._patchEmbedded(new Map([[embedded.id, { icon: 'Key' }]]))
    expect(s.get(embedded.id)).toMatchObject({ color: '#000000', icon: 'Key' })
    h.undo()
    expect(s.get(embedded.id)).toMatchObject({ color: '#FFD400', icon: 'Key' })
    h.redo()
    expect(s.get(embedded.id)).toMatchObject({ color: '#000000', icon: 'Key' })
  })
})

describe('history over record stores', () => {
  interface Note {
    id: string
    status: string
    annotationId?: string
  }
  const setup = () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const h = createHistory(s)
    const notes = createRecordStore<Note>('sandbox', {
      initial: [{ id: 'n1', status: 'open' }],
    })
    return { s, h, notes }
  }

  it('a record change is an undo step', () => {
    const { s, h, notes } = setup()
    h.track(notes)
    notes.update('n1', { status: 'done' })
    expect(h.canUndo.get()).toBe(true)
    h.undo()
    expect(notes.get('n1')?.status).toBe('open')
    h.redo()
    expect(notes.get('n1')?.status).toBe('done')
    expect(s.list.get()).toEqual([])
  })

  it('an annotation add and a record update in one batch are one step, and undo restores both', () => {
    const { s, h, notes } = setup()
    h.track(notes)
    let id = ''
    h.batch(() => {
      id = s.add({ type: 'text', page: 0, rect }).id
      notes.update('n1', { status: 'done', annotationId: id })
    })
    h.undo()
    expect(s.list.get()).toEqual([])
    expect(notes.get('n1')).toEqual({ id: 'n1', status: 'open' })
    expect(h.canUndo.get()).toBe(false)
    h.redo()
    expect(s.get(id)).toBeDefined()
    expect(notes.get('n1')?.annotationId).toBe(id)
  })

  it("a reaction's record writes join the edit's entry", () => {
    const { s, h, notes } = setup()
    h.track(notes)
    const a = s.add({ type: 'text', page: 0, rect })
    h.clear()
    h.react((edit) => {
      if (edit.kind === 'remove') notes.update('n1', { status: 'reopened' })
    })
    s.remove(a.id)
    expect(notes.get('n1')?.status).toBe('reopened')
    h.undo()
    expect(s.get(a.id)).toBeDefined()
    expect(notes.get('n1')?.status).toBe('open')
    expect(h.canUndo.get()).toBe(false)
  })

  it('undo and redo do not run reactions', () => {
    const { s, h, notes } = setup()
    h.track(notes)
    const fn = vi.fn()
    h.react(fn)
    s.add({ type: 'text', page: 0, rect })
    notes.update('n1', { status: 'done' })
    expect(fn).toHaveBeenCalledTimes(1)
    h.undo()
    h.undo()
    h.redo()
    h.redo()
    expect(fn).toHaveBeenCalledTimes(1)
    // Replays never become entries either.
    expect(h.canRedo.get()).toBe(false)
    h.undo()
    h.undo()
    expect(h.canUndo.get()).toBe(false)
  })

  it('a batch that changes records then restores them records nothing', () => {
    const { h, notes } = setup()
    h.track(notes)
    h.batch(() => {
      notes.add({ id: 'n2', status: 'open' })
      notes.remove('n2')
    })
    expect(h.canUndo.get()).toBe(false)
  })

  it('untracked stores are not replayed', () => {
    const { s, h, notes } = setup()
    const untrack = h.track(notes)
    const a = s.add({ type: 'text', page: 0, rect })
    h.batch(() => {
      s.update(a.id, { contents: 'two' })
      notes.update('n1', { status: 'done' })
    })
    untrack()
    notes.update('n1', { status: 'later' })
    // An untracked store's changes are not steps.
    h.undo()
    expect(s.get(a.id)?.contents).toBeUndefined()
    expect(notes.get('n1')?.status).toBe('later')
  })

  it('clear empties steps that hold records', () => {
    const { h, notes } = setup()
    h.track(notes)
    notes.update('n1', { status: 'done' })
    h.undo()
    notes.update('n1', { status: 'other' })
    h.clear()
    expect(h.canUndo.get()).toBe(false)
    expect(h.canRedo.get()).toBe(false)
    notes.update('n1', { status: 'third' })
    h.undo()
    expect(notes.get('n1')?.status).toBe('other')
  })
})
