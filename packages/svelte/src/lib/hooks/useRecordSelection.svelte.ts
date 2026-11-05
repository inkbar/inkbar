import { useInkContext } from '../context.js'
import { useReadable } from '../use-readable.svelte.js'

/**
 * The selected record under `key` (`<plugin>.<name>`): the one selection the marks and every
 * record list over those records share. `select` takes an id, or null to clear; an id that has
 * no mark changes nothing. Until InkRoot has mounted (and on the server) nothing is selected
 * and `select` does nothing. `selected` is a getter: keep the object and read through it.
 */
export function useRecordSelection(key: string): {
  readonly selected: string | null
  select(id: string | null): void
} {
  const ctx = useInkContext('useRecordSelection()')
  const selection = $derived(ctx.pluginHost?.selection(key) ?? null)
  const selected = useReadable(() => selection?.selected, null)
  return {
    get selected() {
      return selected.current
    },
    select: (id) => selection?.select(id),
  }
}
