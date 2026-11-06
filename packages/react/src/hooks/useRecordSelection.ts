import { useCallback } from 'react'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

const noop = (): void => undefined

/**
 * The selected record under `key` (`<plugin>.<name>`): the one selection the marks and every
 * record list over those records share. `select` takes an id, or null to clear; an id that has
 * no mark changes nothing. Until InkRoot has mounted (and on the server) nothing is selected
 * and `select` does nothing.
 */
export function useRecordSelection(key: string): {
  selected: string | null
  select: (id: string | null) => void
} {
  const { pluginHost } = useInkContext('useRecordSelection()')
  // The host keeps one selection per key, so `select` keeps its identity across renders.
  const selection = pluginHost?.selection(key) ?? null
  const select = useCallback(
    (id: string | null) => (selection ? selection.select(id) : noop()),
    [selection]
  )
  return { selected: useReadable(selection?.selected, null), select }
}
