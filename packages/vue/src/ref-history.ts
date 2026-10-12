import { computed, shallowRef, watch, type Ref } from 'vue'

import type { InkHistory } from './context'
import type { Annotation } from '@inkbar/core'

export interface RefHistoryOptions {
  /** The host's list (the `annotations` v-model). Undefined when the host does not control it. */
  source: () => readonly Annotation[] | undefined
  /** Proposes a list to the host; the step only counts once the host applies it. */
  apply: (list: Annotation[]) => void
  enabled: Readonly<Ref<boolean>>
  limit?: number
}

type Pending = { kind: 'undo' | 'redo'; target: readonly Annotation[] }

/**
 * Snapshot undo and redo over a host-owned annotation list, for controlled hosts. Every change
 * the host applies is a step; undo and redo propose an earlier list and move the stacks only
 * once the host applies it.
 */
export function createRefHistory(opts: RefHistoryOptions): InkHistory {
  const limit = opts.limit ?? 200
  const past = shallowRef<(readonly Annotation[])[]>([])
  const future = shallowRef<(readonly Annotation[])[]>([])
  let pending: Pending | null = null

  watch(opts.source, (next, prev) => {
    if (!opts.enabled.value || next === undefined || prev === undefined) return
    const step = pending
    pending = null
    if (step && sameList(next, step.target)) {
      if (step.kind === 'undo') {
        past.value = past.value.slice(0, -1)
        future.value = [...future.value, prev]
      } else {
        future.value = future.value.slice(0, -1)
        past.value = [...past.value, prev]
      }
      return
    }
    past.value = [...past.value, prev].slice(-limit)
    future.value = []
  })

  function propose(
    kind: Pending['kind'],
    target: readonly Annotation[] | undefined
  ): void {
    if (!opts.enabled.value || !target) return
    pending = { kind, target }
    opts.apply([...target])
  }

  return {
    canUndo: computed(() => opts.enabled.value && past.value.length > 0),
    canRedo: computed(() => opts.enabled.value && future.value.length > 0),
    undo: () => propose('undo', past.value.at(-1)),
    redo: () => propose('redo', future.value.at(-1)),
    clear() {
      past.value = []
      future.value = []
      pending = null
    },
  }
}

function sameList(a: readonly Annotation[], b: readonly Annotation[]): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => {
      const y = b[i]!
      return x === y || (x.id === y.id && x.modifiedAt === y.modifiedAt)
    })
  )
}
