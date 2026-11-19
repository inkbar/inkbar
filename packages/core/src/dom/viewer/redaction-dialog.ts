/*
 * The "Apply redactions?" confirmation, made the way the password dialog is, so `@inkbar/theme`
 * styles both: a modal over an overlay, Tab kept inside it, focus on Cancel when it opens so
 * Enter does not apply by accident, Escape or a press on the overlay cancels, and focus goes back
 * where it came from (the control that opened it). It says what the apply will do, from
 * `doc.redactionPreview()`; the lines about overlapped annotations, a signed file and earlier
 * marks show only when they apply.
 */
import { en, type InkMessages } from '../../messages'
import { trapTab } from '../menu-keys'

import { h } from './dom'

import type { RedactionPreview } from '../../model/redaction/types'

export interface RedactionDialogOptions {
  /** Apply was pressed. The dialog has closed. */
  onConfirm(): void
  /** Cancel, Escape or the overlay. The dialog has closed. */
  onCancel(): void
  /** The dialog's words; English when omitted. `setMessages` replaces them. */
  messages?: InkMessages
}

export interface RedactionDialog {
  /** The dialog itself (`[data-ink-redaction-dialog]`), in the page while it is open. */
  readonly element: HTMLElement
  readonly isOpen: boolean
  /**
   * Opens, or updates when open, with what the apply will do. Focus returns to `returnFocus`
   * when it closes, else to what had focus when it opened.
   */
  open(preview: RedactionPreview, opts?: { returnFocus?: HTMLElement | null }): void
  /** Closes without confirming or cancelling. */
  close(): void
  /** New words: an open dialog relabels in place. */
  setMessages(messages: InkMessages): void
  destroy(): void
}

let dialogs = 0

/** The lines that say what applying `preview` does, in order. */
function linesOf(m: InkMessages, preview: RedactionPreview): string[] {
  const v = m.viewer
  const out: string[] = []
  if (preview.marks > 0)
    out.push(v.redactSummary({ marks: preview.marks, pages: preview.pages }))
  if (preview.lockedMarks > 0) out.push(v.redactLocked({ count: preview.lockedMarks }))
  out.push(v.redactPermanent)
  if (preview.overlapped > 0) out.push(v.redactOverlapped({ count: preview.overlapped }))
  if (preview.signed) out.push(v.redactSigned)
  return out
}

export function createRedactionDialog(opts: RedactionDialogOptions): RedactionDialog {
  const uid = `ink-redaction-dialog-${++dialogs}`
  let messages = opts.messages ?? en
  let shown: RedactionPreview | null = null
  let returnTo: HTMLElement | null = null

  const title = h('h2', { class: 'ink-dialog-title', id: `${uid}-title` })
  const description = h('div', { class: 'ink-dialog-description', id: `${uid}-desc` })
  const cancelButton = h('button', { type: 'button', class: 'ink-button' })
  const confirmButton = h('button', {
    type: 'button',
    class: 'ink-button',
    'data-variant': 'primary',
    'data-ink-redaction-confirm': '',
  })
  const element = h(
    'div',
    {
      class: 'ink-dialog ink-redaction-dialog',
      'data-ink-redaction-dialog': '',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': title.id,
      'aria-describedby': description.id,
      'data-state': 'open',
      tabindex: '-1',
    },
    title,
    description,
    h('div', { class: 'ink-dialog-actions' }, cancelButton, confirmButton)
  )
  const overlay = h('div', {
    class: 'ink-dialog-overlay',
    'data-ink-dialog-overlay': '',
    'data-state': 'open',
  })

  function paint(): void {
    const m = messages
    title.textContent = m.viewer.redactTitle
    cancelButton.textContent = m.viewer.redactCancel
    confirmButton.textContent = m.viewer.redactConfirm
    if (shown)
      description.replaceChildren(...linesOf(m, shown).map((line) => h('p', {}, line)))
  }
  paint()

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cancel()
      return
    }
    trapTab(e, element)
  }
  // Focus that escapes (a click on the page behind) comes back in.
  const onFocus = (e: FocusEvent): void => {
    if (!element.contains(e.target as Node)) cancelButton.focus()
  }

  function close(): void {
    if (!shown) return
    shown = null
    document.removeEventListener('keydown', onKey, true)
    document.removeEventListener('focusin', onFocus)
    overlay.remove()
    element.remove()
    const back = returnTo
    returnTo = null
    if (back?.isConnected) back.focus({ preventScroll: true })
  }

  function cancel(): void {
    close()
    opts.onCancel()
  }

  cancelButton.addEventListener('click', cancel)
  confirmButton.addEventListener('click', () => {
    close()
    opts.onConfirm()
  })
  overlay.addEventListener('pointerdown', cancel)

  return {
    element,
    get isOpen() {
      return shown !== null
    },
    open(preview, openOpts) {
      if (!shown) {
        const active = document.activeElement
        returnTo =
          openOpts?.returnFocus ??
          (active instanceof HTMLElement && active !== document.body ? active : null)
        document.addEventListener('keydown', onKey, true)
        document.addEventListener('focusin', onFocus)
        document.body.append(overlay, element)
      }
      shown = preview
      paint()
      cancelButton.focus({ preventScroll: true })
    },
    close,
    setMessages(next) {
      messages = next
      paint()
    },
    destroy() {
      close()
    },
  }
}
