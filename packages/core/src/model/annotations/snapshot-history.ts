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
  /** The host's current list, or `undefined` when the host does not control it. */
  observe(list: readonly Annotation[] | undefined): void
}

type Snapshot = readonly Annotation[]
type Pending = { kind: 'undo' | 'redo'; target: Snapshot }

export function createSnapshotHistory(opts: SnapshotHistoryOptions): SnapshotHistory {
  const limit = opts.limit ?? 200
  const past = writable<Snapshot[]>([])
  const future = writable<Snapshot[]>([])
  let pending: Pending | null = null
  let seeded = false
  /** Copy of the host's list as of its last change. */
  let current: Snapshot | undefined

  function clear(): void {
    past.set([])
    future.set([])
    pending = null
  }

  function observe(next: readonly Annotation[] | undefined): void {
    const prev = current
    current = snapshot(next)
    if (!seeded) {
      seeded = true
      return
    }
    if (!opts.enabled()) {
      // Steps taken while disabled are unknown to the stacks, which would undo to stale lists.
      if (past.get().length > 0 || future.get().length > 0 || pending) clear()
      return
    }
    if (next === undefined || prev === undefined) return
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
    // A new array with the same content is not a step.
    if (sameList(next, prev)) return
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
    undo: () => propose('undo', past.get().at(-1)),
    redo: () => propose('redo', future.get().at(-1)),
    clear,
    observe,
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
