import { describe, expect, it } from 'vitest'

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
    const a = s.add({ type: 'note', page: 0, rect, contents: 'one' })
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
    s.add({ type: 'note', page: 0, rect })
    h.undo()
    s.add({ type: 'note', page: 1, rect })
    expect(h.canRedo.get()).toBe(false)
  })

  it('replace changes clear history and the limit is enforced', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const h = createHistory(s, { limit: 3 })
    for (let i = 0; i < 5; i++) s.add({ type: 'note', page: i, rect })
    let steps = 0
    while (h.canUndo.get()) {
      h.undo()
      steps++
    }
    expect(steps).toBe(3)
    s.add({ type: 'note', page: 9, rect })
    s.replaceAll([], 'import')
    expect(h.canUndo.get()).toBe(false)
  })

  it('removing a thread root undoes the whole thread', () => {
    const s = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const h = createHistory(s)
    const root = s.add({ type: 'note', page: 0, rect })
    const reply = s.add({ type: 'note', page: 0, rect, inReplyTo: root.id })
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
    s.add({ type: 'note', page: 0, rect })
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
    s.add({ type: 'note', page: 0, rect })
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
    s.add({ type: 'note', page: 0, rect })
    s.setControlledValue(value)
    expect(h.canUndo.get()).toBe(false)
    h.undo()
    h.redo()
    expect(s.list.get()).toHaveLength(1)
    expect(h.canUndo.get()).toBe(false)
    expect(h.canRedo.get()).toBe(false)
  })
})
