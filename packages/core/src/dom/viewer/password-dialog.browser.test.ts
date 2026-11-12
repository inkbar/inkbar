import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { PASSWORD_LABELS } from '../ui'

import { createPasswordDialog, type PasswordDialog } from './password-dialog'

let dialogs: PasswordDialog[] = []
afterEach(() => {
  dialogs.forEach((d) => d.destroy())
  dialogs = []
})

function make() {
  const onSubmit = vi.fn<(password: string) => void>()
  const onCancel = vi.fn<() => void>()
  const dialog = createPasswordDialog({ onSubmit, onCancel })
  dialogs.push(dialog)
  return { dialog, onSubmit, onCancel }
}

const root = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-ink-password-dialog]')
const input = (): HTMLInputElement =>
  root()!.querySelector<HTMLInputElement>('.ink-password-input')!
const submit = (): HTMLButtonElement =>
  root()!.querySelector<HTMLButtonElement>('button[type="submit"]')!

describe('createPasswordDialog', () => {
  it('renders the shared markup', () => {
    const { dialog } = make()
    dialog.open({ incorrect: false })
    expect(dialog.isOpen).toBe(true)
    const el = root()!
    expect(el.getAttribute('role')).toBe('dialog')
    expect(el.getAttribute('aria-modal')).toBe('true')
    expect(el.classList.contains('ink-dialog')).toBe(true)
    expect(el.classList.contains('ink-password-dialog')).toBe(true)
    expect(
      document.querySelector('[data-ink-dialog-overlay].ink-dialog-overlay')
    ).not.toBeNull()
    const title = el.querySelector('.ink-dialog-title')!
    const desc = el.querySelector('.ink-dialog-description')!
    expect(title.textContent).toBe(PASSWORD_LABELS.dialog)
    expect(desc.textContent).toBe(PASSWORD_LABELS.description)
    expect(el.getAttribute('aria-labelledby')).toBe(title.id)
    expect(el.getAttribute('aria-describedby')).toBe(desc.id)
    const field = input()
    expect(field.type).toBe('password')
    expect(field.getAttribute('autocomplete')).toBe('off')
    expect(field.getAttribute('aria-invalid')).toBe('false')
    expect(el.querySelector(`label[for="${field.id}"]`)?.textContent).toBe(
      PASSWORD_LABELS.field
    )
    expect(document.activeElement).toBe(field)
    expect(el.querySelector('.ink-password-error')).toBeNull()
    const buttons = [...el.querySelectorAll('.ink-dialog-actions button')]
    expect(buttons.map((b) => b.textContent)).toEqual([
      PASSWORD_LABELS.cancel,
      PASSWORD_LABELS.submit,
    ])
  })

  it('Open is disabled while empty or pending', async () => {
    const { dialog, onSubmit } = make()
    dialog.open({ incorrect: false })
    expect(submit().disabled).toBe(true)
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    await userEvent.type(input(), 'x')
    expect(submit().disabled).toBe(false)
    dialog.setPending(true)
    expect(submit().disabled).toBe(true)
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    dialog.setPending(false)
    expect(submit().disabled).toBe(false)
  })

  it('submit hands over the password', async () => {
    const { dialog, onSubmit } = make()
    dialog.open({ incorrect: false })
    await userEvent.type(input(), 'inkbar')
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('inkbar')
  })

  it('incorrect clears and marks the field', async () => {
    const { dialog } = make()
    dialog.open({ incorrect: false })
    await userEvent.type(input(), 'nope')
    dialog.open({ incorrect: true })
    const field = input()
    expect(field.value).toBe('')
    expect(document.activeElement).toBe(field)
    expect(field.getAttribute('aria-invalid')).toBe('true')
    const error = root()!.querySelector('.ink-password-error')!
    expect(error.textContent).toBe(PASSWORD_LABELS.incorrect)
    expect(error.getAttribute('role')).toBe('alert')
    expect(field.getAttribute('aria-describedby')).toBe(error.id)
    expect(submit().disabled).toBe(true)
  })

  it('each wrong password is a new alert', () => {
    const { dialog } = make()
    dialog.open({ incorrect: true })
    const first = root()!.querySelector('.ink-password-error')
    dialog.open({ incorrect: true })
    const errors = root()!.querySelectorAll('.ink-password-error')
    expect(errors).toHaveLength(1)
    expect(errors[0]).not.toBe(first)
    expect(first!.isConnected).toBe(false)
    expect(errors[0]!.getAttribute('role')).toBe('alert')
    expect(input().getAttribute('aria-describedby')).toBe(errors[0]!.id)
  })

  it('Escape, Cancel and the overlay cancel', async () => {
    const returnTo = document.createElement('button')
    document.body.append(returnTo)
    try {
      const { dialog, onCancel } = make()

      dialog.open({ incorrect: false, returnFocus: returnTo })
      await userEvent.keyboard('{Escape}')
      expect(onCancel).toHaveBeenCalledTimes(1)
      expect(root()).toBeNull()
      expect(dialog.isOpen).toBe(false)
      expect(document.activeElement).toBe(returnTo)

      dialog.open({ incorrect: false })
      root()!
        .querySelector<HTMLButtonElement>('.ink-dialog-actions button[type="button"]')!
        .click()
      expect(onCancel).toHaveBeenCalledTimes(2)
      expect(root()).toBeNull()

      dialog.open({ incorrect: false })
      document
        .querySelector('[data-ink-dialog-overlay]')!
        .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      expect(onCancel).toHaveBeenCalledTimes(3)
      expect(root()).toBeNull()
      expect(document.querySelector('[data-ink-dialog-overlay]')).toBeNull()
    } finally {
      returnTo.remove()
    }
  })

  it('close does not cancel', () => {
    const { dialog, onCancel } = make()
    dialog.open({ incorrect: false })
    dialog.close()
    expect(root()).toBeNull()
    expect(onCancel).not.toHaveBeenCalled()
  })
})
