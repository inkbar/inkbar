import { canRedact, redactionBusy } from '@inkbar/core/dom'
import { computed } from 'vue'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { RedactionResult } from '@inkbar/core'
import type { Ref } from 'vue'

export interface RedactionHandle {
  /**
   * True while the document is ready, was opened with InkRoot's `engine` and holds a redaction
   * mark (or, in an encrypted file, a locked one Inkbar may have saved earlier).
   */
  canRedact: Readonly<Ref<boolean>>
  /** True from the confirmation until the redacted file is ready or the apply has failed. */
  busy: Readonly<Ref<boolean>>
  /**
   * Asks first (InkRoot's `redactionConfirm`), applies the marks, emits InkRoot's `redacted`
   * and shows the redacted file. Resolves with what was done, or null when the reader
   * cancelled, nothing was applied, the apply failed, or the root unmounted or another
   * document opened while it ran. A failure is shown in InkViewport's
   * message box and emitted as InkRoot's `error`; it never rejects.
   */
  apply: () => Promise<RedactionResult | null>
}

export function useRedaction(): RedactionHandle {
  const ctx = useInkContext('useRedaction()')
  const can = useReadable(
    () => (ctx.document.value ? canRedact(ctx.document.value) : null),
    false
  )
  return {
    canRedact: computed(() => ctx.status.value.state === 'ready' && can.value),
    busy: useReadable(
      () => (ctx.document.value ? redactionBusy(ctx.document.value) : null),
      false
    ),
    apply: () => ctx.applyRedactions(),
  }
}
