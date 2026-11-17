import { afterEach, describe, expect, it, vi } from 'vitest'

import { createUndrawnGuard } from './undrawn'

import type { Annotation } from '../model/annotations/types'

const a = { id: 'a1', type: 'square' } as Annotation

afterEach(() => vi.restoreAllMocks())

describe('createUndrawnGuard', () => {
  it('warns once per annotation while it keeps failing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const guard = createUndrawnGuard()
    const fail = () => {
      throw new Error('no')
    }
    expect(guard.attempt(a, 'was left undrawn', fail)).toBe(false)
    expect(guard.attempt(a, 'was left undrawn', fail)).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain(
      'annotation a1 (square) was left undrawn: no'
    )
  })

  it('warns again when an annotation fails, draws, then fails again', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const guard = createUndrawnGuard()
    const fail = () => {
      throw new Error('no')
    }
    guard.attempt(a, 'was left undrawn', fail)
    expect(guard.attempt(a, 'was left undrawn', () => {})).toBe(true)
    guard.attempt(a, 'was left undrawn', fail)
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('returns the value, or undefined after a failure', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const guard = createUndrawnGuard()
    expect(guard.value(a, 'x', () => 3)).toBe(3)
    expect(
      guard.value(a, 'x', () => {
        throw new Error('no')
      })
    ).toBeUndefined()
  })
})
