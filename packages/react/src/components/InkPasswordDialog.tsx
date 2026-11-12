/*
 * "Password required": a modal that asks for the password of a locked file. InkViewport mounts
 * it and drives `open`, `incorrect` and `pending` from the password prompt; place your own to
 * build another flow. It holds no password beyond the field: Open hands the value to
 * `onSubmit`, and the field is cleared when the dialog closes and after each wrong try. Escape,
 * Cancel or a press outside closes it.
 */
import { PASSWORD_LABELS } from '@inkbar/core/dom'
import { Dialog } from 'radix-ui'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { cx } from '../class-names'

export interface InkPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The last try was wrong: shows the message. */
  incorrect: boolean
  /** A try is loading: Open is disabled until it ends. */
  pending: boolean
  /** The typed password, for one load. */
  onSubmit: (password: string) => void
  /** Where focus goes on close; by default, back to what had it before. */
  onCloseAutoFocus?: ((event: Event) => void) | undefined
  className?: string | undefined
}

export function InkPasswordDialog({
  open,
  onOpenChange,
  incorrect,
  pending,
  onSubmit,
  onCloseAutoFocus,
  className,
}: InkPasswordDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ink-dialog-overlay" data-ink-dialog-overlay="" />
        <Dialog.Content
          className={cx('ink-dialog ink-password-dialog', className)}
          data-ink-password-dialog=""
          aria-modal="true"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement)
              .querySelector<HTMLElement>('input')
              ?.focus({ preventScroll: true })
          }}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <Dialog.Title className="ink-dialog-title">
            {PASSWORD_LABELS.dialog}
          </Dialog.Title>
          <Dialog.Description className="ink-dialog-description">
            {PASSWORD_LABELS.description}
          </Dialog.Description>
          <PasswordForm
            incorrect={incorrect}
            pending={pending}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** The dialog's body, mounted while it is open: the field starts empty each time. */
function PasswordForm({
  incorrect,
  pending,
  onSubmit,
  onCancel,
}: {
  incorrect: boolean
  pending: boolean
  onSubmit: (password: string) => void
  onCancel: () => void
}) {
  const uid = useId()
  const inputId = `${uid}-input`
  const errorId = `${uid}-error`
  const input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  /** Counts the tries that came back wrong, to key the alert so each one is announced. */
  const [attempt, setAttempt] = useState(0)
  const disabled = pending || value === ''

  // A try that ends wrong: a new alert, an empty field, focus back in it. `incorrect` may
  // arrive a render after `pending` ends, so a finished try waits for it.
  const wasPending = useRef(false)
  const finished = useRef(false)
  useEffect(() => {
    if (pending) {
      wasPending.current = true
      finished.current = false
      return
    }
    if (wasPending.current) {
      wasPending.current = false
      finished.current = true
    }
    if (finished.current && incorrect) {
      finished.current = false
      setAttempt((n) => n + 1)
      setValue('')
      input.current?.focus({ preventScroll: true })
    }
  }, [pending, incorrect])

  function submit(e: FormEvent): void {
    e.preventDefault()
    if (!disabled) onSubmit(value)
  }

  return (
    <form className="ink-password-form" data-ink-password-form="" onSubmit={submit}>
      <label className="ink-password-label" htmlFor={inputId}>
        {PASSWORD_LABELS.field}
      </label>
      <input
        id={inputId}
        ref={input}
        className="ink-password-input"
        type="password"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={incorrect ? 'true' : 'false'}
        aria-describedby={incorrect ? errorId : undefined}
      />
      {incorrect ? (
        <p key={attempt} id={errorId} className="ink-password-error" role="alert">
          {PASSWORD_LABELS.incorrect}
        </p>
      ) : null}
      <div className="ink-dialog-actions">
        <button type="button" className="ink-button" onClick={onCancel}>
          {PASSWORD_LABELS.cancel}
        </button>
        <button
          type="submit"
          className="ink-button"
          data-variant="primary"
          disabled={disabled}
        >
          {PASSWORD_LABELS.submit}
        </button>
      </div>
    </form>
  )
}
