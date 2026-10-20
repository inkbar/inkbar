import { describe, expect, it } from 'vitest'

import { lineEndingPath } from './overlay-render'

const nums = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)

describe('lineEndingPath', () => {
  const at = { x: 10, y: 0 }
  const from = { x: 0, y: 0 }

  it('draws nothing for none', () => {
    expect(lineEndingPath('none', at, from, 2)).toBe('')
  })

  it('draws an open arrow as two wings meeting at the tip, behind it along the line', () => {
    // 2px wide: head length 6, wings 3 either side.
    expect(lineEndingPath('openArrow', at, from, 2)).toBe('M4 -3L10 0L4 3')
  })

  it('closes the closed arrow and orients it along the end segment', () => {
    expect(lineEndingPath('closedArrow', at, from, 2)).toBe('M4 -3L10 0L4 3Z')
    // The same ending on a vertical segment pointing up the page (negative y).
    expect(lineEndingPath('closedArrow', { x: 0, y: -10 }, { x: 0, y: 0 }, 2)).toBe(
      'M-3 -4L0 -10L3 -4Z'
    )
  })

  it('sizes endings from the stroke, at least 1px', () => {
    const thin = nums(lineEndingPath('closedArrow', at, from, 0))
    const wide = nums(lineEndingPath('closedArrow', at, from, 4))
    expect(Math.abs(thin[0]! - 10)).toBe(3)
    expect(Math.abs(wide[0]! - 10)).toBe(12)
  })

  it('draws square, diamond, circle, butt and slash', () => {
    expect(lineEndingPath('square', at, from, 2)).toMatch(/^M.*Z$/)
    expect(lineEndingPath('diamond', at, from, 2)).toMatch(/^M.*Z$/)
    expect(lineEndingPath('circle', at, from, 2)).toContain('A')
    expect(lineEndingPath('butt', at, from, 2)).toBe('M10 -3L10 3')
    expect(lineEndingPath('slash', at, from, 2)).toMatch(/^M[^L]*L[^L]*$/)
  })

  it('returns nothing for a zero-length segment', () => {
    expect(lineEndingPath('openArrow', at, at, 2)).toBe('')
  })
})
