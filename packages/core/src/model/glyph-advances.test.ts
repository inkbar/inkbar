import { describe, expect, it } from 'vitest'

import { glyphAdvances, type PageGlyph, type TextRun } from './glyph-advances'

const advances = (...args: Parameters<typeof glyphAdvances>) =>
  glyphAdvances(...args).map((b) => b?.advances)

/** A run on the baseline `y` starting at `x`. */
function run(
  str: string,
  x: number,
  width: number,
  opts: { dir?: TextRun['dir']; y?: number } = {}
): TextRun {
  return {
    str,
    dir: opts.dir ?? 'ltr',
    origin: { x, y: opts.y ?? 100 },
    along: { x: 1, y: 0 },
    width,
    fontSize: 10,
  }
}

/** A glyph on the baseline `y` from `x0` to `x1`. */
const g = (text: string, x0: number, x1: number, y = 100): PageGlyph => ({
  text,
  start: { x: x0, y },
  end: { x: x1, y },
})

describe('glyphAdvances', () => {
  it('puts each boundary where the next glyph starts and ends at the last glyph', () => {
    const [a] = advances([run('iW', 0, 10)], [g('i', 0, 2), g('W', 2, 10)])
    expect(a).toEqual([0, 0.2, 1])
  })

  it('splits one glyph stream over the items it produced', () => {
    const out = advances(
      [run('ab', 0, 4), run('cd', 10, 4)],
      [g('a', 0, 1), g('b', 1, 4), g('c', 10, 12), g('d', 12, 14)]
    )
    expect(out).toEqual([
      [0, 0.25, 1],
      [0, 0.5, 1],
    ])
  })

  it('follows the pen when the page moves it between glyphs of one item', () => {
    // "Hello" then a Td to x = 40 for "World": PDF.js joins them with a space.
    const glyphs = [...'Hello'].map((c, i) => g(c, i * 5, i * 5 + 5))
    glyphs.push(...[...'World'].map((c, i) => g(c, 40 + i * 5, 45 + i * 5)))
    const [a] = advances([run('Hello World', 0, 65)], glyphs)
    // The inserted space runs from the end of "o" to the start of "W".
    expect([a![5]! * 65, a![6]! * 65, a![11]! * 65]).toEqual([25, 40, 65])
  })

  it('keeps glyph positions when the item width PDF.js reports is short', () => {
    const [a] = advances([run('ab', 0, 5)], [g('a', 0, 5), g('b', 5, 10)])
    expect(a).toEqual([0, 1, 2])
  })

  it('keeps where each glyph ends when kerning pulls the next one back over it', () => {
    const [b] = glyphAdvances([run('To', 0, 10)], [g('T', 0, 6), g('o', 5, 10)])
    expect(b).toEqual({ advances: [0, 0.5, 1], ends: [0.6, 1] })
  })

  it('shares a ligature glyph between the letters it expands to', () => {
    const [a] = advances([run('fit', 0, 4)], [g('ﬁ', 0, 2), g('t', 2, 4)])
    expect(a).toEqual([0, 0.25, 0.5, 1])
  })

  it('skips space and invisible glyphs the item leaves out', () => {
    const [a] = advances(
      [run('ab', 0, 4)],
      [g('a', 0, 1), g(' ', 1, 2), g('﻿', 2, 2), g('b', 3, 4)]
    )
    expect(a).toEqual([0, 0.75, 1])
  })

  it('matches only glyphs that start where the item starts', () => {
    // "Wi" drawn on two lines in fonts of different widths; the item is the second line.
    const [a] = advances(
      [run('Wi', 0, 10, { y: 50 })],
      [g('W', 0, 8), g('i', 8, 10), g('W', 0, 6, 50), g('i', 6, 10, 50)]
    )
    expect(a).toEqual([0, 0.6, 1])
  })

  it('does not let a run of spaces move the search past later items', () => {
    const out = advances(
      [run(' ', 4, 2), run('ab', 0, 2)],
      [g('a', 0, 1), g('b', 1, 2), g(' ', 4, 6)]
    )
    expect(out).toEqual([undefined, [0, 0.5, 1]])
  })

  it('leaves out an item it cannot match, and carries on with the next', () => {
    const out = advances([run('zz', 0, 2), run('ab', 0, 2)], [g('a', 0, 1), g('b', 1, 2)])
    expect(out[0]).toBeUndefined()
    expect(out[1]).toEqual([0, 0.5, 1])
  })

  it('leaves out right-to-left and vertical runs, empty items and zero widths', () => {
    const out = advances(
      [
        run('ab', 0, 2, { dir: 'rtl' }),
        run('ab', 0, 2, { dir: 'ttb' }),
        run('', 0, 2),
        run('ab', 0, 0),
      ],
      [g('a', 0, 1), g('b', 1, 2)]
    )
    expect(out).toEqual([undefined, undefined, undefined, undefined])
  })
})
