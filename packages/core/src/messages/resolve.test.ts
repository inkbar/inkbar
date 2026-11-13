import { afterEach, describe, expect, it, vi } from 'vitest'

import { en } from './en'
import { formatDate, isValidLocale, resolveLabel, resolveMessages } from './resolve'

import type { InkMessagesInput } from './types'

afterEach(() => vi.restoreAllMocks())

describe('resolveMessages', () => {
  it('returns English without input', () => {
    expect(resolveMessages()).toEqual(en)
  })

  it('keeps English for the rest of a partial group', () => {
    const m = resolveMessages({ find: { close: 'Fermer' } })
    expect(m.find.close).toBe('Fermer')
    expect(m.find.next).toBe(en.find.next)
  })

  it('is pure: a second call does not see the first', () => {
    resolveMessages({ find: { close: 'X' } })
    const m = resolveMessages({ toolbar: { print: 'P' } })
    expect(m.find.close).toBe(en.find.close)
    expect(m.toolbar.print).toBe('P')
  })

  it('drops unknown groups and keys', () => {
    const input = { nope: { a: 'b' }, find: { zzz: 'y' } } as unknown as InkMessagesInput
    let m!: ReturnType<typeof resolveMessages>
    expect(() => (m = resolveMessages(input))).not.toThrow()
    expect(m).not.toHaveProperty('nope')
    expect(m.find).not.toHaveProperty('zzz')
  })

  it('does not mutate English', () => {
    const before = en.find.close
    resolveMessages({ find: { close: 'X' } })
    expect(en.find.close).toBe(before)
  })
})

describe('resolveLabel', () => {
  it('returns strings and calls functions', () => {
    expect(resolveLabel('a')).toBe('a')
    expect(resolveLabel(() => 'b')).toBe('b')
  })

  it('falls back when undefined', () => {
    expect(resolveLabel(undefined, 'x')).toBe('x')
  })

  it('survives a throwing function, warning once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      resolveLabel(() => {
        throw new Error('boom')
      }, 'draw')
    ).toBe('draw')
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('locale helpers', () => {
  it('falls back for an invalid locale', () => {
    expect(formatDate(0, 'xx-!!')).toBe(new Date(0).toLocaleString())
    expect(isValidLocale('xx-!!')).toBe(false)
    expect(isValidLocale('fr-CA')).toBe(true)
    expect(isValidLocale(undefined)).toBe(false)
  })

  it('formats in the locale given', () => {
    expect(formatDate(0, 'en-US')).toBe(new Date(0).toLocaleString('en-US'))
  })
})
