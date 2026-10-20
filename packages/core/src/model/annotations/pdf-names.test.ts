import { describe, expect, it } from 'vitest'

import {
  INTENTS,
  isKnown,
  LINE_ENDINGS,
  NOTE_ICONS,
  PDF_NAME,
  pdfNameSet,
} from './pdf-names'

describe('pdfNameSet', () => {
  const sets = { LINE_ENDINGS, NOTE_ICONS, INTENTS }

  for (const [label, list] of Object.entries(sets)) {
    it(`parses every known ${label} value to itself`, () => {
      const schema = pdfNameSet(list)
      for (const v of list) expect(schema.parse(v)).toBe(v)
    })

    it(`keeps other PDF names in ${label}`, () => {
      const schema = pdfNameSet(list)
      for (const v of ['Check', 'Draft_1', 'InkHighlight', 'A.b-c'])
        expect(schema.parse(v)).toBe(v)
    })

    it(`rejects strings that are not PDF names in ${label}`, () => {
      const schema = pdfNameSet(list)
      for (const v of ['', 'has space', 'a/b', '(x)', 'a%b', 'a\tb'])
        expect(schema.safeParse(v).success).toBe(false)
    })
  }

  it('rejects non-strings', () => {
    expect(pdfNameSet(LINE_ENDINGS).safeParse(3).success).toBe(false)
  })

  it('PDF_NAME matches a run of regular characters only', () => {
    expect(PDF_NAME.test('OpenArrow')).toBe(true)
    expect(PDF_NAME.test('a b')).toBe(false)
  })
})

describe('isKnown', () => {
  it('matches the exact spelling only', () => {
    expect(isKnown(LINE_ENDINGS, 'OpenArrow')).toBe(true)
    expect(isKnown(LINE_ENDINGS, 'openArrow')).toBe(false)
  })
})
