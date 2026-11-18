import { useInkContext } from '../context.js'
import { useReadable } from '../use-readable.svelte.js'

import type { EmbeddedSummary } from '@inkbar/core'

const NONE: readonly EmbeddedSummary[] = []

/**
 * What the file contains, by PDF subtype. It follows the document: once the annotations Inkbar
 * saved have been lifted into the session, the summary no longer counts them.
 */
export function useEmbedded() {
  const ctx = useInkContext('useEmbedded()')
  const summary = useReadable(() => ctx.document?._embedded, NONE)
  return {
    get summary() {
      return summary.current
    },
    get total() {
      return summary.current.reduce((n, s) => n + s.count, 0)
    },
    get hasAny() {
      return summary.current.length > 0
    },
  }
}
