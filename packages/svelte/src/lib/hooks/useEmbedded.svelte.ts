import { useInkContext } from '../context.js'

import type { EmbeddedSummary } from '@inkbar/core'

const NONE: readonly EmbeddedSummary[] = []

export function useEmbedded() {
  const ctx = useInkContext('useEmbedded()')
  const summary = $derived(ctx.document?.embedded ?? NONE)
  return {
    get summary() {
      return summary
    },
    get total() {
      return summary.reduce((n, s) => n + s.count, 0)
    },
    get hasAny() {
      return summary.length > 0
    },
  }
}
