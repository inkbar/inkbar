import { useMemo } from 'react'

import { useInkContext } from '../context'

const NONE: readonly never[] = []

export function useEmbedded() {
  const ctx = useInkContext('useEmbedded()')
  const summary = ctx.document?.embedded ?? NONE
  const total = useMemo(() => summary.reduce((n, s) => n + s.count, 0), [summary])
  return { summary, total, hasAny: summary.length > 0 }
}
