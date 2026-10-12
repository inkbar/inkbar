import { computed, shallowRef, toRaw, watch, type Ref } from 'vue'

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

type Snapshot = readonly Annotation[]
type Pending = { kind: 'undo' | 'redo'; target: Snapshot }

/**
 * Snapshot undo and redo over a host-owned annotation list, for controlled hosts. Every change
 * the host applies is a step; undo and redo propose an earlier list and move the stacks only
 * once the host applies it.
 *
 * Snapshots are copies, so a host that mutates its annotation objects in place cannot rewrite
 * history, and proposals are fresh copies the host may keep.
 */
export function createRefHistory(opts: RefHistoryOptions): InkHistory {
  const limit = opts.limit ?? 200
  const past = shallowRef<Snapshot[]>([])
  const future = shallowRef<Snapshot[]>([])
  let pending: Pending | null = null
  /** Copy of the host's list as of its last change, recorded when the next change arrives. */
  let current: Snapshot | undefined = snapshot(opts.source())

  function clear(): void {
    past.value = []
    future.value = []
    pending = null
  }

  watch(opts.source, (next) => {
    const prev = current
    current = snapshot(next)
    if (!opts.enabled.value) {
      // Steps taken while disabled are unknown to the stacks, which would undo to stale lists.
      if (past.value.length > 0 || future.value.length > 0 || pending) clear()
      return
    }
    if (next === undefined || prev === undefined) return
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

  function propose(kind: Pending['kind'], target: Snapshot | undefined): void {
    if (!opts.enabled.value || !target) return
    pending = { kind, target }
    opts.apply(clone(target) as Annotation[])
  }

  return {
    canUndo: computed(() => opts.enabled.value && past.value.length > 0),
    canRedo: computed(() => opts.enabled.value && future.value.length > 0),
    undo: () => propose('undo', past.value.at(-1)),
    redo: () => propose('redo', future.value.at(-1)),
    clear,
  }
}

function snapshot(list: readonly Annotation[] | undefined): Snapshot | undefined {
  return list === undefined ? undefined : clone(list)
}

/** Annotations are JSON values; the host's list may be a reactive proxy, so unwrap as we go. */
function clone<T>(value: T): T {
  const raw = toRaw(value) as unknown
  if (Array.isArray(raw)) return raw.map((v: unknown) => clone(v)) as T
  if (raw !== null && typeof raw === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(raw)) out[k] = clone(v)
    return out as T
  }
  return raw as T
}

/** Same annotations in the same order, compared by payload; `modifiedAt` may be re-stamped. */
function sameList(a: readonly Annotation[], b: readonly Annotation[]): boolean {
  return a.length === b.length && a.every((x, i) => sameIgnoringModifiedAt(x, b[i]!))
}

function sameIgnoringModifiedAt(a: Annotation, b: Annotation): boolean {
  const { modifiedAt: _a, ...restA } = toRaw(a)
  const { modifiedAt: _b, ...restB } = toRaw(b)
  return deepEqual(restA, restB)
}

function deepEqual(a: unknown, b: unknown): boolean {
  a = toRaw(a)
  b = toRaw(b)
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null)
    return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every(
    (k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
  )
}
