import { OPS } from '#pdfjs'
import { describe, expect, it } from 'vitest'

import { pageGlyphs } from './glyphs'

import type { PdfjsPage } from './types'

const glyph = (unicode: string, width: number, isSpace = false) => ({
  unicode,
  width,
  isSpace,
})

function page(ops: [number, unknown[] | null][]): PdfjsPage {
  return {
    getOperatorList: () =>
      Promise.resolve({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) }),
  } as unknown as PdfjsPage
}

describe('pageGlyphs', () => {
  it('reads each glyph advance at the current font size', async () => {
    const out = await pageGlyphs(
      page([
        [OPS.setFont, ['f', 10]],
        [OPS.showText, [[glyph('a', 500), glyph('b', 250)]]],
      ]),
      OPS
    )
    expect(out).toEqual([
      { text: 'a', advance: 5, spacing: 0 },
      { text: 'b', advance: 2.5, spacing: 0 },
    ])
  })

  it('adds character spacing to every glyph and word spacing to spaces', async () => {
    const out = await pageGlyphs(
      page([
        [OPS.setFont, ['f', 10]],
        [OPS.setCharSpacing, [1]],
        [OPS.setWordSpacing, [3]],
        [OPS.showText, [[glyph('a', 500), glyph(' ', 250, true)]]],
      ]),
      OPS
    )
    expect(out.map((g) => [g.advance, g.spacing])).toEqual([
      [6, 1],
      [6.5, 4],
    ])
  })

  it('turns a kerning number into a gap with no text', async () => {
    const out = await pageGlyphs(
      page([
        [OPS.setFont, ['f', 10]],
        [OPS.showText, [[glyph('a', 500), -100, glyph('b', 500)]]],
      ]),
      OPS
    )
    expect(out).toEqual([
      { text: 'a', advance: 5, spacing: 0 },
      { text: '', advance: 1 },
      { text: 'b', advance: 5, spacing: 0 },
    ])
  })

  it('restores the font size and spacing saved before a change', async () => {
    const out = await pageGlyphs(
      page([
        [OPS.setFont, ['f', 10]],
        [OPS.save, null],
        [OPS.setFont, ['f', 20]],
        [OPS.setCharSpacing, [1]],
        [OPS.restore, null],
        [OPS.showText, [[glyph('a', 500)]]],
        [OPS.paintFormXObjectBegin, [null, null]],
        [OPS.setFont, ['f', 20]],
        [OPS.paintFormXObjectEnd, null],
        [OPS.showText, [[glyph('b', 500)]]],
      ]),
      OPS
    )
    expect(out.map((g) => g.advance)).toEqual([5, 5])
  })
})
