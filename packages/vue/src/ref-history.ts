import { createSnapshotHistory } from '@inkbar/core'
import { computed, watch, type Ref } from 'vue'

import { useReadable } from './use-readable'

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

/**
 * Snapshot undo and redo over a host-owned annotation list, for controlled hosts. The stacks
 * live in core's `createSnapshotHistory`; this wrapper feeds it from a watch on the host's list
 * and exposes refs.
 */
export function createRefHistory(opts: RefHistoryOptions): InkHistory {
  const history = createSnapshotHistory({
    apply: opts.apply,
    enabled: () => opts.enabled.value,
    ...(opts.limit === undefined ? {} : { limit: opts.limit }),
  })
  // Seeds the current list; later changes are steps.
  history.observe(opts.source())
  watch(opts.source, (next) => history.observe(next))
  const canUndo = useReadable(history.canUndo, false)
  const canRedo = useReadable(history.canRedo, false)
  return {
    canUndo: computed(() => opts.enabled.value && canUndo.value),
    canRedo: computed(() => opts.enabled.value && canRedo.value),
    undo: () => history.undo(),
    redo: () => history.redo(),
    clear: () => history.clear(),
  }
}
