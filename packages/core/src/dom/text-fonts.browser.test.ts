import { describe, expect, it } from 'vitest'

import { browserWidth, cssFont, FONT_STACKS } from './text-fonts'

const helv = { family: 'Helvetica', bold: false, italic: false } as const

describe('browserWidth', () => {
  it('measures at the size it is given', () => {
    expect(browserWidth('日', helv, 12)).toBeGreaterThan(0)
    expect(browserWidth('日', helv, 24)).toBeGreaterThan(browserWidth('日', helv, 12))
  })

  it('keeps no more than its cache size and still answers after eviction', () => {
    const first = browserWidth('a', helv, 7)
    for (let i = 0; i < 4100; i++) browserWidth('a', helv, 20 + i / 100)
    expect(browserWidth('a', helv, 7)).toBe(first)
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
