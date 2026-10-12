import { readonly, writable, type Readable } from '../readable'

import type { AnnotationChange, AnnotationStore } from './store'
import type { Annotation } from './types'

export interface History {
  readonly canUndo: Readable<boolean>
  readonly canRedo: Readable<boolean>
  undo(): void
  redo(): void
  clear(): void
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
      destroy() {},
    }
  }

  const limit = opts.limit ?? 200
  const undoStack: Entry[] = []
  const redoStack: Entry[] = []
  let previous = store.list.get()
  let replaying = false

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
    if (change.kind === 'replace') {
      undoStack.length = 0
      redoStack.length = 0
      previous = current
      sync()
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
    destroy() {
      destroyed = true
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
