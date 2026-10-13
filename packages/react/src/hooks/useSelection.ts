import { useMemo } from 'react'

import { useInkContext } from '../context'

export function useSelection() {
  const ctx = useInkContext('useSelection()')
  const { selection, document } = ctx
  const store = document?.annotations
  return useMemo(
    () => ({
      selection,
      select: (ids: string[]) => store?.select(ids),
      clear: () => store?.select([]),
    }),
    [selection, store]
  )
}
