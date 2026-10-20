import { describe, expect, it } from 'vitest'

import { PALETTE } from './palette'

const HEX = /^#[0-9A-F]{6}$/

describe('PALETTE', () => {
  it('every value is an upper-case #RRGGBB', () => {
    const all = [...PALETTE.common, ...PALETTE.greys, ...PALETTE.grid.flat()]
    for (const color of all) expect(color).toMatch(HEX)
  })

  it('has a row of 12 common colours and 12 greys, white to black', () => {
    expect(PALETTE.common).toHaveLength(12)
    expect(PALETTE.greys).toHaveLength(12)
    expect(PALETTE.greys[0]).toBe('#FFFFFF')
    expect(PALETTE.greys[11]).toBe('#000000')
  })

  it('has a tonal grid of 8 rows by 12 hue columns, dark to light', () => {
    expect(PALETTE.grid).toHaveLength(8)
    for (const row of PALETTE.grid) expect(row).toHaveLength(12)
    const lightness = (hex: string) =>
      [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0)
    const column = PALETTE.grid.map((row) => lightness(row[0]!))
    expect(column).toEqual([...column].sort((a, b) => a - b))
  })

  it('has no duplicates within common, and none anywhere in the palette', () => {
    expect(new Set(PALETTE.common).size).toBe(PALETTE.common.length)
    const all = [...PALETTE.common, ...PALETTE.greys, ...PALETTE.grid.flat()]
    expect(new Set(all).size).toBe(all.length)
  })
})
