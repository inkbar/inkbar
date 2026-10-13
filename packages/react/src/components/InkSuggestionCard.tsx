/*
 * Review card for a suggested redaction: opens when the activated annotation, or the only
 * selected one, is a redaction with `origin: 'suggested'`. Locked suggestions cannot be
 * dismissed, so they get no Dismiss button. A press on the overlay selects and activates, so a
 * click opens it whatever the tool. Closing clears `activated` and the selection.
 */
import { confidenceBucket } from '@inkbar/core'
import { Popover } from 'radix-ui'
import { useMemo, type ReactNode } from 'react'

import { useInkContext } from '../context'
import { useAnnotations } from '../hooks/useAnnotations'

import { useAnnotationElement } from './annotation-element'
import { keepOpenOnAnnotation, useFocusReturn } from './popover-focus'

import type { ConfidenceBucket, RedactAnnotation } from '@inkbar/core'
import type { SuggestionCardSlotProps } from '@inkbar/core/dom'

export interface InkSuggestionCardProps {
  children?: ((props: SuggestionCardSlotProps) => ReactNode) | undefined
}

export function InkSuggestionCard({ children }: InkSuggestionCardProps) {
  const ctx = useInkContext('InkSuggestionCard')
  const {
    annotations,
    selection,
    accept: acceptId,
    dismiss: dismissId,
    select,
  } = useAnnotations()

  function suggestion(id: string | null | undefined): RedactAnnotation | null {
    const a = id ? annotations.find((x) => x.id === id) : undefined
    return a?.type === 'redact' && a.origin === 'suggested' ? a : null
  }
  // The activated annotation when it is a suggestion; otherwise the only selected one (a
  // marquee selects without activating).
  const target =
    suggestion(ctx.activated) ??
    (selection.length === 1 ? suggestion(selection[0]) : null)
  const anchor = useAnnotationElement(ctx.rootEl, target?.id ?? null)
  const anchorRef = useMemo(() => ({ current: anchor }), [anchor])
  const focusReturn = useFocusReturn(ctx)
  const open = target !== null && anchor !== null
  const bucket: ConfidenceBucket | undefined = target?.suggestion
    ? confidenceBucket(target.suggestion.confidence)
    : undefined

  function close(): void {
    ctx.setActivated(null)
    select([])
  }
  function accept(): void {
    if (target) acceptId(target.id)
    close()
  }
  /** Locked annotations cannot be removed: dismissing one does nothing and keeps the card. */
  function dismiss(): void {
    if (!target || target.locked) return
    focusReturn.beforeRemove(anchor, '[data-origin="suggested"]')
    dismissId(target.id)
    close()
  }

  return (
    <Popover.Root open={open} onOpenChange={(next) => !next && close()}>
      <Popover.Anchor virtualRef={anchorRef} />
      <Popover.Portal>
        {target && anchor ? (
          <Popover.Content
            className="ink-suggestion-card"
            data-ink-suggestion-card=""
            side="bottom"
            sideOffset={6}
            collisionPadding={8}
            aria-label="Suggested redaction"
            onInteractOutside={keepOpenOnAnnotation}
            onCloseAutoFocus={(e) => focusReturn.onCloseAutoFocus(e, anchor)}
          >
            {children ? (
              children({
                annotation: target,
                suggestion: target.suggestion,
                bucket,
                accept,
                dismiss,
                close,
              })
            ) : (
              <>
                <p className="ink-suggestion-reason">
                  <strong>{target.suggestion?.reason ?? 'Suggested redaction'}</strong>
                  {bucket ? (
                    <span className="ink-suggestion-confidence" data-confidence={bucket}>
                      {bucket} confidence
                    </span>
                  ) : null}
                </p>
                {target.suggestion?.explanation ? (
                  <p className="ink-suggestion-explanation">
                    {target.suggestion.explanation}
                  </p>
                ) : null}
                <div className="ink-suggestion-actions">
                  <button type="button" onClick={accept}>
                    Accept
                  </button>
                  {!target.locked ? (
                    <button type="button" onClick={dismiss}>
                      Dismiss
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </Popover.Content>
        ) : null}
      </Popover.Portal>
    </Popover.Root>
  )
}
