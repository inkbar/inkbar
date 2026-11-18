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
  /**
   * The annotations lifted from the file were proposed to the host: the list it answers with
   * re-seeds the history and is no step.
   */
  lifted(annotations: readonly Annotation[]): void
  /**
   * The host was proposed `list` in place of its own, after applying redactions: the history
   * empties, and the list the host answers with (the one with the same annotations) re-seeds it
   * and is no step. `clear` stops waiting for the answer.
   */
  replaced(list: readonly Annotation[]): void
}

/** Whether `list` holds exactly the annotations `ids` names. */
const holdsExactly = (list: readonly Annotation[], ids: ReadonlySet<string>): boolean =>
  list.length === ids.size && list.every((a) => ids.has(a.id))

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
  /** The ids of the list `replaced` proposed, until the host answers with it. */
  let replacing: ReadonlySet<string> | undefined
  /** The annotations `lifted` is waiting for, until the host's list holds them all. */
  let lifting: readonly Annotation[] | undefined
  // Seeds the current list; later changes are steps.
  history.observe(opts.source())
  watch(opts.source, (next) => {
    history.observe(next)
    if (!next) return
    const ids = new Set(next.map((a) => a.id))
    if (lifting?.every((a) => ids.has(a.id))) lifting = undefined
    if (replacing && holdsExactly(next, replacing)) {
      replacing = undefined
      // The answer was taken as a step: the history starts from it instead. A lift still
      // waiting for its answer keeps waiting.
      history.clear()
      if (lifting) history.lifted(lifting)
    }
  })
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
    clear: () => {
      replacing = undefined
      lifting = undefined
      history.clear()
    },
    batch: (fn) => history.batch(fn),
    track: (store) => history.track(store),
    react: (fn) => history.react(fn),
    attach: (store) => history.attach(store),
    lifted: (annotations) => {
      lifting = annotations
      history.lifted(annotations)
    },
    replaced: (list) => {
      history.clear()
      replacing = new Set(list.map((a) => a.id))
    },
  }
}
