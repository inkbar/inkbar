import { describe, expect, test, vi } from 'vitest'

import { measureWith, outsideTables, resolveFont, standardMeasure } from './measure'

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

  test('an emoji is one wide character, not two UTF-16 units', () => {
    expect(standardMeasure.width('🙂', helv, 12)).toEqual({ width: 12, outside: true })
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
