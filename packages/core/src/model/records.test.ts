import { describe, expect, it, vi } from 'vitest'

import { isInkError } from './errors'
import { createRecordStore, type RecordChange } from './records'

interface Note {
  readonly id: string
  text: string
}

describe('createRecordStore', () => {
  it('add, update and remove emit changes and onChange with the full list', () => {
    const onChange = vi.fn()
    const s = createRecordStore<Note>('notes', { onChange })
    const changes: RecordChange<Note>[] = []
    s.on('change', (c) => changes.push(c))

    const a = s.add({ id: 'a', text: 'one' })
    const after = s.update('a', { text: 'two' })
    const gone = s.remove('a')

    expect(changes).toEqual([
      { kind: 'add', record: { id: 'a', text: 'one' } },
      {
        kind: 'update',
        id: 'a',
        before: { id: 'a', text: 'one' },
        after: { id: 'a', text: 'two' },
      },
      { kind: 'remove', record: { id: 'a', text: 'two' } },
    ])
    expect(a).toEqual({ id: 'a', text: 'one' })
    expect(after).toEqual({ id: 'a', text: 'two' })
    expect(gone).toEqual({ id: 'a', text: 'two' })
    expect(onChange).toHaveBeenCalledTimes(3)
    expect(onChange.mock.calls[0]).toEqual([[{ id: 'a', text: 'one' }], changes[0]])
    expect(onChange.mock.calls[1]?.[0]).toEqual([{ id: 'a', text: 'two' }])
    expect(onChange.mock.calls[2]?.[0]).toEqual([])
    expect(s.list.get()).toEqual([])
    expect(s.key).toBe('notes')
  })

  it('add with a duplicate id throws DuplicateId', () => {
    const s = createRecordStore<Note>('notes', { initial: [{ id: 'a', text: 'x' }] })
    try {
      s.add({ id: 'a', text: 'y' })
      expect.unreachable()
    } catch (e) {
      expect(isInkError(e) && e.code).toBe('DuplicateId')
    }
    expect(s.list.get()).toHaveLength(1)
  })

  it('update of an unknown id changes nothing', () => {
    const onChange = vi.fn()
    const s = createRecordStore<Note>('notes', { onChange })
    const fn = vi.fn()
    s.on('change', fn)
    expect(s.update('nope', { text: 'x' })).toBeUndefined()
    expect(s.remove('nope')).toBeUndefined()
    expect(fn).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('replaceAll emits replace with its reason', () => {
    const onChange = vi.fn()
    const s = createRecordStore<Note>('notes', { onChange })
    const changes: RecordChange<Note>[] = []
    s.on('change', (c) => changes.push(c))
    s.replaceAll([{ id: 'b', text: 'n' }], 'history')
    s.replaceAll([], 'reset')
    expect(changes).toEqual([
      { kind: 'replace', reason: 'history' },
      { kind: 'replace', reason: 'reset' },
    ])
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange.mock.calls[0]?.[0]).toEqual([{ id: 'b', text: 'n' }])
  })

  it('records are frozen', () => {
    const s = createRecordStore<Note>('notes', { initial: [{ id: 'a', text: 'x' }] })
    const b = s.add({ id: 'b', text: 'y' })
    const u = s.update('b', { text: 'z' })
    expect(Object.isFrozen(s.get('a'))).toBe(true)
    expect(Object.isFrozen(b)).toBe(true)
    expect(Object.isFrozen(u)).toBe(true)
    s.replaceAll([{ id: 'c', text: 'w' }], 'reset')
    expect(Object.isFrozen(s.get('c'))).toBe(true)
  })
})
