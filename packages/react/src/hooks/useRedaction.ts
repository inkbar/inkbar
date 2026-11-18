import { canRedact as canRedactOf, redactionBusy } from '@inkbar/core/dom'
import { useMemo } from 'react'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { RedactionResult } from '@inkbar/core'

export interface RedactionHandle {
  /**
   * True while the document is ready, was opened with InkRoot's `engine` and holds a redaction
   * mark (or, in an encrypted file, a locked one Inkbar may have saved earlier).
   */
  canRedact: boolean
  /** True from the confirmation until the redacted file is ready or the apply has failed. */
  busy: boolean
  /**
   * Asks first (InkRoot's `redactionConfirm`), applies the marks, calls InkRoot's `onRedacted`
   * and shows the redacted file. Resolves with what was done, or null when the reader
   * cancelled, nothing was applied, the apply failed, or the root unmounted or another
   * document opened while it ran. A failure is shown in InkViewport's
   * message box and reaches InkRoot's `onError`; it never rejects.
   */
  apply: () => Promise<RedactionResult | null>
}

export function useRedaction(): RedactionHandle {
  const { document: doc, status, applyRedactions } = useInkContext('useRedaction()')
  const can = useReadable(doc ? canRedactOf(doc) : undefined, false)
  const busy = useReadable(doc ? redactionBusy(doc) : undefined, false)
  const canRedact = status.state === 'ready' && can
  return useMemo(
    () => ({ canRedact, busy, apply: applyRedactions }),
    [canRedact, busy, applyRedactions]
  )
}
