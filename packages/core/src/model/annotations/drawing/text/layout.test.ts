import { describe, expect, test } from 'vitest'

import { layoutText } from './layout'
import { standardMeasure } from './measure'

import type { TextBlock } from './layout'
import type { TextFont } from '../types'

const helv: TextFont = { family: 'Helvetica', bold: false, italic: false }
const block = (
  text: string,
  width: number,
  extra: Partial<TextBlock> = {}
): TextBlock => ({
  text,
  font: helv,
  size: 12,
  width,
  align: 'left',
  ...extra,
})
const w = (text: string) => standardMeasure.width(text, helv, 12).width

describe('layoutText', () => {
  test('text that fits is one line at the CSS baseline', () => {
    const { lines, height } = layoutText(block('Hello', 144), standardMeasure)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.x).toBe(0)
    expect(lines[0]!.baseline).toBeCloseTo(11.358, 3)
    expect(height).toBeCloseTo(14.4, 6)
  })

  test('it wraps at a space and the space does not count', () => {
    const { lines } = layoutText(block('aaaa aaaa', w('aaaa ') + 1), standardMeasure)
    expect(lines.map((l) => l.text)).toEqual(['aaaa', 'aaaa'])
    expect(lines[0]!.width).toBeCloseTo(w('aaaa'), 6)
    expect(lines[1]!.baseline - lines[0]!.baseline).toBeCloseTo(14.4, 6)
  })

  test('a line that ends exactly at the box width stays', () => {
    const { lines } = layoutText(block('aaaa bbbb', w('aaaa bbbb')), standardMeasure)
    expect(lines).toHaveLength(1)
  })

  test('a newline forces a line and an empty line keeps its height', () => {
    const { lines, height } = layoutText(block('a\n\nb', 144), standardMeasure)
    expect(lines.map((l) => l.text)).toEqual(['a', '', 'b'])
    expect(height).toBeCloseTo(43.2, 6)
  })

  test('a newline at the very end of the text does not start another line', () => {
    expect(
      layoutText(block('a\n', 144), standardMeasure).lines.map((l) => l.text)
    ).toEqual(['a'])
    expect(layoutText(block('\n\n', 144), standardMeasure).lines).toHaveLength(2)
  })

  test('spaces at the start of a line after a newline are kept', () => {
    const { lines } = layoutText(block('a\n  b', 144), standardMeasure)
    expect(lines[1]!.text).toBe('  b')
    expect(lines[1]!.width).toBeCloseTo(w('  b'), 6)
  })

  test('several spaces at a wrap point all hang', () => {
    const { lines } = layoutText(block('aaaa     aaaa', w('aaaa ') + 1), standardMeasure)
    expect(lines.map((l) => l.text)).toEqual(['aaaa', 'aaaa'])
  })

  test('a word wider than the box breaks between characters', () => {
    const { lines } = layoutText(block('abcdefghijklmnopqrstuvwxyz', 40), standardMeasure)
    expect(lines.length).toBeGreaterThan(2)
    expect(lines.every((l) => l.width <= 40 + 1e-6)).toBe(true)
    expect(lines.map((l) => l.text).join('')).toBe('abcdefghijklmnopqrstuvwxyz')
  })

  test('a long word starts on its own line before it breaks', () => {
    const { lines } = layoutText(
      block('ab abcdefghijklmnopqrstuvwxyz', 40),
      standardMeasure
    )
    expect(lines[0]!.text).toBe('ab')
  })

  test('a non-breaking space does not break', () => {
    const { lines } = layoutText(block('aaaa\u00a0aaaa', w('aaaa ') + 1), standardMeasure)
    expect(lines[0]!.text).not.toBe('aaaa')
    expect(lines.map((l) => l.text).join('')).toBe('aaaa\u00a0aaaa')
  })

  test('a zero-width space is a break opportunity', () => {
    const { lines } = layoutText(block('aaaa​aaaa', w('aaaa') + 1), standardMeasure)
    expect(lines).toHaveLength(2)
  })

  test('a hyphen followed by a letter is a break opportunity', () => {
    const { lines } = layoutText(
      block('well-known', w('well-known') - 1),
      standardMeasure
    )
    expect(lines.map((l) => l.text)).toEqual(['well-', 'known'])
  })

  test('a hyphen between digits is a break opportunity too', () => {
    const { lines } = layoutText(block('10-20', w('10-20') - 1), standardMeasure)
    expect(lines.map((l) => l.text)).toEqual(['10-', '20'])
  })

  test('a lone hyphen between spaces is not', () => {
    const { lines } = layoutText(block('a - b', 144), standardMeasure)
    expect(lines).toHaveLength(1)
  })

  test('a line within a 64th of a point past the box still fits', () => {
    expect(
      layoutText(block('aaaa', w('aaaa') - 0.015), standardMeasure).lines
    ).toHaveLength(1)
    expect(
      layoutText(block('aaaa', w('aaaa') - 0.1), standardMeasure).lines.length
    ).toBeGreaterThan(1)
  })

  test('a tab advances to the next multiple of eight spaces', () => {
    const tab = 8 * w(' ')
    const { lines } = layoutText(block('a\tb', 200), standardMeasure)
    expect(lines[0]!.width).toBeCloseTo(tab + w('b'), 6)
  })

  test('centre and right alignment move x', () => {
    const c = layoutText(block('Hello', 100, { align: 'center' }), standardMeasure)
      .lines[0]!
    expect(c.x).toBeCloseTo((100 - w('Hello')) / 2, 6)
    const r = layoutText(block('Hello', 100, { align: 'right' }), standardMeasure)
      .lines[0]!
    expect(r.x).toBeCloseTo(100 - w('Hello'), 6)
  })

  test('justify spreads a wrapped line and leaves the last line alone', () => {
    const width = w('aaaa bbbb ') + 10
    const { lines } = layoutText(
      block('aaaa bbbb cccc dddd', width, { align: 'justify' }),
      standardMeasure
    )
    expect(lines.length).toBeGreaterThan(1)
    const first = lines[0]!
    expect(first.wordSpacing).toBeDefined()
    expect(first.width + first.wordSpacing! * 1).toBeCloseTo(width, 6)
    expect(lines.at(-1)!.wordSpacing).toBeUndefined()
  })

  test('justify leaves the last line before a newline alone', () => {
    const { lines } = layoutText(
      block('aaaa bbbb\ncccc', 200, { align: 'justify' }),
      standardMeasure
    )
    expect(lines.every((l) => l.wordSpacing === undefined)).toBe(true)
  })

  test.each(['', '\n\n', 'trailing   ', 'x'.repeat(5000), 'a\r\nb', '   '])(
    'layout of %j terminates within the width',
    (text) => {
      const { lines, height } = layoutText(block(text, 50), standardMeasure)
      expect(lines.every((l) => l.width <= 50 + 1e-6)).toBe(true)
      expect(lines.length).toBeGreaterThan(0)
      expect(height).toBeCloseTo(lines.length * 14.4, 6)
    }
  )

  test('empty text is one empty line', () => {
    const r = layoutText(block('', 50), standardMeasure)
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]).toMatchObject({ text: '', width: 0 })
  })

  test('a box narrower than one character still terminates', () => {
    const { lines } = layoutText(block('abc', 1), standardMeasure)
    expect(lines.map((l) => l.text)).toEqual(['a', 'b', 'c'])
  })

  test('a line mixing standard and other characters wraps and is flagged', () => {
    const r = layoutText(block('Total: 42 €, 日本語 ok 🙂', 80), standardMeasure)
    expect(r.outside).toBe(true)
    expect(r.lines.length).toBeGreaterThan(1)
  })

  test('text in the tables is not flagged', () => {
    expect(layoutText(block('Total: 42 €', 80), standardMeasure).outside).toBe(false)
  })

  test('Times and Courier take their own vertical metrics', () => {
    const t = layoutText(
      block('x', 100, { font: { ...helv, family: 'Times' } }),
      standardMeasure
    )
    expect(t.lines[0]!.baseline).toBeCloseTo((14.4 - 1.107 * 12) / 2 + 0.891 * 12, 3)
  })
})

