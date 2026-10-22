import { createSnapshotHistory } from '@inkbar/core'
import { computed, onScopeDispose, watch, type Ref } from 'vue'

import { useReadable } from './use-readable'

import type { InkHistory } from './context'
import type { Annotation, AnnotationStore } from '@inkbar/core'

export interface RefHistoryOptions {
  /** The host's list (the `annotations` v-model). Undefined when the host does not control it. */
  source: () => readonly Annotation[] | undefined
  /** Proposes a list to the host; the step only counts once the host applies it. */
  apply: (list: Annotation[]) => void
  enabled: Readonly<Ref<boolean>>
  /**
   * The open document's controlled store, if any. Its user edits run the plugins' reactions
   * inside the edit's step, with or without `enabled`.
   */
  store?: () => AnnotationStore | null | undefined
  limit?: number
}

export interface RefHistory extends InkHistory {
  /** Runs the reactions for the store's user edits; returns a function that detaches it. */
  attach(store: AnnotationStore): () => void
}

/**
 * Snapshot undo and redo over a host-owned annotation list, for controlled hosts. The stacks
 * live in core's `createSnapshotHistory`; this wrapper feeds it from a watch on the host's list
 * and exposes refs. Plugin stores it tracks are snapshotted with each step.
 */
export function createRefHistory(opts: RefHistoryOptions): RefHistory {
  const history = createSnapshotHistory({
    apply: opts.apply,
    enabled: () => opts.enabled.value,
    ...(opts.limit === undefined ? {} : { limit: opts.limit }),
  })
  // Seeds the current list; later changes are steps.
  history.observe(opts.source())
  watch(opts.source, (next) => history.observe(next))
  if (opts.store) {
    // Sync, so the store is attached before anyone can edit through it.
    let detach: (() => void) | undefined
    watch(
      opts.store,
      (store) => {
        detach?.()
        detach = store ? history.attach(store) : undefined
      },
      { immediate: true, flush: 'sync' }
    )
    onScopeDispose(() => detach?.())
  }
  const canUndo = useReadable(history.canUndo, false)
  const canRedo = useReadable(history.canRedo, false)
  return {
    canUndo: computed(() => opts.enabled.value && canUndo.value),
    canRedo: computed(() => opts.enabled.value && canRedo.value),
    undo: () => history.undo(),
    redo: () => history.redo(),
    clear: () => history.clear(),
    batch: (fn) => history.batch(fn),
    track: (store) => history.track(store),
    react: (fn) => history.react(fn),
    attach: (store) => history.attach(store),
  }
}
