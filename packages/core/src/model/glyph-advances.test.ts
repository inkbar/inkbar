import { describe, expect, it } from 'vitest'

import { glyphAdvances, type PageGlyph } from './glyph-advances'

const ltr = (str: string) => ({ str, dir: 'ltr' as const })
const g = (text: string, advance: number): PageGlyph => ({ text, advance })

describe('glyphAdvances', () => {
  it('turns glyph widths into boundaries along the run', () => {
    const [a] = glyphAdvances([ltr('iW')], [g('i', 1), g('W', 4)])
    expect(a).toEqual([0, 0.2, 1])
  })

  it('splits one glyph stream over the items it produced', () => {
    const out = glyphAdvances(
      [ltr('ab'), ltr('cd')],
      [g('a', 1), g('b', 3), g('c', 2), g('d', 2)]
    )
    expect(out).toEqual([
      [0, 0.25, 1],
      [0, 0.5, 1],
    ])
  })

  it('puts a kerning gap between the characters it separates', () => {
    // A TJ adjustment arrives as a glyph with no text.
    const [a] = glyphAdvances([ltr('abc')], [g('a', 1), g('', 1), g('b', 1), g('c', 1)])
    expect(a).toEqual([0, 0.5, 0.75, 1])
  })

  it('drops a gap at the end of an item', () => {
    const out = glyphAdvances(
      [ltr('ab'), ltr('c')],
      [g('a', 1), g('b', 1), g('', 5), g('c', 1)]
    )
    expect(out[0]).toEqual([0, 0.5, 1])
    expect(out[1]).toEqual([0, 1])
  })

  it('gives a space PDF.js inserted the gap it stands for', () => {
    const [a] = glyphAdvances([ltr('a b')], [g('a', 1), g('', 2), g('b', 1)])
    expect(a).toEqual([0, 0.25, 0.75, 1])
  })

  it('counts a space glyph that the item leaves out as part of the gap', () => {
    const [a] = glyphAdvances([ltr('ab')], [g('a', 1), g(' ', 2), g('b', 1)])
    expect(a).toEqual([0, 0.75, 1])
  })

  it('shares a ligature glyph between the letters it expands to', () => {
    const [a] = glyphAdvances([ltr('fit')], [g('ﬁ', 2), g('t', 2)])
    expect(a).toEqual([0, 0.25, 0.5, 1])
  })

  it('skips glyphs no item uses before finding the next item', () => {
    const [a] = glyphAdvances([ltr('cd')], [g('x', 9), g('c', 1), g('d', 1)])
    expect(a).toEqual([0, 0.5, 1])
  })

  it('leaves out an item it cannot match, and carries on with the next', () => {
    const out = glyphAdvances([ltr('zz'), ltr('ab')], [g('a', 1), g('b', 1)])
    expect(out[0]).toBeUndefined()
    expect(out[1]).toEqual([0, 0.5, 1])
  })

  it('leaves out right-to-left and vertical runs and empty items', () => {
    const out = glyphAdvances(
      [{ str: 'ab', dir: 'rtl' }, { str: 'ab', dir: 'ttb' }, ltr('')],
      [g('a', 1), g('b', 1)]
    )
    expect(out).toEqual([undefined, undefined, undefined])
  })

  it('ends the run before the last glyph spacing, as PDF.js does', () => {
    const [a] = glyphAdvances(
      [ltr('ab')],
      [
        { text: 'a', advance: 2, spacing: 1 },
        { text: 'b', advance: 3, spacing: 1 },
      ]
    )
    expect(a).toEqual([0, 0.5, 1])
  })

  it('leaves out an item whose glyphs have no width', () => {
    expect(glyphAdvances([ltr('ab')], [g('a', 0), g('b', 0)])[0]).toBeUndefined()
  })
})