describe('layoutText: break opportunities', () => {
  const broken = (text: string, width: number) =>
    layoutText(block(text, width), standardMeasure).lines.map((l) => l.text)

  test('it breaks after an en dash and around an em dash', () => {
    expect(broken('1990–2000', w('1990–2000') - 1)).toEqual(['1990–', '2000'])
    expect(broken('word—word', w('word—word') - 1)).toEqual(['word—', 'word'])
  })

  test('it breaks after a question mark before a letter, but not after a slash or an exclamation mark', () => {
    expect(broken('page?query', w('page?query') - 1)).toEqual(['page?', 'query'])
    expect(broken('and/or', w('and/or') - 1).length).toBeGreaterThan(1)
    expect(broken('and/or', w('and/or') - 1)[0]).not.toBe('and/')
    expect(broken('end!and', w('end!and') - 1)[0]).not.toBe('end!')
  })

  test('Latin text and CJK text may break where they meet', () => {
    expect(broken('Hello世界', w('Hello') + 1)).toEqual(['Hello', '世界'])
  })

  test('closing punctuation never starts a line and opening never ends one', () => {
    const lines = broken('日本語。日本語、日本語「日本語」', 40)
    for (const l of lines) expect(l[0]).not.toMatch(/[。、」]/)
    for (const l of lines.slice(0, -1)) expect(l.at(-1)).not.toBe('「')
  })

  test('a flag, a skin tone and a family emoji stay whole', () => {
    const family = '👨‍👩‍👧'
    expect(broken('🇫🇷🇩🇪', 1)).toEqual(['🇫🇷', '🇩🇪'])
    expect(broken('👋🏽👍🏻', 1)).toEqual(['👋🏽', '👍🏻'])
    expect(broken(family + family, 1)).toEqual([family, family])
  })

  test('a decomposed letter is laid out as the composed one', () => {
    expect(broken('Café', 100)).toEqual(['Café'])
  })
})

describe('layoutText: tabs and long text', () => {
  test('a line with a tab gets segments placed at the tab stops', () => {
    const tab = 8 * w(' ')
    const { lines } = layoutText(block('a\tb', 200), standardMeasure)
    expect(lines[0]!.segments).toEqual([
      { text: 'a', x: 0 },
      { text: 'b', x: tab },
    ])
  })

  test('segments follow the line when it is aligned', () => {
    const { lines } = layoutText(block('a\tb', 200, { align: 'right' }), standardMeasure)
    expect(lines[0]!.segments![0]!.x).toBeCloseTo(lines[0]!.x, 6)
    expect(lines[0]!.segments![1]!.x).toBeCloseTo(lines[0]!.x + 8 * w(' '), 6)
  })

  test('a line without a tab has no segments', () => {
    expect(
      layoutText(block('ab', 100), standardMeasure).lines[0]!.segments
    ).toBeUndefined()
  })

  test('an unbroken string of 100,000 characters lays out in under a second', () => {
    const start = performance.now()
    const { lines } = layoutText(block('x'.repeat(100_000), 50), standardMeasure)
    expect(performance.now() - start).toBeLessThan(1000)
    expect(lines.every((l) => l.width <= 50 + 1e-6)).toBe(true)
    expect(lines.map((l) => l.text).join('')).toBe('x'.repeat(100_000))
  })
})
