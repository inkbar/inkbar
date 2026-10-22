import { isProduction } from '../env'
import { derived, writable, type Readable } from '../readable'

import type { RecordBase, RecordStore } from '../records'
import type { PluginHistory } from './history'
import type { AnnotationEdit, AnnotationStore } from './store'
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
 *
 * Tracked record stores belong to their plugins, not the host, so a step also snapshots each of
 * them. Undo and redo put records back at once (`replaceAll(list, 'history')`) and propose the
 * annotations as above; a step whose annotations did not change moves the stacks at once. A
 * record change outside a batch opens one, so the change and the host's list that follows in
 * the same macrotask are one step. A record store's `reset` drops the steps that changed its
 * records; the others still undo and redo.
 */
export interface SnapshotHistory extends PluginHistory {
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
  /**
   * Runs the reactions for each of the store's user edits inside a batch, so what they change
   * joins the edit's step. Undo and redo reach the store as a `replace`, which reacts to nothing.
   * The binding attaches each opened document's store. Returns a function that detaches it.
   */
  attach(store: AnnotationStore): () => void
}

type Records = Map<RecordStore<RecordBase>, readonly RecordBase[]>
/** The host's list and each tracked store's list at one point. */
interface Snapshot {
  annotations: readonly Annotation[]
  records: Records
}
/** An undo or redo waiting for the host, with the records as they stood before it. */
type Pending = { kind: 'undo' | 'redo'; target: Snapshot; records: Records }

const noop = () => {}

