import { describe, expect, it, vi } from 'vitest'

import { InkError } from '../model/errors'

import { createPasswordPrompt, lockedStatus } from './password-prompt'

describe('lockedStatus', () => {
  it('maps PasswordRequired', () => {
    expect(
      lockedStatus(
        new InkError('PasswordRequired', 'x', { passwordSupplied: true, incorrect: true })
      )
    ).toEqual({ state: 'locked', incorrect: true })
    expect(
      lockedStatus(new InkError('PasswordRequired', 'x', { passwordSupplied: false }))
    ).toEqual({ state: 'locked', incorrect: false })
    expect(lockedStatus(new InkError('InvalidPdf', 'x'))).toBeNull()
  })
})

describe('createPasswordPrompt', () => {
  it('locked opens the dialog', () => {
    const prompt = createPasswordPrompt(vi.fn())
    prompt.locked()
    expect(prompt.state.get()).toEqual({ asking: true, pending: false })
  })

  it('submit retries once', () => {
    const retry = vi.fn()
    const prompt = createPasswordPrompt(retry)
    prompt.locked()
    prompt.submit('inkbar')
    expect(retry).toHaveBeenCalledExactlyOnceWith('inkbar')
    expect(prompt.state.get().pending).toBe(true)
    prompt.submit('inkbar')
    prompt.submit('')
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('ignores an empty password', () => {
    const retry = vi.fn()
    const prompt = createPasswordPrompt(retry)
    prompt.locked()
    prompt.submit('')
    expect(retry).not.toHaveBeenCalled()
    expect(prompt.state.get().pending).toBe(false)
  })

  it('a locked result after cancel does not reopen', () => {
    const prompt = createPasswordPrompt(vi.fn())
    prompt.locked()
    prompt.submit('a')
    prompt.cancel()
    prompt.locked()
    expect(prompt.state.get()).toEqual({ asking: false, pending: false })
    prompt.ask()
    expect(prompt.state.get().asking).toBe(true)
  })

  it('reset closes and clears', () => {
    const prompt = createPasswordPrompt(vi.fn())
    prompt.locked()
    prompt.cancel()
    prompt.reset()
    expect(prompt.state.get()).toEqual({ asking: false, pending: false })
    prompt.locked()
    expect(prompt.state.get().asking).toBe(true)
  })
})
