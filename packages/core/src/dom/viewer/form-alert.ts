/*
 * The message box a form script's `app.alert` shows in createViewer, with the markup and data
 * attributes the bindings' `InkFormAlert` uses, so `@inkbar/theme` styles both. It does not
 * block: the page behind stays usable, and the script has already carried on. Showing it moves
 * focus to OK; OK or Escape closes it, and focus goes back where it was. The message is the
 * script's text, set as text only.
 */
import { FORM_LABELS } from '../ui'

import { h } from './dom'

export interface FormAlert {
  /** Shows `message`, replacing the one showing, if any. */
  show(message: string): void
  /** Closes it, if open, returning focus. */
  close(): void
  destroy(): void
}

let alerts = 0

/**
 * A non-modal alert for the viewer under `root` (`[data-ink-root]`), placed on `<body>`.
 * Escape closes it while focus is in it; elsewhere Escape stays the viewer's.
 */
export function createFormAlert(root: HTMLElement): FormAlert {
  const uid = `ink-form-alert-${++alerts}`
  const title = h(
    'h2',
    { id: `${uid}-title`, class: 'ink-dialog-title' },
    FORM_LABELS.alert
  )
  const message = h('p', {
    id: `${uid}-message`,
    class: 'ink-form-alert-message',
    'data-ink-form-alert-message': '',
  })
  const ok = h(
    'button',
    {
      type: 'button',
      class: 'ink-button',
      'data-variant': 'primary',
      'data-ink-form-alert-ok': '',
    },
    FORM_LABELS.ok
  )
  const panel = h(
    'div',
    {
      role: 'alertdialog',
      'aria-labelledby': `${uid}-title`,
      'aria-describedby': `${uid}-message`,
      class: 'ink-dialog ink-form-alert',
      'data-ink-form-alert': '',
      'data-state': 'open',
      tabindex: '-1',
    },
    title,
    message,
    h('div', { class: 'ink-dialog-actions' }, ok)
  )
  /** Where focus was when the alert opened. */
  let returnTo: HTMLElement | null = null
  let open = false

  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    // Escape elsewhere is the viewer's (clearing a selection, ending a tool).
    const target = e.target
    if (!(target instanceof Node) || !panel.contains(target)) return
    e.preventDefault()
    e.stopPropagation()
    close()
  }

  function close(): void {
    if (!open) return
    open = false
    document.removeEventListener('keydown', onKey, true)
    const hadFocus = panel.contains(document.activeElement)
    panel.remove()
    // Focus that moved elsewhere while the alert showed stays there.
    if (!hadFocus) return
    const back =
      returnTo?.isConnected === true
        ? returnTo
        : root.querySelector<HTMLElement>('[data-ink-scroll]')
    back?.focus({ preventScroll: true })
  }

  ok.addEventListener('click', () => close())

  return {
    show(text) {
      message.textContent = text
      if (!open) {
        open = true
        const active = document.activeElement
        returnTo =
          active instanceof HTMLElement && active !== document.body ? active : null
        document.addEventListener('keydown', onKey, true)
        document.body.append(panel)
      }
      ok.focus({ preventScroll: true })
    },
    close,
    destroy() {
      close()
      panel.remove()
    },
  }
}
