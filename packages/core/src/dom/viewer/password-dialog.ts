/*
 * The "Password required" dialog for createViewer, with the same markup, classes and data
 * attributes as the bindings' `InkPasswordDialog`, so `@inkbar/theme` styles both. A modal like
 * the signature dialog: Tab stays inside it, Escape or a press on the overlay cancels, and focus
 * goes back where it came from. It holds no password: Open hands the field's value to
 * `onSubmit`, and the field is cleared when the dialog closes or reopens marked incorrect.
 */
import { trapTab } from '../menu-keys'
import { ENGLISH, type MessageState } from '../messages-state'

import { h } from './dom'

import type { Readable } from '../../model/readable'

export interface PasswordDialogOptions {
  onSubmit(password: string): void
  onCancel(): void
  /**
   * The dialog's words; English when omitted. An open dialog relabels in place when they
   * change, its field, focus and error kept.
   */
  messages?: Readable<MessageState>
}

export interface PasswordDialog {
  readonly isOpen: boolean
  /** Opens (or updates, when open) with the incorrect message shown or hidden. */
  open(opts: { incorrect: boolean; returnFocus?: HTMLElement | null }): void
  setPending(pending: boolean): void
  close(): void
  destroy(): void
}

let dialogs = 0

export function createPasswordDialog(opts: PasswordDialogOptions): PasswordDialog {
  const uid = `ink-password-dialog-${++dialogs}`
  const messages = opts.messages ?? ENGLISH
  const words = () => messages.get().messages.password
  let pending = false
  let shown: {
    input: HTMLInputElement
    mark: (incorrect: boolean) => void
    paint: () => void
    relabel: () => void
  } | null = null
  let teardown: (() => void) | null = null
  const stopMessages = messages.subscribe(() => shown?.relabel())

  function close(): void {
    teardown?.()
    teardown = null
    shown = null
  }

  function cancel(): void {
    close()
    opts.onCancel()
  }

  function build(returnFocus: HTMLElement | null | undefined): void {
    const returnTo =
      returnFocus ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null)

    const input = h('input', {
      class: 'ink-password-input',
      id: `${uid}-input`,
      type: 'password',
      autocomplete: 'off',
      'aria-invalid': 'false',
    })
    const errorId = `${uid}-error`
    let error: HTMLElement | null = null
    const t = words()
    const cancelButton = h('button', { type: 'button', class: 'ink-button' }, t.cancel)
    cancelButton.addEventListener('click', cancel)
    const submit = h(
      'button',
      { type: 'submit', class: 'ink-button', 'data-variant': 'primary' },
      t.submit
    )
    const actions = h('div', { class: 'ink-dialog-actions' }, cancelButton, submit)
    const label = h('label', { class: 'ink-password-label', for: input.id }, t.field)
    const form = h(
      'form',
      { class: 'ink-password-form', 'data-ink-password-form': '' },
      label,
      input,
      actions
    )
    const paint = (): void => {
      submit.disabled = pending || input.value === ''
    }
    input.addEventListener('input', paint)
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      if (pending || input.value === '') return
      opts.onSubmit(input.value)
    })

    const title = h('h2', { class: 'ink-dialog-title', id: `${uid}-title` }, t.dialog)
    const description = h(
      'p',
      { class: 'ink-dialog-description', id: `${uid}-desc` },
      t.description
    )
    const content = h(
      'div',
      {
        class: 'ink-dialog ink-password-dialog',
        'data-ink-password-dialog': '',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': `${uid}-title`,
        'aria-describedby': `${uid}-desc`,
        'data-state': 'open',
        tabindex: '-1',
      },
      title,
      description,
      form
    )
    const overlay = h('div', {
      class: 'ink-dialog-overlay',
      'data-ink-dialog-overlay': '',
      'data-state': 'open',
    })
    overlay.addEventListener('pointerdown', cancel)

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancel()
        return
      }
      trapTab(e, content)
    }
    // Focus that escapes (a click on the page behind) comes back in.
    const onFocus = (e: FocusEvent): void => {
      if (!content.contains(e.target as Node)) input.focus()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus)
    document.body.append(overlay, content)

    shown = {
      input,
      paint,
      mark: (incorrect) => {
        input.setAttribute('aria-invalid', String(incorrect))
        // A new alert each time, so a second wrong password is announced too.
        error?.remove()
        error = null
        if (incorrect) {
          error = h(
            'p',
            { class: 'ink-password-error', id: errorId, role: 'alert' },
            words().incorrect
          )
          input.after(error)
          input.setAttribute('aria-describedby', errorId)
        } else {
          input.removeAttribute('aria-describedby')
        }
      },
      // In place: the alert is not raised again for words alone.
      relabel: () => {
        const w = words()
        title.textContent = w.dialog
        description.textContent = w.description
        label.textContent = w.field
        cancelButton.textContent = w.cancel
        submit.textContent = w.submit
        if (error) error.textContent = w.incorrect
      },
    }
    teardown = () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus)
      input.value = ''
      overlay.remove()
      content.remove()
      if (returnTo?.isConnected) returnTo.focus({ preventScroll: true })
    }
  }

  return {
    get isOpen() {
      return teardown !== null
    },
    open({ incorrect, returnFocus }) {
      if (!shown) build(returnFocus)
      const { input, mark, paint } = shown!
      mark(incorrect)
      if (incorrect) input.value = ''
      paint()
      input.focus({ preventScroll: true })
    },
    setPending(next) {
      pending = next
      shown?.paint()
    },
    close,
    destroy() {
      close()
      stopMessages()
    },
  }
}
