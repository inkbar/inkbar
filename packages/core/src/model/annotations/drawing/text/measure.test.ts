import { describe, expect, test, vi } from 'vitest'

import {
  isWide,
  measureWith,
  outsideTables,
  resolveFont,
  standardMeasure,
} from './measure'

import type { TextFont } from '../types'

const helv: TextFont = { family: 'Helvetica', bold: false, italic: false }

describe('standardMeasure', () => {
  test.each([
    ['Helvetica', false, false, 'A', 8.004],
    ['Helvetica', false, false, ' ', 3.336],
    ['Helvetica', false, false, 'Wim', 23.988],
    ['Helvetica', true, false, 'A', 8.664],
    ['Times', false, false, 'A', 8.664],
    ['Times', false, false, ' ', 3],
    ['Courier', false, false, 'W', 7.201171875],
    ['Courier', true, true, 'i', 7.201171875],
    ['Helvetica', false, false, '€', 6.672],
    ['Helvetica', false, false, 'é', 6.672],
    ['Helvetica', false, false, '’', 2.664],
  ] as const)(
    '%s bold=%s italic=%s measures %j as %f at 12pt',
    (family, bold, italic, text, width) => {
      const m = standardMeasure.width(text, { family, bold, italic }, 12)
      expect(m.width).toBeCloseTo(width, 3)
      expect(m.outside).toBe(false)
    }
  )

  test('Ÿ is a capital Y with a diaeresis, not the lower-case letter', () => {
    expect(standardMeasure.width('Ÿ', helv, 12).width).toBeCloseTo(8.004, 3)
    expect(standardMeasure.width('ÿ', helv, 12).width).toBeCloseTo(6, 3)
  })

  test('a prepended mark such as the Arabic number sign is not zero width', () => {
    expect(standardMeasure.width('\u0600', helv, 12)).toEqual({ width: 6, outside: true })
  })

  test('a character outside the tables is flagged and still has a width', () => {
    expect(standardMeasure.width('日', helv, 12)).toEqual({ width: 12, outside: true })
    expect(standardMeasure.width('ж', helv, 12)).toEqual({ width: 6, outside: true })
  })

  test('in Courier a narrow character outside the tables takes the Courier advance, and a wide one a full size', () => {
    const courier: TextFont = { family: 'Courier', bold: false, italic: false }
    const advance = (1229 / 2048) * 12
    expect(standardMeasure.width('ж', courier, 12)).toEqual({
      width: advance,
      outside: true,
    })
    expect(standardMeasure.width('жжж', courier, 12).width).toBeCloseTo(3 * advance, 9)
    expect(standardMeasure.width('日', courier, 12)).toEqual({ width: 12, outside: true })
    expect(standardMeasure.width('жA', courier, 12).width).toBeCloseTo(2 * advance, 9)
  })

  test('an emoji is one wide character, not two UTF-16 units', () => {
    expect(standardMeasure.width('🙂', helv, 12)).toEqual({ width: 12, outside: true })
  })

  test.each([
    '\u2764\ufe0f',
    '\u2600\ufe0f',
    '\u26a0\ufe0f',
    '😀',
    '🇫',
    '🏽',
    '🤖',
    '日',
  ])('%s is wide', (char) => {
    expect(isWide(char)).toBe(true)
  })

  test.each(['a', 'é', '\u2764', '\u2600', '\u00a9', 'ж'])('%s is not wide', (char) => {
    expect(isWide(char)).toBe(false)
  })

  test('a heart with the emoji selector is one wide character in the measure', () => {
    expect(standardMeasure.width('\u2764\ufe0f', helv, 12)).toEqual({
      width: 12,
      outside: true,
    })
  })

  test('zero-width characters take no room and are not outside', () => {
    expect(standardMeasure.width('​­️', helv, 12)).toEqual({
      width: 0,
      outside: false,
    })
  })

  test('the empty string is zero wide', () => {
    expect(standardMeasure.width('', helv, 12)).toEqual({ width: 0, outside: false })
  })

  test('every printable WinAnsi character has a width in every face', () => {
    const chars = [...' !~¡ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ']
    for (const family of ['Helvetica', 'Times', 'Courier'] as const)
      for (const bold of [false, true])
        for (const italic of [false, true])
          for (const c of chars)
            expect(standardMeasure.width(c, { family, bold, italic }, 10)).toMatchObject({
              outside: false,
            })
  })

  test('vertical metrics are those of the fonts browsers substitute', () => {
    expect(standardMeasure.vertical(helv)).toEqual({ ascent: 0.905, descent: 0.212 })
    expect(standardMeasure.vertical({ ...helv, family: 'Times' })).toEqual({
      ascent: 0.891,
      descent: 0.216,
    })
    expect(standardMeasure.vertical({ ...helv, family: 'Courier' })).toEqual({
      ascent: 0.833,
      descent: 0.3,
    })
  })
})

describe('zero-width characters outside the tables', () => {
  test('take no room in the measure with no browser', () => {
    const w = (t: string) => standardMeasure.width(t, helv, 12).width
    expect(w('日\u200b')).toBe(w('日'))
    expect(w('日\u200b日')).toBe(w('日日'))
    expect(w('گ\u200cر')).toBe(w('گر'))
  })
})

