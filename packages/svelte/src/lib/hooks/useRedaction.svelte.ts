import { canRedact as canRedactOf, redactionBusy } from '@inkbar/core/dom'

import { useInkContext } from '../context.js'
import { useReadable } from '../use-readable.svelte.js'

import type { RedactionResult } from '@inkbar/core'

export interface RedactionHandle {
  /**
   * True while the document is ready and holds a redaction
   * mark (or, in an encrypted file, a locked one Inkbar may have saved earlier).
   */
  readonly canRedact: boolean
  /** True from the confirmation until the redacted file is ready or the apply has failed. */
  readonly busy: boolean
  /**
   * Asks first (InkRoot's `redactionConfirm`), applies the marks, calls InkRoot's `onRedacted`
   * and shows the redacted file. Resolves with what was done once `onRedacted` has been
   * called, even when the root unmounted or another document opened after that. Resolves with
   * null when the reader cancelled, an apply was already running, the apply failed, or the
   * root unmounted or another document opened before `onRedacted` was called. A failure is
   * shown in InkViewport's message box and reaches InkRoot's `onError`; it never rejects.
   */
  apply(): Promise<RedactionResult | null>
}

/** Applying the open document's redaction marks, for a control of your own. */
export function useRedaction(): RedactionHandle {
  const ctx = useInkContext('useRedaction()')
  const can = useReadable(() => (ctx.document ? canRedactOf(ctx.document) : null), false)
  const busy = useReadable(
    () => (ctx.document ? redactionBusy(ctx.document) : null),
    false
  )
  return {
    get canRedact() {
      return ctx.status.state === 'ready' && can.current
    },
    get busy() {
      return busy.current
    },
    apply: () => ctx.applyRedactions(),
  }
}
