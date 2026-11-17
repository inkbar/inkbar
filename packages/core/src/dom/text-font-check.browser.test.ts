import { describe, expect, it } from 'vitest'

import {
  checkTextFonts,
  classesIn,
  classOf,
  outsideRunsDiffer,
  TEXT_CLASSES,
} from './text-font-check'

const forcedMode = (import.meta.env as Record<string, string | undefined>)[
  'VITE_INKBAR_TEXT_FONTS'
]
const forcedClasses = (import.meta.env as Record<string, string | undefined>)[
  'VITE_INKBAR_TEXT_CLASSES_DIFFER'
]
const unforced = !forcedMode && !forcedClasses

describe('classOf', () => {
  it.each([
    ['\u{1f642}', 'emoji'],
    ['\u{1f44b}\u{1f3fd}', 'emoji-modifier'],
    ['\u{1f468}‍\u{1f469}‍\u{1f467}', 'emoji-sequence'],
    ['❤‍\u{1f525}', 'emoji-sequence'],
    ['\u{1f1eb}\u{1f1f7}', 'flag'],
    ['1️⃣', 'keycap'],
    ['日', 'han'],
    ['々', 'han'],
    ['。', 'cjk-punctuation'],
    ['「', 'cjk-punctuation'],
    ['〜', 'cjk-punctuation'],
    ['の', 'hiragana'],
    ['コ', 'katakana'],
    ['ー', 'katakana'],
    ['한', 'hangul'],
    ['م', 'arabic'],
    ['ש', 'hebrew'],
    ['П', 'cyrillic'],
  ] as const)('%j is %s', (cluster, name) => {
    expect(classOf(cluster)).toBe(name)
  })

  it('throws for a character of no class, so a sample with a new script gets a probe', () => {
    expect(() => classOf('ก')).toThrow(/No text class/)
    expect(() => checkTextFonts(['ก'])).toThrow(/No text class/)
  })
})

describe('classesIn', () => {
  it('names the classes of the characters outside the tables only', () => {
    expect(classesIn('Order 42 مرحبا and\nשלום 日本 こんにちは')).toEqual(
      new Set(['arabic', 'hebrew', 'han', 'hiragana'])
    )
    expect(classesIn('plain text, é and €\t')).toEqual(new Set())
  })
})

describe('checkTextFonts', () => {
  it.skipIf(!unforced)('probes every class in every font stack', () => {
    const check = checkTextFonts()
    for (const name of TEXT_CLASSES)
      expect(
        check.probes.filter((p) => p.class === name).map((p) => p.family),
        name
      ).toEqual(['Helvetica', 'Times', 'Courier'])
  })

  it.skipIf(!unforced)('is exact only when no class differs', () => {
    const check = checkTextFonts()
    expect(check.mode === 'exact').toBe(check.differing.size === 0)
  })

  it.skipIf(forcedMode !== undefined)(
    'a forced class differs and makes the mode by-cause',
    () => {
      const check = checkTextFonts(undefined, ['arabic'])
      if (check.mode === 'foreign') return
      expect(check.mode).toBe('by-cause')
      expect(check.differing.has('arabic')).toBe(true)
      expect(check.why).toContain('forced to differ: arabic')
    }
  )

  it.skipIf(!unforced)('names only the classes that differ in the log line', () => {
    const check = checkTextFonts()
    if (check.mode !== 'by-cause') return
    for (const name of TEXT_CLASSES)
      expect(check.why.includes(`${name}:`), name).toBe(check.differing.has(name))
  })
})

describe('outsideRunsDiffer', () => {
  const font = { family: 'Helvetica', bold: false, italic: false } as const

  it.skipIf(forcedMode !== undefined)(
    'is false for the runs the layout measures as the browser draws them',
    () => {
      expect(outsideRunsDiffer('Order 42 日本語 and 🙂', font, 18, '日本語🙂')).toBe(
        false
      )
    }
  )

  it('looks only at runs with a character of the lines it is asked about', () => {
    expect(outsideRunsDiffer('plain', font, 18, '日')).toBe(false)
  })
})
