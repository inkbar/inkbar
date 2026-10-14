import { isProduction } from '../env'
import { derived, writable, type Readable } from '../readable'

import type { Annotation } from './types'

export interface SnapshotHistoryOptions {
  /** Proposes a list to the host. The step counts once the host applies it (seen by `observe`). */
  apply: (list: Annotation[]) => void
  /** Read on every observed change and every undo or redo. */
  enabled: () => boolean
  /** Steps kept. Default 200. */
  limit?: number | undefined
}

/**
 * Snapshot undo and redo over a host-owned annotation list, for controlled hosts. The
 * framework calls `observe` whenever the host's list changes; every change is a step. Undo and
 * redo propose an earlier list through `apply` and move the stacks only once the host applies
 * it. `canUndo` and `canRedo` report stack sizes; the framework ANDs them with its own flag.
 */
export interface SnapshotHistory {
  readonly canUndo: Readable<boolean>
  readonly canRedo: Readable<boolean>
  undo(): void
  redo(): void
  clear(): void
  /**
   * The host's current list, or `undefined` when the host does not control it. The first list
   * seeds the history; each later list that differs is a step. An `undefined` neither seeds
   * nor records, and the next list after one starts again without a step.
   */
  observe(list: readonly Annotation[] | undefined): void
  /**
   * Runs `fn` and records the host's changes that follow as one step. A framework may hand the
   * host's list back after `fn` returns, one list per proposal, so the batch stays open until
   * the current macrotask ends (`setTimeout(0)`) and then pushes a single step from the list
   * before `fn` to the latest one. Limit: an unrelated change the host makes in that same window
   * is folded into the step. Nested calls join; a throwing `fn` still closes the batch; when
   * history is disabled `fn` only runs. `fn` must be synchronous; a dev build warns when it
   * returns a promise.
   *
   * A batch opened while an earlier one is still settling closes the earlier one first, so the
   * two are two steps. An undo or redo still in flight (proposed, but not yet applied by the
   * host) when a batch opens is dropped: the host's list that follows counts toward the batch.
   * Undo and redo close a settling batch first. Calling `undo()` or `redo()` inside `fn` is not
   * supported.
   */
  batch(fn: () => void): void
}

type Snapshot = readonly Annotation[]
type Pending = { kind: 'undo' | 'redo'; target: Snapshot }

export function createSnapshotHistory(opts: SnapshotHistoryOptions): SnapshotHistory {
  const limit = Math.max(1, opts.limit ?? 200)
  const past = writable<Snapshot[]>([])
  const future = writable<Snapshot[]>([])
  let pending: Pending | null = null
  /** Copy of the host's list as of its last change; `undefined` before the first list. */
  let current: Snapshot | undefined
  /** Open `batch` calls, and whether the batch is waiting out the task for late observes. */
  let depth = 0
  let settling: ReturnType<typeof setTimeout> | null = null
  /** The host's list when the outermost batch opened. */
  let from: Snapshot | undefined

  function endBatch(): void {
    if (settling !== null) clearTimeout(settling)
    settling = null
    const start = from
    from = undefined
    if (!opts.enabled() || !start || !current || sameList(current, start)) return
    past.set([...past.get(), start].slice(-limit))
    future.set([])
  }

  function batch(fn: () => void): void {
    if (!opts.enabled()) {
      fn()
      return
    }
    if (depth === 0) {
      // A batch still settling is closed first, so two batches are two steps.
      if (settling !== null) endBatch()
      // An undo or redo still in flight would be folded into this step; drop it.
      pending = null
      from = current
    }
    depth++
    try {
      const result: unknown = fn()
      if (
        result !== null &&
        typeof result === 'object' &&
        typeof (result as { then?: unknown }).then === 'function' &&
        !isProduction()
      ) {
        console.warn(
          '[inkbar] history.batch(fn): fn returned a promise. Changes after its first await are not part of the batch.'
        )
      }
    } finally {
      depth--
      if (depth === 0) settling = setTimeout(endBatch, 0)
    }
  }

  function clear(): void {
    past.set([])
    future.set([])
    pending = null
    from = undefined
    if (settling !== null) clearTimeout(settling)
    settling = null
  }

  function observe(next: readonly Annotation[] | undefined): void {
    const prev = current
    current = snapshot(next)
    if (!opts.enabled()) {
      // Steps taken while disabled are unknown to the stacks, which would undo to stale lists.
      if (past.get().length > 0 || future.get().length > 0 || pending) clear()
      return
    }
    // The first list only seeds; there is no step from or to an undefined list.
    if (next === undefined || prev === undefined) return
    // Inside a batch, or while it settles, changes only move `current`; `endBatch` pushes the step.
    if (from !== undefined) return
    // A new array with the same content is not a step, and leaves a pending step alone.
    if (sameList(next, prev)) return
    const step = pending
    pending = null
    if (step && sameList(next, step.target)) {
      if (step.kind === 'undo') {
        past.set(past.get().slice(0, -1))
        future.set([...future.get(), prev])
      } else {
        future.set(future.get().slice(0, -1))
        past.set([...past.get(), prev])
      }
      return
    }
    past.set([...past.get(), prev].slice(-limit))
    future.set([])
  }

  function propose(kind: Pending['kind'], target: Snapshot | undefined): void {
    if (!opts.enabled() || !target) return
    pending = { kind, target }
    opts.apply(clone(target) as Annotation[])
  }

  return {
    canUndo: derived(past, (p) => p.length > 0),
    canRedo: derived(future, (f) => f.length > 0),
    undo: () => {
      if (from !== undefined && depth === 0) endBatch()
      propose('undo', past.get().at(-1))
    },
    redo: () => {
      if (from !== undefined && depth === 0) endBatch()
      propose('redo', future.get().at(-1))
    },
    clear,
    observe,
    batch,
  }
}

function snapshot(list: readonly Annotation[] | undefined): Snapshot | undefined {
  return list === undefined ? undefined : clone(list)
}

/** Annotations are JSON values; this also strips framework proxies and `undefined` members. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Same annotations in the same order, compared by payload; `modifiedAt` may be re-stamped. */
function sameList(a: readonly Annotation[], b: readonly Annotation[]): boolean {
  return a.length === b.length && a.every((x, i) => sameIgnoringModifiedAt(x, b[i]!))
}

function sameIgnoringModifiedAt(a: Annotation, b: Annotation): boolean {
  const { modifiedAt: _a, ...restA } = a
  const { modifiedAt: _b, ...restB } = b
  return deepEqual(restA, restB)
}

/** Structural equality over JSON values; keys whose value is `undefined` count as absent. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null)
    return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = presentKeys(a)
  const kb = presentKeys(b)
  if (ka.length !== kb.length) return false
  return ka.every(
    (k) =>
      kb.includes(k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
  )
}

function presentKeys(o: object): string[] {
  return Object.keys(o).filter((k) => (o as Record<string, unknown>)[k] !== undefined)
}
