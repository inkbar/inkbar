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
): { records: readonly T[]; handle: HostRecords<T> | null } {
  const { pluginHost } = useInkContext('useRecords()')
  // The host keeps one handle per key, so this is the same object on every render.
  const handle = pluginHost?.records<T>(key) ?? null
  return { records: useReadable<readonly T[]>(handle?.list, NONE), handle }
}
