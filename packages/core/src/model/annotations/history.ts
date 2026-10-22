import { isProduction } from '../env'
import { readonly, writable, type Readable } from '../readable'

import { withEmbeddedFields } from './embedded-fields'

import type { RecordBase, RecordStore } from '../records'
import type { AnnotationChange, AnnotationEdit, AnnotationStore } from './store'
import type { Annotation } from './types'

/** The part of a history plugins use: one undo step across annotations and record stores. */
export interface PluginHistory {
  batch(fn: () => void): void
  /**
   * Makes the store's changes undo steps: on their own, or joining the open batch or edit. The
   * returned function stops tracking; existing entries keep their snapshot of the store but undo
   * and redo no longer replay it.
   */
  track(store: RecordStore<RecordBase>): () => void
  /**
   * Runs `fn` synchronously for every user `add`, `update` and `remove` of an annotation, inside
   * that edit's undo entry, so whatever `fn` changes undoes with the edit. Never runs for
   * `replace`, so never for undo and redo. Returns a function that removes `fn`.
   */
  react(fn: (edit: AnnotationEdit) => void): () => void
}

export interface History extends PluginHistory {
  readonly canUndo: Readable<boolean>
  readonly canRedo: Readable<boolean>
  undo(): void
  redo(): void
  clear(): void
  /**
   * Runs `fn` and records everything it changes as one undo entry. Change events still fire once
   * per annotation. Nested calls join the outer batch. `fn` must be synchronous; changes after an
   * `await` are not part of the batch; a dev build warns when `fn` returns a promise. A throwing
   * `fn` still records what it changed, then rethrows. A batch whose list ends where it began
   * (the same annotations, by identity, in the same order) records nothing and keeps redo.
   * Calling `undo()` or `redo()` inside `fn` is not supported. On a controlled or destroyed
   * history this only runs `fn`, and a history destroyed inside `fn` records nothing.
   */
  batch(fn: () => void): void
  /** Unsubscribes from the store and empties both stacks; undo and redo become no-ops. */
  destroy(): void
}

interface Snapshot<T> {
  before: readonly T[]
  after: readonly T[]
}

interface Entry {
  annotations: Snapshot<Annotation>
  /** Each tracked store that changed in this step. */
  records: Map<RecordStore<RecordBase>, Snapshot<RecordBase>>
}

/** Where an open step (a batch or an edit with its reactions) began. */
interface Start {
  annotations: readonly Annotation[]
  records: Map<RecordStore<RecordBase>, readonly RecordBase[]>
}

const noop = () => {}

/**
 * Snapshot-based undo and redo over an uncontrolled store.
 *
 * In controlled mode the host owns the list, so history is the host's concern (the Vue layer
 * offers `useHistory`). There `createHistory` returns an inert History: `canUndo` and `canRedo`
 * stay false, `undo` and `redo` do nothing, and nothing is recorded.
 */
