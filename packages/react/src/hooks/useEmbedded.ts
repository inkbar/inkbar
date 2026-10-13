import { useMemo } from 'react'

import { useInkContext } from '../context'

const NONE: readonly never[] = []

export function useEmbedded() {
  const ctx = useInkContext('useEmbedded()')
  const summary = ctx.document?.embedded ?? NONE
  return useMemo(
    () => ({
      summary,
      total: summary.reduce((n, s) => n + s.count, 0),
      hasAny: summary.length > 0,
    }),
    [summary]
  )
}
