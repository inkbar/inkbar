import { useMemo } from 'react'

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
  const summary = useReadable(ctx.document?._embedded, NONE)
  return useMemo(
    () => ({
      summary,
      total: summary.reduce((n, s) => n + s.count, 0),
      hasAny: summary.length > 0,
    }),
    [summary]
  )
}
