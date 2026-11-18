import { computed } from 'vue'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { EmbeddedSummary } from '@inkbar/core'

const NONE: readonly EmbeddedSummary[] = []

/**
 * What the file contains, by PDF subtype. It follows the document: once the annotations Inkbar
 * saved have been lifted into the session, the summary no longer counts them.
 */
export function useEmbedded() {
  const ctx = useInkContext('useEmbedded()')
  const summary = useReadable(() => ctx.document.value?._embedded, NONE)
  return {
    summary,
    total: computed(() => summary.value.reduce((n, s) => n + s.count, 0)),
    hasAny: computed(() => summary.value.length > 0),
  }
}