export function createSnapshotHistory(opts: SnapshotHistoryOptions): SnapshotHistory {
  const limit = Math.max(1, opts.limit ?? 200)
  const past = writable<Snapshot[]>([])
  const future = writable<Snapshot[]>([])
  let pending: Pending | null = null
  /** Copy of the host's list as of its last change; `undefined` before the first list. */
  let current: readonly Annotation[] | undefined
  /** Open `batch` calls, and whether the batch is waiting out the task for late observes. */
  let depth = 0
  let settling: ReturnType<typeof setTimeout> | null = null
  /** The state when the outermost batch opened; `undefined` while no list has been seen. */
  let from: Snapshot | undefined
  /** Each tracked store with its list as of the last change history saw. */
  const tracked = new Map<
    RecordStore<RecordBase>,
    { previous: readonly RecordBase[]; unsubscribe: () => void }
  >()
  const reactions = new Set<(edit: AnnotationEdit) => void>()
  /** Each attached store with its `edit` unsubscribe. */
  const attached = new Map<AnnotationStore, () => void>()
  /** Set while undo or redo puts records back, so those changes are not steps. */
  let replaying = false

  function records(): Records {
    return new Map([...tracked].map(([s, t]) => [s, t.previous]))
  }

  function state(): Snapshot | undefined {
    return current === undefined
      ? undefined
      : { annotations: current, records: records() }
  }

  function push(step: Snapshot): void {
    past.set([...past.get(), step].slice(-limit))
    future.set([])
  }

  /** Moves the stacks for an undo or redo that has landed; `prev` is the state it left. */
  function move(kind: Pending['kind'], prev: Snapshot): void {
    if (kind === 'undo') {
      past.set(past.get().slice(0, -1))
      future.set([...future.get(), prev])
    } else {
      future.set(future.get().slice(0, -1))
      past.set([...past.get(), prev])
    }
  }

  /**
   * Drops the steps that changed `store` and gives every remaining snapshot its new `list`, so
   * undo and redo leave its records alone. `was` is its list just before the reset. Undo
   * targets lose the snapshot before such a step, redo targets the one after it, so the step's
   * annotation changes fold into its neighbour.
   */
  function dropSteps(
    store: RecordStore<RecordBase>,
    was: readonly RecordBase[],
    list: readonly RecordBase[]
  ): void {
    const changes = (a: Records, b: Records | undefined) => {
      const x = a.get(store)
      const y = b ? b.get(store) : was
      return x !== undefined && y !== undefined && !sameRecords(x, y)
    }
    const renewed = new Map<Snapshot, Snapshot>()
    const renew = (step: Snapshot): Snapshot => {
      const next = step.records.has(store)
        ? { ...step, records: new Map(step.records).set(store, list) }
        : step
      renewed.set(step, next)
      return next
    }
    // Oldest first, then the state now: each undo target is the snapshot before a step.
    const p = past.get()
    past.set(p.filter((step, i) => !changes(step.records, p[i + 1]?.records)).map(renew))
    // Next redo last: each redo target is the snapshot after a step.
    const f = future.get()
    future.set(
      f.filter((step, i) => !changes(step.records, f[i + 1]?.records)).map(renew)
    )
    // An undo or redo in flight still lands when its target survived.
    const target = pending && renewed.get(pending.target)
    pending =
      pending && target
        ? { ...pending, target, records: new Map(pending.records).set(store, list) }
        : null
  }

  /** Opens the outermost batch from the current state. */
  function open(): void {
    // A batch still settling is closed first, so two batches are two steps.
    if (settling !== null) endBatch()
    // An undo or redo still in flight would be folded into this step; drop it.
    pending = null
    from = state()
  }

  function endBatch(): void {
    if (settling !== null) clearTimeout(settling)
    settling = null
    const start = from
    from = undefined
    if (!opts.enabled() || !start || !current) return
    const unchanged =
      sameList(current, start.annotations) &&
      [...start.records].every(([s, list]) =>
        sameRecords(list, tracked.get(s)?.previous ?? list)
      )
    if (!unchanged) push(start)
  }

  function batch(fn: () => void): void {
    if (!opts.enabled()) {
      fn()
      return
    }
    if (depth === 0) open()
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
    if (step && sameList(next, step.target.annotations)) {
      move(step.kind, { annotations: prev, records: step.records })
      return
    }
    push({ annotations: prev, records: records() })
  }

  function propose(kind: Pending['kind'], target: Snapshot | undefined): void {
    if (!opts.enabled() || !target) return
    // The same undo or redo again before the host applies: the records were already put back,
    // so the state it leaves is the one the first call saw.
    const before =
      pending && pending.kind === kind && pending.target === target
        ? pending.records
        : records()
    replaying = true
    try {
      // Stores no longer tracked keep their records.
      for (const [s, list] of target.records) {
        const t = tracked.get(s)
        if (t && !sameRecords(t.previous, list)) s.replaceAll([...list], 'history')
      }
    } finally {
      replaying = false
    }
    // Nothing for the host to apply: the step moves now.
    if (current !== undefined && sameList(current, target.annotations)) {
      move(kind, { annotations: current, records: before })
      return
    }
    pending = { kind, target, records: before }
    opts.apply(clone(target.annotations) as Annotation[])
  }

  function track(store: RecordStore<RecordBase>): () => void {
    if (tracked.has(store)) return noop
    const unsubscribe = store.on('change', (change) => {
      const t = tracked.get(store)
      if (!t) return
      const list = store.list.get()
      // Our own replays (and any other history replace) never become steps.
      if (replaying || (change.kind === 'replace' && change.reason === 'history')) {
        t.previous = list
        return
      }
      if (!opts.enabled()) {
        t.previous = list
        // As in `observe`: steps taken while disabled would leave the stacks stale.
        if (past.get().length > 0 || future.get().length > 0 || pending) clear()
        return
      }
      if (change.kind === 'replace') {
        // A reset starts the store over, so no older step holding its records can be replayed.
        dropSteps(store, t.previous, list)
        t.previous = list
        from?.records.set(store, list)
        return
      }
      // On its own, a change opens a batch from the state before it, which waits out the task
      // for the host's list.
      if (from === undefined && depth === 0 && current !== undefined) {
        open()
        settling = setTimeout(endBatch, 0)
      }
      t.previous = list
    })
    tracked.set(store, { previous: store.list.get(), unsubscribe })
    // Tracked inside an open batch: the batch covers it from here.
    from?.records.set(store, store.list.get())
    return () => {
      if (tracked.get(store)?.unsubscribe !== unsubscribe) return
      unsubscribe()
      tracked.delete(store)
      from?.records.delete(store)
    }
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
    track,
    react(fn) {
      // Wrapped, so the same function added twice runs twice and each handle removes its own.
      const run = (edit: AnnotationEdit) => fn(edit)
      reactions.add(run)
      return () => {
        reactions.delete(run)
      }
    },
    attach(store) {
      if (attached.has(store)) return noop
      const off = store.on('edit', (edit) => {
        if (reactions.size === 0) return
        batch(() => {
          for (const fn of [...reactions]) fn(edit)
        })
      })
      attached.set(store, off)
      // An old handle never detaches a later attachment of the same store.
      return () => {
        if (attached.get(store) !== off) return
        attached.delete(store)
        off()
      }
    },
  }
}

/** The same records in the same order; records are frozen, so identity is enough. */
function sameRecords(a: readonly RecordBase[], b: readonly RecordBase[]): boolean {
  return a === b || (a.length === b.length && a.every((x, i) => x === b[i]))
}

function snapshot(
  list: readonly Annotation[] | undefined
): readonly Annotation[] | undefined {
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
