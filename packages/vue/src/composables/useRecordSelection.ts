import { computed, type Ref } from 'vue'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

/**
 * The selected record under `key` (`<plugin>.<name>`): the one selection the marks and every
 * record list over those records share. `select` takes an id, or null to clear; an id that has
 * no mark changes nothing. Until InkRoot has mounted (and on the server) nothing is selected
 * and `select` does nothing.
 */
export function useRecordSelection(key: string): {
  selected: Readonly<Ref<string | null>>
  select: (id: string | null) => void
} {
  const { pluginHost } = useInkContext('useRecordSelection()')
  const selection = computed(() => pluginHost.value?.selection(key) ?? null)
  return {
    selected: useReadable(() => selection.value?.selected, null),
    select: (id) => selection.value?.select(id),
  }
}
