import { describe, expect, it } from 'vitest'

import { browserWidth, cssFont, FONT_STACKS } from './text-fonts'

const helv = { family: 'Helvetica', bold: false, italic: false } as const

describe('browserWidth', () => {
  it('scales with the size', () => {
    expect(browserWidth('日', helv, 24)).toBeCloseTo(2 * browserWidth('日', helv, 12), 6)
    expect(browserWidth('日', helv, 12)).toBeGreaterThan(0)
  })

  it('is monospaced in Courier', () => {
    const courier = { ...helv, family: 'Courier' } as const
    expect(browserWidth('i', courier, 12)).toBeCloseTo(browserWidth('W', courier, 12), 3)
  })
})

describe('cssFont', () => {
  it('names the weight, style, size and the family stack', () => {
    expect(cssFont({ family: 'Times', bold: true, italic: true }, 12)).toBe(
      `italic bold 12px ${FONT_STACKS.Times}`
    )
  })
})
