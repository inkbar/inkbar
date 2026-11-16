import { describe, expect, it } from 'vitest'

import { browserWidth } from './text-fonts'

const helv = { family: 'Helvetica', bold: false, italic: false } as const

describe('browserWidth without a document', () => {
  it('gives a wide character one size and any other half a size', () => {
    expect(browserWidth('日', helv, 12)).toBe(12)
    expect(browserWidth('🙂', helv, 12)).toBe(12)
    expect(browserWidth('ж', helv, 12)).toBe(6)
  })
})
