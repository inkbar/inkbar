import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { createFormAlert, type FormAlert } from './form-alert'

let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((f) => f())
  cleanup = []
})

function setup(): { root: HTMLElement; button: HTMLButtonElement; alert: FormAlert } {
  const root = document.createElement('div')
  root.dataset.inkRoot = ''
  const scroll = document.createElement('div')
  scroll.dataset.inkScroll = ''
  scroll.tabIndex = 0
  const button = document.createElement('button')
  button.textContent = 'Hello'
  scroll.append(button)
  root.append(scroll)
  document.body.append(root)
  const alert = createFormAlert(root)
  cleanup.push(() => {
    alert.destroy()
    root.remove()
  })
  return { root, button, alert }
}

const panel = () => document.querySelector<HTMLElement>('[data-ink-form-alert]')

describe('createFormAlert', () => {
  it('shows a script alert and returns focus', async () => {
    const { button, alert } = setup()
    button.focus()
    alert.show('Total must be <b>positive</b>\nTry again')
    const p = panel()!
    expect(p.getAttribute('role')).toBe('alertdialog')
    expect(p.hasAttribute('aria-modal')).toBe(false)
    // Non-modal: nothing dims or blocks the page behind it.
    expect(document.querySelector('[data-ink-dialog-overlay]')).toBeNull()
    const title = document.getElementById(p.getAttribute('aria-labelledby')!)!
    expect(title.textContent).toBe('Message')
    const message = document.getElementById(p.getAttribute('aria-describedby')!)!
    // Text, never markup.
    expect(message.textContent).toBe('Total must be <b>positive</b>\nTry again')
    expect(message.querySelector('b')).toBeNull()
    const ok = p.querySelector<HTMLButtonElement>('[data-ink-form-alert-ok]')!
    expect(ok.textContent).toBe('OK')
    expect(document.activeElement).toBe(ok)

    await userEvent.keyboard('{Escape}')
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('OK closes it; a second message replaces the first', async () => {
    const { button, alert } = setup()
    button.focus()
    alert.show('One')
    alert.show('Two')
    expect(document.querySelectorAll('[data-ink-form-alert]')).toHaveLength(1)
    expect(panel()!.querySelector('[data-ink-form-alert-message]')!.textContent).toBe(
      'Two'
    )
    await userEvent.click(panel()!.querySelector('[data-ink-form-alert-ok]')!)
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('leaves Escape in the viewer to the viewer', async () => {
    const { button, alert } = setup()
    alert.show('Saved')
    button.focus()
    let prevented: boolean | undefined
    const spy = (e: KeyboardEvent) => (prevented = e.defaultPrevented)
    document.addEventListener('keydown', spy)
    cleanup.push(() => document.removeEventListener('keydown', spy))
    await userEvent.keyboard('{Escape}')
    expect(prevented).toBe(false)
    expect(panel()).not.toBeNull()
  })

  it('leaves focus that moved elsewhere where it is', () => {
    const { root, button, alert } = setup()
    button.focus()
    alert.show('Saved')
    const scroll = root.querySelector<HTMLElement>('[data-ink-scroll]')!
    scroll.focus()
    alert.close()
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(scroll)
  })
})
