import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { fr } from '../../locales/fr'
import { en } from '../../messages'

import { createPasswordDialog } from './password-dialog'
import { createRedactionDialog, type RedactionDialog } from './redaction-dialog'

import type { RedactionPreview } from '../../model/redaction/types'

let dialogs: RedactionDialog[] = []
afterEach(() => {
  dialogs.forEach((d) => d.destroy())
  dialogs = []
})

function make() {
  const onConfirm = vi.fn<() => void>()
  const onCancel = vi.fn<() => void>()
  const dialog = createRedactionDialog({ onConfirm, onCancel, messages: en })
  dialogs.push(dialog)
  return { dialog, onConfirm, onCancel }
}

const preview = (p: Partial<RedactionPreview> = {}): RedactionPreview => ({
  marks: 1,
  pages: 1,
  overlapped: 0,
  signed: false,
  lockedMarks: 0,
  ...p,
})

const root = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-ink-redaction-dialog]')
const lines = (): string[] =>
  [...root()!.querySelectorAll('.ink-dialog-description p')].map((p) => p.textContent)
const buttons = (): HTMLButtonElement[] => [
  ...root()!.querySelectorAll<HTMLButtonElement>('.ink-dialog-actions button'),
]

describe('createRedactionDialog', () => {
  it('lists the marks and pages', async () => {
    const { dialog, onConfirm, onCancel } = make()
    dialog.open(preview({ marks: 3, pages: 2 }))
    const el = root()!
    expect(el).toBe(dialog.element)
    expect(el.getAttribute('role')).toBe('dialog')
    expect(el.getAttribute('aria-modal')).toBe('true')
    expect(el.classList.contains('ink-dialog')).toBe(true)
    const title = el.querySelector('.ink-dialog-title')!
    expect(title.textContent).toBe('Apply redactions?')
    expect(el.getAttribute('aria-labelledby')).toBe(title.id)
    expect(el.getAttribute('aria-describedby')).toBe(
      el.querySelector('.ink-dialog-description')!.id
    )
    expect(lines()).toEqual([
      'This removes the content under 3 marks on 2 pages.',
      'It cannot be undone.',
    ])
    expect(buttons().map((b) => b.textContent)).toEqual(['Cancel', 'Apply'])
    expect(document.querySelector('[data-ink-dialog-overlay]')).not.toBeNull()
    // Focus starts on Cancel, so Enter does not apply by accident.
    expect(document.activeElement).toBe(buttons()[0])

    dialog.close()
    dialog.open(preview())
    expect(lines()[0]).toBe('This removes the content under 1 mark on 1 page.')
    // Apply closes the dialog and confirms.
    await userEvent.click(buttons()[1]!)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
    expect(root()).toBeNull()
    expect(document.querySelector('[data-ink-dialog-overlay]')).toBeNull()
  })

  it('shows the overlap and signed lines only when they apply', () => {
    const { dialog } = make()
    dialog.open(preview({ marks: 2, pages: 1, overlapped: 1, signed: true }))
    expect(lines()).toEqual([
      'This removes the content under 2 marks on 1 page.',
      'It cannot be undone.',
      '1 other annotation under the marks will be removed too.',
      'This file is signed. Its signature will stop verifying.',
    ])
    dialog.close()
    dialog.open(preview({ overlapped: 4 }))
    expect(lines()).toEqual([
      'This removes the content under 1 mark on 1 page.',
      'It cannot be undone.',
      '4 other annotations under the marks will be removed too.',
    ])
    dialog.close()
    // Earlier marks in an encrypted file only: their line stands first.
    dialog.open(preview({ marks: 0, pages: 0, lockedMarks: 2 }))
    expect(lines()).toEqual([
      '2 marks saved in this file earlier will be applied too.',
      'It cannot be undone.',
    ])
    dialog.close()
    dialog.open(preview({ lockedMarks: 1 }))
    expect(lines()).toEqual([
      'This removes the content under 1 mark on 1 page.',
      '1 mark saved in this file earlier will be applied too.',
      'It cannot be undone.',
    ])
    // New words relabel the open dialog in place.
    dialog.setMessages(fr)
    expect(root()!.querySelector('.ink-dialog-title')!.textContent).toBe(
      fr.viewer.redactTitle
    )
    expect(lines()[0]).toBe(fr.viewer.redactSummary({ marks: 1, pages: 1 }))
    expect(buttons().map((b) => b.textContent)).toEqual([
      fr.viewer.redactCancel,
      fr.viewer.redactConfirm,
    ])
  })

  it('Escape cancels and focus returns', async () => {
    const control = document.createElement('button')
    document.body.append(control)
    try {
      const { dialog, onCancel, onConfirm } = make()
      control.focus()
      dialog.open(preview())
      expect(document.activeElement).toBe(buttons()[0])
      // Tab stays inside the dialog.
      await userEvent.tab()
      expect(document.activeElement).toBe(buttons()[1])
      await userEvent.tab()
      expect(root()!.contains(document.activeElement)).toBe(true)
      await userEvent.keyboard('{Escape}')
      expect(onCancel).toHaveBeenCalledTimes(1)
      expect(onConfirm).not.toHaveBeenCalled()
      expect(root()).toBeNull()
      expect(document.activeElement).toBe(control)

      // Cancel and the overlay cancel too.
      control.focus()
      dialog.open(preview())
      buttons()[0]!.click()
      expect(onCancel).toHaveBeenCalledTimes(2)
      expect(document.activeElement).toBe(control)
      dialog.open(preview())
      document
        .querySelector('[data-ink-dialog-overlay]')!
        .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      expect(onCancel).toHaveBeenCalledTimes(3)
      expect(root()).toBeNull()
    } finally {
      control.remove()
    }
  })

  it('the theme styles it as it styles the password dialog', () => {
    const style = document.createElement('style')
    style.textContent = themeCss
    document.head.append(style)
    const password = createPasswordDialog({
      onSubmit: () => undefined,
      onCancel: () => undefined,
    })
    try {
      const { dialog } = make()
      dialog.open(preview({ overlapped: 1 }))
      const look = (el: Element) => {
        const s = getComputedStyle(el)
        return {
          background: s.backgroundColor,
          border: s.borderColor,
          position: s.position,
        }
      }
      const mine = look(root()!)
      dialog.close()
      password.open({ incorrect: false })
      const theirs = look(document.querySelector('[data-ink-password-dialog]')!)
      expect(mine).toEqual(theirs)
      expect(mine.position).toBe('fixed')
      expect(mine.background).not.toBe('rgba(0, 0, 0, 0)')
    } finally {
      password.destroy()
      style.remove()
    }
  })
})
