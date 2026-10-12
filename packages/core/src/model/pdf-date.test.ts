import { describe, expect, it } from 'vitest'

import { parsePdfDate } from './pdf-date'

describe('parsePdfDate', () => {
  const fb = '2026-01-01T00:00:00.000Z'
  it('parses D: dates with and without zones', () => {
    expect(parsePdfDate('D:20261012120000Z', fb)).toBe('2026-10-12T12:00:00.000Z')
    expect(parsePdfDate("D:20261012130000+01'00'", fb)).toBe('2026-10-12T12:00:00.000Z')
    expect(parsePdfDate('D:20261012', fb)).toBe('2026-10-12T00:00:00.000Z')
  })
  it('falls back on junk', () => {
    expect(parsePdfDate(null, fb)).toBe(fb)
    expect(parsePdfDate('yesterday', fb)).toBe(fb)
  })
})
