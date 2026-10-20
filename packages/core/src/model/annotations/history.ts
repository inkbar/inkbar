import { isProduction } from '../env'
import { readonly, writable, type Readable } from '../readable'

import { withEmbeddedFields } from './embedded-fields'

import type { AnnotationChange, AnnotationStore } from './store'
import type { Annotation } from './types'

export interface History {
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

interface Entry {
  before: readonly Annotation[]
  after: readonly Annotation[]
}

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
      destroy() {},
    }
  }

  const limit = opts.limit ?? 200
  const undoStack: Entry[] = []
  const redoStack: Entry[] = []
  let previous = store.list.get()
  let replaying = false
  /** Open batch depth; while above zero, changes update `previous` but push no entry. */
  let depth = 0
  /** The list when the outermost batch opened (or was restarted by a replace). */
  let batchStart: readonly Annotation[] | null = null

  const sync = () => {
    canUndo.set(undoStack.length > 0)
    canRedo.set(redoStack.length > 0)
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
      for (const entry of [...undoStack, ...redoStack]) {
        entry.before = fill(entry.before)
        entry.after = fill(entry.after)
      }
      if (batchStart) batchStart = fill(batchStart)
      previous = current
      return
    }
    if (change.kind === 'replace') {
      undoStack.length = 0
      redoStack.length = 0
      previous = current
      if (depth > 0) batchStart = current
      sync()
      return
    }
    if (depth > 0) {
      previous = current
      return
    }
    undoStack.push({ before: previous, after: current })
    if (undoStack.length > limit) undoStack.shift()
    redoStack.length = 0
    previous = current
    sync()
  })

  const apply = (list: readonly Annotation[]) => {
    replaying = true
    try {
      store.replaceAll([...list], 'history')
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
      apply(entry.before)
      sync()
    },
    redo() {
      const entry = redoStack.pop()
      if (destroyed || !entry) return
      undoStack.push(entry)
      apply(entry.after)
      sync()
    },
    batch(fn) {
      if (destroyed) {
        fn()
        return
      }
      if (depth++ === 0) batchStart = store.list.get()
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
        if (--depth === 0 && !destroyed) {
          const before = batchStart
          batchStart = null
          const after = store.list.get()
          // A list that ends where it began, the same annotations in the same order, is no step.
          if (before && !sameAnnotations(before, after)) {
            undoStack.push({ before, after })
            if (undoStack.length > limit) undoStack.shift()
            redoStack.length = 0
            sync()
          }
        }
      }
    },
    destroy() {
      destroyed = true
      batchStart = null
      unsubscribe()
      undoStack.length = 0
      redoStack.length = 0
      sync()
    },
    clear() {
      undoStack.length = 0
      redoStack.length = 0
      previous = store.list.get()
      sync()
    },
  }
}

/** The same annotation objects in the same order. */
function sameAnnotations(a: readonly Annotation[], b: readonly Annotation[]): boolean {
  return a === b || (a.length === b.length && a.every((x, i) => x === b[i]))
}