describe('measureWith runs', () => {
  const runs = (text: string) => {
    const fallback = vi.fn((_run: string) => 5)
    const m = measureWith(fallback).width(text, helv, 12)
    return { calls: fallback.mock.calls.map((c) => c[0]), m }
  }
  test('consecutive characters outside the tables are measured as one string', () => {
    expect(runs('مرحبا').calls).toEqual(['مرحبا'])
    expect(runs('日本語').calls).toEqual(['日本語'])
  })
  test('a space or a character in the tables ends a run', () => {
    expect(runs('مرحبا بالعالم').calls).toEqual(['مرحبا', 'بالعالم'])
    expect(runs('日本A語').calls).toEqual(['日本', '語'])
  })
  test('the widths add: runs, spaces and table characters', () => {
    const { m } = runs('ab مرحبا cd')
    // Four table letters, two spaces, one run of 5.
    expect(m.width).toBeCloseTo(measureWith(() => 0).width('ab  cd', helv, 12).width + 5)
    expect(m.outside).toBe(true)
  })
  test('a zero-width joiner inside a run stays in it', () => {
    expect(runs('گ\u200cر').calls).toEqual(['گ\u200cر'])
  })
  test('outsideTables says whether any character is outside', () => {
    expect(outsideTables('Hello world')).toBe(false)
    expect(outsideTables('Hello\u200b')).toBe(false)
    expect(outsideTables('Hello 日')).toBe(true)
    // A tab is not a character to measure.
    expect(outsideTables('a\tb')).toBe(false)
  })
})

describe('measureWith', () => {
  test('asks the fallback only for characters outside the tables', () => {
    const fallback = vi.fn(() => 7)
    const m = measureWith(fallback).width('A日', helv, 12)
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(fallback).toHaveBeenCalledWith('日', helv, 12)
    expect(m.width).toBeCloseTo(8.004 + 7, 3)
    expect(m.outside).toBe(true)
  })

  test('does not call the fallback for text inside the tables', () => {
    const fallback = vi.fn(() => 7)
    expect(measureWith(fallback).width('Hello', helv, 12).outside).toBe(false)
    expect(fallback).not.toHaveBeenCalled()
  })
})

describe('resolveFont', () => {
  test.each([
    ['Georgia', 'Times'],
    ['Times New Roman', 'Times'],
    ['Fira Code', 'Courier'],
    ['Open Sans', 'Helvetica'],
    ['', 'Helvetica'],
    ['Comic Sans MS', 'Helvetica'],
    ['Courier New', 'Courier'],
    ['Noto Serif', 'Times'],
    ['Noto Sans Mono', 'Courier'],
    ['Liberation Sans', 'Helvetica'],
  ])('the family %j maps to %s', (name, family) => {
    expect(resolveFont(name, false, false).family).toBe(family)
  })

  test('keeps bold and italic', () => {
    expect(resolveFont('Arial', true, false)).toEqual({
      family: 'Helvetica',
      bold: true,
      italic: false,
    })
  })
})

describe('clusters in the measure', () => {
  const family = '👨‍👩‍👧‍👦'

  test('a decomposed letter uses the width of the composed one and is not outside', () => {
    expect(standardMeasure.width('é', helv, 12)).toEqual(
      standardMeasure.width('é', helv, 12)
    )
    expect(standardMeasure.width('é', helv, 12).outside).toBe(false)
  })

  test.each(['1\ufe0f\u20e3', '#\ufe0f\u20e3', '*\ufe0f\u20e3', '1\u20e3'])(
    'the keycap %j is outside the tables and measured as one wide character',
    (text) => {
      expect(standardMeasure.width(text, helv, 12)).toEqual({ width: 12, outside: true })
      expect(outsideTables(text)).toBe(true)
      const fallback = vi.fn(() => 9)
      expect(measureWith(fallback).width(`a${text}b`, helv, 12).outside).toBe(true)
      expect(fallback).toHaveBeenCalledWith(text, helv, 12)
    }
  )

  test('a digit with the emoji selector but no keycap is outside the tables too', () => {
    expect(outsideTables('1\ufe0f')).toBe(true)
  })

  test('a digit is still the table digit beside a keycap', () => {
    const digit = standardMeasure.width('1', helv, 12).width
    expect(digit).toBeCloseTo(6.672, 3)
    expect(standardMeasure.width('11\ufe0f\u20e3', helv, 12).width).toBeCloseTo(
      digit + 12,
      9
    )
  })

  test('e and U+0301 fold into the table letter and are not outside', () => {
    expect(standardMeasure.width('e\u0301', helv, 12)).toEqual(
      standardMeasure.width('é', helv, 12)
    )
    expect(outsideTables('e\u0301')).toBe(false)
    // A joiner after a letter adds nothing either.
    expect(outsideTables('a\u200d')).toBe(false)
  })

  test('a mark the tables have no composed form for adds no width', () => {
    expect(standardMeasure.width('x́', helv, 12)).toEqual(
      standardMeasure.width('x', helv, 12)
    )
  })

  test('a joined emoji sequence is one character, measured once by the fallback', () => {
    const fallback = vi.fn(() => 11)
    const m = measureWith(fallback).width(family, helv, 12)
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(fallback).toHaveBeenCalledWith(family, helv, 12)
    expect(m).toEqual({ width: 11, outside: true })
  })

  test('a flag and an emoji with a skin tone are one character each', () => {
    // Clusters outside the tables that follow each other are one run: a flag and a skin tone.
    const fallback = vi.fn((_run: string) => 10)
    measureWith(fallback).width('🇫🇷👋🏽', helv, 12)
    expect(fallback.mock.calls.map((c) => c[0])).toEqual(['🇫🇷👋🏽'])
  })

  test('the standard measure gives a whole family one wide character', () => {
    expect(standardMeasure.width(family, helv, 12)).toEqual({ width: 12, outside: true })
  })

  test('marks, joiners and variation selectors alone have no width', () => {
    expect(standardMeasure.width('́‍️', helv, 12)).toEqual({
      width: 0,
      outside: false,
    })
  })
})