export function createHistory(
  store: AnnotationStore,
  opts: { limit?: number } = {}
): History {
  const canUndo = writable(false)
  const canRedo = writable(false)

  if (store.mode === 'controlled') {
    return {
      canUndo: readonly(canUndo),
      canRedo: readonly(canRedo),
      undo() {},
      redo() {},
      clear() {},
      batch(fn) {
        fn()
      },
      track: () => noop,
      react: () => noop,
      destroy() {},
    }
  }

  const limit = opts.limit ?? 200
  const undoStack: Entry[] = []
  const redoStack: Entry[] = []
  let previous = store.list.get()
  let replaying = false
  /**
   * Open step depth (batches, and an edit while its reactions run); while above zero, changes
   * update the baselines but push no entry.
   */
  let depth = 0
  /** The lists when the outermost step opened (or were restarted by a replace). */
  let start: Start | null = null
  /** Each tracked store with its list as of the last change history saw. */
  const tracked = new Map<
    RecordStore<RecordBase>,
    { previous: readonly RecordBase[]; unsubscribe: () => void }
  >()
  const reactions = new Set<(edit: AnnotationEdit) => void>()

  const sync = () => {
    canUndo.set(undoStack.length > 0)
    canRedo.set(redoStack.length > 0)
  }

  const push = (entry: Entry) => {
    undoStack.push(entry)
    if (undoStack.length > limit) undoStack.shift()
    redoStack.length = 0
    sync()
  }

  /**
   * Forgets `recordStore`'s records in every entry, so undo and redo leave it alone. An entry
   * left with nothing to replay (no annotation change, no other store) is dropped.
   */
  const dropEntries = (recordStore: RecordStore<RecordBase>) => {
    for (const stack of [undoStack, redoStack]) {
      const kept = stack.filter((entry) => {
        if (!entry.records.delete(recordStore)) return true
        const { before, after } = entry.annotations
        return entry.records.size > 0 || !sameList(before, after)
      })
      stack.splice(0, stack.length, ...kept)
    }
    sync()
  }

  const resetStacks = () => {
    undoStack.length = 0
    redoStack.length = 0
    sync()
  }

  /** Opens the outermost step from `annotations` and every tracked store's baseline. */
  const open = (annotations: readonly Annotation[]) => {
    const records = new Map<RecordStore<RecordBase>, readonly RecordBase[]>()
    for (const [s, t] of tracked) records.set(s, t.previous)
    start = { annotations, records }
  }

  /**
   * Closes the outermost step: one entry for everything that changed since it opened. A step
   * whose lists end where they began (the same objects in the same order) records nothing.
   */
  const close = () => {
    const from = start
    start = null
    if (!from) return
    const annotations = { before: from.annotations, after: store.list.get() }
    previous = annotations.after
    const records = new Map<RecordStore<RecordBase>, Snapshot<RecordBase>>()
    for (const [s, t] of tracked) {
      const before = from.records.get(s) ?? t.previous
      const after = s.list.get()
      t.previous = after
      if (!sameList(before, after)) records.set(s, { before, after })
    }
    if (records.size === 0 && sameList(annotations.before, annotations.after)) return
    push({ annotations, records })
  }

  let destroyed = false
  const unsubscribe = store.on('change', (change: AnnotationChange) => {
    const current = store.list.get()
    // Our own replays (and any other history replace) never become entries.
    if (replaying || (change.kind === 'replace' && change.reason === 'history')) {
      previous = current
      return
    }
    if (change.kind === 'replace' && change.reason === 'embedded') {
      // Fields read from the file late fill in what the import missed: no step, and every
      // snapshot gets the same fields so undo never brings back the unfilled version. Each
      // snapshot keeps its own edits, such as a colour changed before the fields arrived.
      const fill = (list: readonly Annotation[]) =>
        list.map((a) => {
          const f = change.fields.get(a.id)
          return (f && withEmbeddedFields(a, f)) || a
        })
      for (const { annotations } of [...undoStack, ...redoStack]) {
        annotations.before = fill(annotations.before)
        annotations.after = fill(annotations.after)
      }
      if (start) start.annotations = fill(start.annotations)
      previous = current
      return
    }
    if (change.kind === 'replace') {
      previous = current
      if (depth > 0) open(current)
      resetStacks()
      return
    }
    if (depth > 0) {
      // Inside a batch or another edit's reactions: react, and the open step records it all.
      previous = current
      for (const fn of [...reactions]) fn(change)
      return
    }
    // An edit on its own: its reactions run inside a step that opens before the edit.
    open(previous)
    depth++
    try {
      for (const fn of [...reactions]) fn(change)
    } finally {
      // A history destroyed by a reaction records nothing more.
      if (--depth === 0 && !destroyed) close()
    }
  })

  /** Replays a step's lists under the `replaying` guard, skipping stores no longer tracked. */
  const apply = (entry: Entry, side: 'before' | 'after') => {
    replaying = true
    try {
      const { annotations } = entry
      if (!sameList(annotations.before, annotations.after))
        store.replaceAll([...annotations[side]], 'history')
      for (const [s, snapshot] of entry.records)
        if (tracked.has(s)) s.replaceAll([...snapshot[side]], 'history')
    } finally {
      replaying = false
    }
  }

  return {
    canUndo: readonly(canUndo),
    canRedo: readonly(canRedo),
    undo() {
      const entry = undoStack.pop()
      if (destroyed || !entry) return
      redoStack.push(entry)
      apply(entry, 'before')
      sync()
    },
    redo() {
      const entry = redoStack.pop()
      if (destroyed || !entry) return
      undoStack.push(entry)
      apply(entry, 'after')
      sync()
    },
    batch(fn) {
      if (destroyed) {
        fn()
        return
      }
      if (depth++ === 0) open(store.list.get())
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
        // A history destroyed inside `fn` records nothing more.
        if (--depth === 0 && !destroyed) close()
      }
    },
    track(recordStore) {
      if (destroyed || tracked.has(recordStore)) return noop
      const unsubscribeStore = recordStore.on('change', (change) => {
        const t = tracked.get(recordStore)
        if (!t) return
        const before = t.previous
        const current = recordStore.list.get()
        t.previous = current
        // Our own replays (and any other history replace) never become entries.
        if (replaying || (change.kind === 'replace' && change.reason === 'history'))
          return
        if (change.kind === 'replace') {
          // A reset starts the store over, so no older step holding its records can be replayed.
          if (depth > 0 && start) start.records.set(recordStore, current)
          dropEntries(recordStore)
          return
        }
        if (depth > 0) return
        push({
          annotations: { before: previous, after: previous },
          records: new Map([[recordStore, { before, after: current }]]),
        })
      })
      tracked.set(recordStore, {
        previous: recordStore.list.get(),
        unsubscribe: unsubscribeStore,
      })
      // Tracked inside an open step: the step covers it from here.
      if (start) start.records.set(recordStore, recordStore.list.get())
      return () => {
        if (tracked.get(recordStore)?.unsubscribe !== unsubscribeStore) return
        unsubscribeStore()
        tracked.delete(recordStore)
        start?.records.delete(recordStore)
      }
    },
    react(fn) {
      if (destroyed) return noop
      // Wrapped, so the same function added twice runs twice and each handle removes its own.
      const run = (edit: AnnotationEdit) => fn(edit)
      reactions.add(run)
      return () => {
        reactions.delete(run)
      }
    },
    destroy() {
      destroyed = true
      start = null
      unsubscribe()
      for (const t of tracked.values()) t.unsubscribe()
      tracked.clear()
      reactions.clear()
      resetStacks()
    },
    clear() {
      previous = store.list.get()
      for (const [s, t] of tracked) t.previous = s.list.get()
      resetStacks()
    },
  }
}

/** The same objects in the same order. */
function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a === b || (a.length === b.length && a.every((x, i) => x === b[i]))
}
