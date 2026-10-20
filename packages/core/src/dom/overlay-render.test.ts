import { describe, expect, it } from 'vitest'

import { lineEndingPath } from './overlay-render'

const nums = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)

describe('lineEndingPath', () => {
  const at = { x: 10, y: 0 }
  const from = { x: 0, y: 0 }

  it('draws nothing for none', () => {
    expect(lineEndingPath('None', at, from, 2)).toBe('')
  })

  it('draws an open arrow as two wings meeting at the tip, behind it along the line', () => {
    // 2px wide: head length 6, wings 3 either side.
    expect(lineEndingPath('OpenArrow', at, from, 2)).toBe('M4 -3L10 0L4 3')
  })

  it('closes the closed arrow and orients it along the end segment', () => {
    expect(lineEndingPath('ClosedArrow', at, from, 2)).toBe('M4 -3L10 0L4 3Z')
    // The same ending on a vertical segment pointing up the page (negative y).
    expect(lineEndingPath('ClosedArrow', { x: 0, y: -10 }, { x: 0, y: 0 }, 2)).toBe(
      'M-3 -4L0 -10L3 -4Z'
    )
  })

  it('sizes endings from the stroke, at least 1px', () => {
    const thin = nums(lineEndingPath('ClosedArrow', at, from, 0))
    const wide = nums(lineEndingPath('ClosedArrow', at, from, 4))
    expect(Math.abs(thin[0]! - 10)).toBe(3)
    expect(Math.abs(wide[0]! - 10)).toBe(12)
  })

  it('draws square, diamond, circle, butt and slash', () => {
    expect(lineEndingPath('Square', at, from, 2)).toMatch(/^M.*Z$/)
    expect(lineEndingPath('Diamond', at, from, 2)).toMatch(/^M.*Z$/)
    expect(lineEndingPath('Circle', at, from, 2)).toContain('A')
    expect(lineEndingPath('Butt', at, from, 2)).toBe('M10 -3L10 3')
    expect(lineEndingPath('Slash', at, from, 2)).toMatch(/^M[^L]*L[^L]*$/)
  })

  it('draws the R arrows with the base at the end and the apex back along the line', () => {
    // 2px wide: size 6, so the apex sits 6 back from the end towards `from`.
    expect(lineEndingPath('ROpenArrow', at, from, 2)).toBe('M10 -3L4 0L10 3')
    expect(lineEndingPath('RClosedArrow', at, from, 2)).toBe('M10 -3L4 0L10 3Z')
    const apex = nums(lineEndingPath('RClosedArrow', at, from, 2))
    expect(apex[2]).toBeGreaterThan(from.x)
    expect(apex[2]).toBeLessThan(at.x)
  })

  it('draws nothing for a name it does not know', () => {
    expect(lineEndingPath('Wobble', at, from, 2)).toBe('')
    expect(lineEndingPath('openArrow', at, from, 2)).toBe('')
  })

  it('returns nothing for a zero-length segment', () => {
    expect(lineEndingPath('OpenArrow', at, at, 2)).toBe('')
  })
})
