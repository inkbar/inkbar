/*
 * A form script's `app.alert`: the message and OK, shown without blocking (no overlay, not
 * modal), so the form stays usable around it. InkViewport mounts it; hosts compose nothing.
 * OK, or Escape while focus is in the alert, closes it, and focus goes back where it was. A
 * press outside leaves it open, and Escape anywhere else stays with the viewer. A new message
 * replaces the one shown.
 *
 * The markup is core's `createFormAlert`, portalled to `<body>`. It is not a Radix dialog:
 * Radix's dismissable layer takes every Escape on the page while it is open, which would end
 * the viewer's own use of the key.
 */
import { FORM_LABELS } from '@inkbar/core/dom'
import { useId, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export function InkFormAlert({
  message,
  shown,
  fallback,
  onClose,
}: {
  /** The message to show (text, not markup); `null` while none is. */
  message: string | null
  /** Counts the times a message was shown, so the same text shown again takes focus again. */
  shown: number
  /** Where focus goes when nothing it can return to is left. */
  fallback: () => HTMLElement | null
  onClose: () => void
}) {
  const uid = useId()
  const panel = useRef<HTMLDivElement>(null)
  const ok = useRef<HTMLButtonElement>(null)
  /** Where focus was when the alert opened. */
  const returnTo = useRef<HTMLElement | null>(null)
  const open = message !== null
  const wasOpen = useRef(false)

  // Before paint, so focus is read before it moves to OK.
  useLayoutEffect(() => {
    if (!open) {
      wasOpen.current = false
      return
    }
    if (!wasOpen.current) {
      wasOpen.current = true
      const active = document.activeElement
      returnTo.current =
        active instanceof HTMLElement && active !== document.body ? active : null
    }
    ok.current?.focus({ preventScroll: true })
  }, [open, shown])

  const close = (): void => {
    // Focus that moved elsewhere while the alert showed stays there.
    const hadFocus = !!panel.current?.contains(document.activeElement)
    onClose()
    if (!hadFocus) return
    const back = returnTo.current?.isConnected === true ? returnTo.current : fallback()
    back?.focus({ preventScroll: true })
  }

  if (!open) return null
  return createPortal(
    <div
      ref={panel}
      role="alertdialog"
      aria-labelledby={`${uid}-title`}
      aria-describedby={`${uid}-message`}
      className="ink-dialog ink-form-alert"
      data-ink-form-alert=""
      data-state="open"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return
        e.preventDefault()
        e.stopPropagation()
        close()
      }}
    >
      <h2 id={`${uid}-title`} className="ink-dialog-title">
        {FORM_LABELS.alert}
      </h2>
      <p
        id={`${uid}-message`}
        className="ink-form-alert-message"
        data-ink-form-alert-message=""
      >
        {message}
      </p>
      <div className="ink-dialog-actions">
        <button
          ref={ok}
          type="button"
          className="ink-button"
          data-variant="primary"
          data-ink-form-alert-ok=""
          onClick={close}
        >
          {FORM_LABELS.ok}
        </button>
      </div>
    </div>,
    document.body
  )
}
