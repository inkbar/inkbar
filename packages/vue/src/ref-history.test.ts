import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref, shallowRef } from 'vue'

import { createRefHistory } from './ref-history'

import type { Annotation } from '@inkbar/core'

function note(id: string, x = 0, modifiedAt = '2026-10-12T00:00:00.000Z'): Annotation {
  return {
    id,
    type: 'text',
    icon: 'Comment',
    page: 0,
    rect: { x, y: 0, width: 20, height: 20 },
    color: '#ffd400',
    opacity: 1,
    createdAt: '2026-10-12T00:00:00.000Z',
    modifiedAt,
    source: 'session',
  }
}

/** A host that owns the list; `applyAs` decides what it writes back for a proposal. */
function host(initial: Annotation[] = []) {
  const list = shallowRef<Annotation[]>(initial)
  const enabled = ref(true)
  let applyAs = (proposed: Annotation[]): Annotation[] => proposed
  const proposals: Annotation[][] = []
  const scope = effectScope()
  const history = scope.run(() =>
    createRefHistory({
      source: () => list.value,
      apply: (proposed) => {
        proposals.push(proposed)
        list.value = applyAs(proposed)
      },
      enabled,
    })
  )!
  return {
    list,
    enabled,
    history,
    proposals,
    applyWith(fn: (proposed: Annotation[]) => Annotation[]) {
      applyAs = fn
    },
    async set(next: Annotation[]) {
      list.value = next
      await nextTick()
    },
    stop: () => scope.stop(),
  }
}

describe('createRefHistory', () => {
  it('snapshots by value, so a host mutating its objects in place does not rewrite history', async () => {
    const h = host([note('a', 0)])
    const a = h.list.value[0]!
    await h.set([a, note('b')])
    // The host edits the recorded object in place before its next change.
    a.rect.x = 99
    a.contents = 'edited'
    await h.set([a])
    h.history.undo()
    await nextTick()
    const proposed = h.proposals.at(-1)!
    expect(proposed.map((x) => x.id)).toEqual(['a', 'b'])
    expect(proposed[0]!.rect.x).toBe(0)
    expect(proposed[0]!.contents).toBeUndefined()
    // What the host received is a copy, not the stack's own snapshot.
    proposed[0]!.rect.x = 5
    h.history.redo()
    await nextTick()
    h.history.undo()
    await nextTick()
    expect(h.proposals.at(-1)![0]!.rect.x).toBe(0)
    h.stop()
  })

  it('treats an undo as applied when the host re-stamps modifiedAt', async () => {
    const h = host([note('a', 0)])
    await h.set([note('a', 50, '2026-10-12T00:00:01.000Z')])
    h.applyWith((proposed) =>
      proposed.map((x) => ({ ...x, modifiedAt: '2026-10-12T09:09:09.000Z' }))
    )
    h.history.undo()
    await nextTick()
    expect(h.history.canUndo.value).toBe(false)
    expect(h.history.canRedo.value).toBe(true)
    h.stop()
  })

  it('does not take a different payload with the same id and modifiedAt for the undo', async () => {
    const h = host([note('a', 0)])
    await h.set([note('a', 50)])
    // Same id and modifiedAt as the undo target, different rect: a new change, not the undo.
    h.applyWith((proposed) => proposed.map((x) => ({ ...x, rect: { ...x.rect, x: 7 } })))
    h.history.undo()
    await nextTick()
    expect(h.history.canRedo.value).toBe(false)
    expect(h.history.canUndo.value).toBe(true)
    h.stop()
  })

  it('drops its stacks when the list changes while history is disabled', async () => {
    const h = host([note('a', 0)])
    await h.set([note('a', 10)])
    expect(h.history.canUndo.value).toBe(true)
    h.enabled.value = false
    await h.set([note('a', 20)])
    h.enabled.value = true
    await nextTick()
    expect(h.history.canUndo.value).toBe(false)
    expect(h.history.canRedo.value).toBe(false)
    h.stop()
  })

  it('takes the answer to a replaced list as no step, however late it comes', async () => {
    const h = host([note('a'), note('mark')])
    await h.set([note('a'), note('b'), note('mark')])
    expect(h.history.canUndo.value).toBe(true)
    h.history.replaced([note('a'), note('b')])
    expect(h.history.canUndo.value).toBe(false)
    // Another list first is a step as usual; the answer then empties the history.
    await h.set([note('a'), note('b'), note('mark'), note('c')])
    expect(h.history.canUndo.value).toBe(true)
    await h.set([note('a'), note('b')])
    expect(h.history.canUndo.value).toBe(false)
    expect(h.history.canRedo.value).toBe(false)
    // Later changes are steps again.
    await h.set([note('a')])
    expect(h.history.canUndo.value).toBe(true)
    h.stop()
  })

  it('keeps waiting for a lift when the answer to a replaced list comes after it', async () => {
    const h = host([note('a'), note('mark')])
    h.history.replaced([note('a')])
    h.history.lifted([note('l')])
    await h.set([note('a')])
    expect(h.history.canUndo.value).toBe(false)
    // The lift's answer is no step either.
    await h.set([note('a'), note('l')])
    expect(h.history.canUndo.value).toBe(false)
    h.stop()
  })

  it('stops waiting for the answer to a replaced list once cleared', async () => {
    const h = host([note('a'), note('mark')])
    h.history.replaced([note('a')])
    h.history.clear()
    await h.set([note('a')])
    expect(h.history.canUndo.value).toBe(true)
    h.stop()
  })
})
