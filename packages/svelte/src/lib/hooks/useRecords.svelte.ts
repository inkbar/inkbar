import { useInkContext } from '../context.js'
import { useReadable } from '../use-readable.svelte.js'

import type { RecordBase } from '@inkbar/core'
import type { HostRecords } from '@inkbar/core/dom'

const NONE: readonly never[] = Object.freeze([])

/**
 * The records a plugin keeps under `key` (`<plugin>.<name>`), for host components: the live list
 * for the open document, and the handle to read and write them, each write one undo step.
 * Plugins are set up once InkRoot has mounted, so until then (and on the server) `handle` is
 * null and `records` is empty. `T` is the plugin's record type. Both are getters: keep the
 * object and read through it.
 */
export function useRecords<T extends RecordBase>(
  key: string
): { readonly records: readonly T[]; readonly handle: HostRecords<T> | null } {
  const ctx = useInkContext('useRecords()')
  // The host keeps one handle per key, so this is the same object for the root's life.
  const handle = $derived(ctx.pluginHost?.records<T>(key) ?? null)
  const records = useReadable<readonly T[]>(() => handle?.list, NONE)
  return {
    get records() {
      return records.current
    },
    get handle() {
      return handle
    },
  }
}
