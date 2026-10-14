import { describe, expect, it, vi } from 'vitest'

import { createSnapshotHistory } from './snapshot-history'

import type { Annotation } from './types'

function note(
  id: string,
  contents: string,
  modifiedAt = '2026-10-13T00:00:00.000Z'
): Annotation {
  return {
    id,
    type: 'note',
    icon: 'comment',
    page: 0,
    rect: { x: 10, y: 10, width: 20, height: 20 },
    color: '#ffd400',
    opacity: 1,
    contents,
    createdAt: '2026-10-13T00:00:00.000Z',
    modifiedAt,
    source: 'session',
  }
}

function setup(enabled = () => true, limit?: number) {
  const apply = vi.fn<(list: Annotation[]) => void>()
  const history = createSnapshotHistory({ apply, enabled, ...(limit ? { limit } : {}) })
  return { apply, history }
}

describe('createSnapshotHistory', () => {
  it('seeds on the first observe and records a step on each later change', () => {
    const { history } = setup()
    history.observe([])
    expect(history.canUndo.get()).toBe(false)
    history.observe([note('a', 'one')])
    expect(history.canUndo.get()).toBe(true)
    expect(history.canRedo.get()).toBe(false)
  })

  it('undo proposes a copy of the previous list and moves the stacks once the host applies it', () => {
    const { apply, history } = setup()
    const first = [note('a', 'one')]
    history.observe([])
    history.observe(first)
    history.undo()
    expect(apply).toHaveBeenCalledTimes(1)
    const proposed = apply.mock.calls[0]![0]
    expect(proposed).toEqual([])
    // Nothing moves until the host applies.
    expect(history.canUndo.get()).toBe(true)
    expect(history.canRedo.get()).toBe(false)
    history.observe(proposed)
    expect(history.canUndo.get()).toBe(false)
    expect(history.canRedo.get()).toBe(true)
    history.redo()
    const redone = apply.mock.calls[1]![0]
    expect(redone).toEqual(first)
    expect(redone).not.toBe(first)
    expect(redone[0]).not.toBe(first[0])
    history.observe(redone)
    expect(history.canUndo.get()).toBe(true)
    expect(history.canRedo.get()).toBe(false)
  })

  it('matches a pending step even when the host re-stamps modifiedAt', () => {
    const { apply, history } = setup()
    history.observe([note('a', 'one')])
    history.observe([note('a', 'two')])
    history.undo()
    const target = apply.mock.calls[0]![0]
    history.observe([
      { ...target[0]!, modifiedAt: '2026-10-13T12:00:00.000Z' },
    ] as Annotation[])
    expect(history.canUndo.get()).toBe(false)
    expect(history.canRedo.get()).toBe(true)
  })

  it('a fresh change after an undo clears the redo stack', () => {
    const { apply, history } = setup()
    history.observe([])
    history.observe([note('a', 'one')])
    history.undo()
    history.observe(apply.mock.calls[0]![0])
    expect(history.canRedo.get()).toBe(true)
    history.observe([note('b', 'other')])
    expect(history.canRedo.get()).toBe(false)
    expect(history.canUndo.get()).toBe(true)
  })

  it('records nothing for a new array with the same content (Review Focus 2)', () => {
    const { history } = setup()
    const list = [note('a', 'one')]
    history.observe(list)
    history.observe([{ ...list[0]! }] as Annotation[])
    history.observe([...list])
    expect(history.canUndo.get()).toBe(false)
  })

  it('an undefined list neither seeds nor records: the list after it seeds again', () => {
    const { history } = setup()
    history.observe(undefined)
    history.observe([note('a', 'one')])
    expect(history.canUndo.get()).toBe(false)
    history.observe([note('a', 'two')])
    expect(history.canUndo.get()).toBe(true)
    history.observe(undefined)
    history.observe([note('b', 'other')])
    // No step from `two` to `other`: the undefined list between them broke the chain.
    expect(history.canUndo.get()).toBe(true)
    history.undo()
    history.observe([note('a', 'one')])
    expect(history.canUndo.get()).toBe(false)
  })

  it('ignores undefined lists and keeps the limit', () => {
    const { history } = setup(() => true, 2)
    history.observe(undefined)
    history.observe([])
    expect(history.canUndo.get()).toBe(false)
    history.observe([note('a', '1')])
    history.observe([note('a', '2')])
    history.observe([note('a', '3')])
    history.undo()
    history.observe([note('a', '2')])
    history.undo()
    history.observe([note('a', '1')])
    expect(history.canUndo.get()).toBe(false)
  })

  it('while disabled it records nothing, clears the stacks and refuses undo', () => {
    let enabled = true
    const { apply, history } = setup(() => enabled)
    history.observe([])
    history.observe([note('a', 'one')])
    expect(history.canUndo.get()).toBe(true)
    enabled = false
    history.observe([note('a', 'two')])
    expect(history.canUndo.get()).toBe(false)
    history.undo()
    expect(apply).not.toHaveBeenCalled()
  })

  it('snapshots are copies: mutating the host list afterwards does not rewrite history', () => {
    const { apply, history } = setup()
    const list = [note('a', 'one')]
    history.observe(list)
    history.observe([note('a', 'two')])
    list[0]!.contents = 'tampered'
    history.undo()
    expect(apply.mock.calls[0]![0][0]!.contents).toBe('one')
  })

  it('clear empties both stacks and forgets a pending step', () => {
    const { apply, history } = setup()
    history.observe([])
    history.observe([note('a', 'one')])
    history.undo()
    history.clear()
    expect(history.canUndo.get()).toBe(false)
    expect(history.canRedo.get()).toBe(false)
    history.observe(apply.mock.calls[0]![0])
    expect(history.canRedo.get()).toBe(false)
  })

  it('canUndo and canRedo are readables that notify subscribers', () => {
    const { history } = setup()
    const seen: boolean[] = []
    history.canUndo.subscribe((v) => seen.push(v))
    history.observe([])
    history.observe([note('a', 'one')])
    expect(seen).toEqual([true])
  })

  it('keeps a pending step when the host re-renders with an equal list', () => {
    const { apply, history } = setup()
    const a = note('a', 'one')
    history.observe([])
    history.observe([a])
    history.undo()
    expect(apply).toHaveBeenCalledWith([])
    history.observe([{ ...a }])
    expect(history.canUndo.get()).toBe(true)
    expect(history.canRedo.get()).toBe(false)
    history.observe([])
    expect(history.canUndo.get()).toBe(false)
    expect(history.canRedo.get()).toBe(true)
  })

  it('treats a limit of 0 as 1', () => {
    const apply = vi.fn<(list: Annotation[]) => void>()
    const history = createSnapshotHistory({ apply, enabled: () => true, limit: 0 })
    history.observe([])
    history.observe([note('a', '1')])
    history.observe([note('a', '2')])
    history.undo()
    history.observe([note('a', '1')])
    expect(history.canUndo.get()).toBe(false)
  })
  describe('batch', () => {
    it('folds observes made during and after fn into one step', () => {
      vi.useFakeTimers()
      try {
        const { history } = setup()
        history.observe([])
        history.batch(() => history.observe([note('a', '1')]))
        history.observe([note('a', '1'), note('b', '2')])
        history.observe([note('a', '1'), note('b', '2'), note('c', '3')])
        expect(history.canUndo.get()).toBe(false)
        vi.runAllTimers()
        expect(history.canUndo.get()).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })

    it('undoes the whole batch in one step and redoes it', () => {
      vi.useFakeTimers()
      try {
        const { history, apply } = setup()
        history.observe([])
        history.batch(() => {})
        history.observe([note('a', '1')])
        history.observe([note('a', '1'), note('b', '2')])
        vi.runAllTimers()
        history.undo()
        expect(apply).toHaveBeenLastCalledWith([])
        history.observe([])
        expect(history.canUndo.get()).toBe(false)
        expect(history.canRedo.get()).toBe(true)
        history.redo()
        expect(apply).toHaveBeenLastCalledWith([note('a', '1'), note('b', '2')])
      } finally {
        vi.useRealTimers()
      }
    })

    it('records nothing when the list ends where it began', () => {
      vi.useFakeTimers()
      try {
        const { history } = setup()
        history.observe([])
        history.batch(() => history.observe([note('a', '1')]))
        history.observe([])
        vi.runAllTimers()
        expect(history.canUndo.get()).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('joins nested calls and still closes when fn throws', () => {
      vi.useFakeTimers()
      try {
        const { history } = setup()
        history.observe([])
        expect(() =>
          history.batch(() => {
            history.batch(() => history.observe([note('a', '1')]))
            history.observe([note('a', '1'), note('b', '2')])
            throw new Error('boom')
          })
        ).toThrow('boom')
        vi.runAllTimers()
        expect(history.canUndo.get()).toBe(true)
        history.undo()
        history.observe([])
        expect(history.canUndo.get()).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('closes an open batch before an undo', () => {
      vi.useFakeTimers()
      try {
        const { history, apply } = setup()
        history.observe([])
        history.batch(() => {})
        history.observe([note('a', '1')])
        history.undo()
        expect(apply).toHaveBeenLastCalledWith([])
        expect(history.canUndo.get()).toBe(true)
        expect(history.canRedo.get()).toBe(false)
        history.observe([])
        expect(history.canUndo.get()).toBe(false)
        expect(history.canRedo.get()).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })

    it('keeps grouping after clear() runs inside fn', () => {
      vi.useFakeTimers()
      try {
        const { history } = setup()
        history.observe([])
        history.batch(() => history.clear())
        vi.runAllTimers()
        history.batch(() => {})
        history.observe([note('a', '1')])
        history.observe([note('a', '1'), note('b', '2')])
        vi.runAllTimers()
        history.undo()
        history.observe([])
        expect(history.canUndo.get()).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('clear() during the settle window drops the step', () => {
      vi.useFakeTimers()
      try {
        const { history } = setup()
        history.observe([])
        history.batch(() => {})
        history.observe([note('a', '1')])
        history.clear()
        vi.runAllTimers()
        expect(history.canUndo.get()).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('a second batch in the settle window is its own step', () => {
      vi.useFakeTimers()
      try {
        const { history, apply } = setup()
        history.observe([])
        history.batch(() => {})
        history.observe([note('a', '1')])
        history.batch(() => {})
        history.observe([note('a', '1'), note('b', '2')])
        vi.runAllTimers()
        history.undo()
        expect(apply).toHaveBeenLastCalledWith([note('a', '1')])
        history.observe([note('a', '1')])
        expect(history.canUndo.get()).toBe(true)
        history.undo()
        expect(apply).toHaveBeenLastCalledWith([])
      } finally {
        vi.useRealTimers()
      }
    })

    it('drops an undo in flight when a batch opens', () => {
      vi.useFakeTimers()
      try {
        const { history, apply } = setup()
        history.observe([])
        history.observe([note('a', '1')])
        history.undo()
        expect(apply).toHaveBeenLastCalledWith([])
        history.batch(() => {})
        vi.runAllTimers()
        // Equal to the dropped undo's target: an ordinary step, not the undo landing.
        history.observe([])
        expect(history.canRedo.get()).toBe(false)
        expect(history.canUndo.get()).toBe(true)
        history.undo()
        expect(apply).toHaveBeenLastCalledWith([note('a', '1')])
        history.observe([note('a', '1')])
        history.undo()
        expect(apply).toHaveBeenLastCalledWith([])
      } finally {
        vi.useRealTimers()
      }
    })

    it('bases the step on the list after an undo that already landed', () => {
      vi.useFakeTimers()
      try {
        const { history, apply } = setup()
        history.observe([])
        history.observe([note('a', '1')])
        history.undo()
        history.observe([])
        history.batch(() => {})
        history.observe([note('b', '2')])
        history.observe([note('b', '2'), note('c', '3')])
        vi.runAllTimers()
        expect(history.canRedo.get()).toBe(false)
        history.undo()
        expect(apply).toHaveBeenLastCalledWith([])
      } finally {
        vi.useRealTimers()
      }
    })

    it('only runs fn when history is disabled', () => {
      const { history } = setup(() => false)
      const fn = vi.fn()
      history.observe([])
      history.batch(fn)
      expect(fn).toHaveBeenCalledOnce()
      history.observe([note('a', '1')])
      expect(history.canUndo.get()).toBe(false)
    })

    it('warns in a dev build when fn returns a promise, and not otherwise', () => {
      vi.useFakeTimers()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      try {
        const { history } = setup()
        history.observe([])
        history.batch(() => history.observe([note('a', '1')]))
        expect(warn).not.toHaveBeenCalled()
        // A thenable stands in for the promise an async fn returns.
        const asyncLike = (() => ({ then: () => undefined })) as () => void
        history.batch(asyncLike)
        expect(warn).toHaveBeenCalledOnce()
        expect(warn.mock.calls[0]![0]).toMatch(/returned a promise/)
        // The batch still closes on time.
        history.observe([note('a', '1'), note('b', '2')])
        vi.runAllTimers()
        expect(history.canUndo.get()).toBe(true)
      } finally {
        warn.mockRestore()
        vi.useRealTimers()
      }
    })
  })
})
