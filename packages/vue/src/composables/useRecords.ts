import { computed, type ComputedRef, type Ref } from 'vue'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { RecordBase } from '@inkbar/core'
import type { HostRecords } from '@inkbar/core/dom'

const NONE: readonly never[] = Object.freeze([])

/**
 * The records a plugin keeps under `key` (`<plugin>.<name>`), for host components: the live list
 * for the open document, and the handle to read and write them, each write one undo step.
 * Plugins are set up once InkRoot has mounted, so until then (and on the server) `handle` is
 * null and `records` is empty. `T` is the plugin's record type.
 */
export function useRecords<T extends RecordBase>(
  key: string
): { records: Readonly<Ref<readonly T[]>>; handle: ComputedRef<HostRecords<T> | null> } {
  const { pluginHost } = useInkContext('useRecords()')
  const handle = computed(() => pluginHost.value?.records<T>(key) ?? null)
  return { records: useReadable(() => handle.value?.list, NONE), handle }
}
