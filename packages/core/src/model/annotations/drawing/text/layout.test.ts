import { describe, expect, test } from 'vitest'

import { layoutText } from './layout'
import { measureWith, standardMeasure } from './measure'

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

describe('layoutText: alignment around hanging spaces', () => {
  test('spaces before a newline count when centring', () => {
    const { lines } = layoutText(
      block('ab   \nc', 100, { align: 'center' }),
      standardMeasure
    )
    expect(lines[0]!.x).toBeCloseTo((100 - w('ab   ')) / 2, 6)
    expect(lines[0]!.width).toBeCloseTo(w('ab'), 6)
  })

  test('spaces at the end of the text count when aligning right', () => {
    const { lines } = layoutText(block('ab  ', 100, { align: 'right' }), standardMeasure)
    expect(lines[0]!.x).toBeCloseTo(100 - w('ab  '), 6)
  })

  test('spaces at a wrap hang and do not count', () => {
    const { lines } = layoutText(
      block('aaaa bbbb', w('aaaa ') + 1, { align: 'right' }),
      standardMeasure
    )
    expect(lines[0]!.x).toBeCloseTo(w('aaaa ') + 1 - w('aaaa'), 6)
  })

  test('spaces wider than the box are clipped to it', () => {
    const { lines } = layoutText(
      block('a' + ' '.repeat(100), 50, { align: 'right' }),
      standardMeasure
    )
    expect(lines[0]!.x).toBe(0)
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

describe('layoutText: Courier follows the screen fonts', () => {
  const courier: TextFont = { family: 'Courier', bold: false, italic: false }

  test('24 Courier characters at 10 pt do not fit a 144 pt box, so the line wraps after 23', () => {
    const text = 'abcdefghijklmnopqrstuvwx'
    expect(standardMeasure.width(text, courier, 10).width).toBeGreaterThan(144)
    expect(standardMeasure.width(text, courier, 10).width).toBeCloseTo(144.0234375, 6)
    const { lines } = layoutText(
      { text, font: courier, size: 10, width: 144, align: 'left' },
      standardMeasure
    )
    expect(lines.map((l) => l.text)).toEqual([text.slice(0, 23), text.slice(23)])
  })
})

describe('layoutText: segments', () => {
  const tab = 8 * w(' ')
  /** A measure that gives a joined emoji one width whatever its code points would sum to. */
  const emojiMeasure = {
    width: (text: string, font: TextFont, size: number) => {
      const m = standardMeasure.width(
        text.replace(/👨\u200d👩\u200d👧/gu, 'W'),
        font,
        size
      )
      return m
    },
    vertical: (font: TextFont) => standardMeasure.vertical(font),
  }

  test('a cluster before a tab is measured as one character', () => {
    const family = '👨\u200d👩\u200d👧'
    const { lines } = layoutText(block(`${family}\tb`, 400), emojiMeasure)
    expect(lines[0]!.segments).toEqual([
      { text: family, x: 0 },
      { text: 'b', x: tab },
    ])
    const after = layoutText(block(`${family}x\ty`, 400), emojiMeasure).lines[0]!
      .segments!
    expect(after[1]!.x).toBe(tab)
  })

  test('spaces in a justified line with a tab add the word spacing to where the next tab stop falls', () => {
    const text = 'aa bb cc\tdd ' + 'x'.repeat(40)
    const { lines } = layoutText(block(text, 120, { align: 'justify' }), standardMeasure)
    const line = lines[0]!
    expect(line.text.startsWith('aa bb cc\tdd')).toBe(true)
    const spacing = line.wordSpacing!
    expect(spacing).toBeGreaterThan(5)
    const end = w('aa bb cc') + 2 * spacing
    expect(end).toBeGreaterThan(tab)
    const stop = (Math.floor(end / tab + 1e-9) + 1) * tab
    expect(line.segments![1]!.x).toBeCloseTo(stop, 6)
  })
})

describe('layoutText: the iteration mark and the wave dash', () => {
  test('neither starts a line, as in Chrome', () => {
    const lines = layoutText(
      block('人々時々国々〜東京〜大阪〜', 36),
      standardMeasure
    ).lines
    for (const l of lines) expect(l.text[0]).not.toMatch(/[々〜]/)
  })
})

describe('layoutText with runs outside the tables', () => {
  test('a line says whether it has a character outside the tables', () => {
    const { lines } = layoutText(block('abc\nمرحبا\nabc 日', 144), standardMeasure)
    expect(lines.map((l) => l.outside)).toEqual([false, true, true])
  })

  test('a word of an unjoined script is measured once as a run, then wrapped by it', () => {
    // A measure that charges 5 per character for a run but 3 for each in a run of one: a
    // shaped run is not the sum of its parts.
    const calls: string[] = []
    const measure = measureWith((run, _font, size) => {
      calls.push(run)
      return run.length === 1 ? size : run.length * 4
    })
    const { lines } = layoutText(block('مرحبا بالعالم', 30), measure)
    expect(lines.map((l) => l.text)).toEqual(['مرحبا', 'بالعالم'])
    expect(calls).toContain('مرحبا')
    expect(calls).toContain('بالعالم')
  })

  test('100,000 characters outside the tables lay out in under a second', () => {
    const measure = measureWith((run, _font, size) => (run.length * size) / 2)
    const start = performance.now()
    const { lines } = layoutText(block('ж'.repeat(100_000), 50), measure)
    expect(performance.now() - start).toBeLessThan(1000)
    expect(lines.map((l) => l.text).join('')).toBe('ж'.repeat(100_000))
  })

  test('the pieces of a tab line are placed by the widths the layout measured them at', () => {
    // A shaped run of five is 20 wide, though its letters apart would be 60.
    const measure = measureWith((run, _font, size) =>
      run.length === 1 ? size : run.length * 4
    )
    const { lines } = layoutText(block('مرحبا\tبالعالم', 300), measure)
    const [line] = lines
    const [first, second] = line!.segments!
    expect(first!.x).toBe(0)
    // The next tab stop after 20 is 8 space widths (26.688), not the 80.06 that 60 would give.
    expect(second!.x).toBeCloseTo(8 * w(' '), 3)
    expect(line!.outside).toBe(true)
  })

  test('word spacing in a piece moves the pieces after it', () => {
    const { lines } = layoutText(
      block('a b\tc d e f g h i j k l m n o p q r s t u v', 60, { align: 'justify' }),
      standardMeasure
    )
    const tabbed = lines.find((l) => l.segments && l.wordSpacing)
    expect(tabbed).toBeDefined()
    const [a, b] = tabbed!.segments!
    expect(b!.x).toBeGreaterThanOrEqual(a!.x + w(a!.text) + tabbed!.wordSpacing!)
  })
})
