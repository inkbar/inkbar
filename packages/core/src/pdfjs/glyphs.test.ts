import { AnnotationMode, OPS } from '#pdfjs'
import { describe, expect, it, vi } from 'vitest'

import { pageGlyphs } from './glyphs'

import type { PdfjsModule, PdfjsPage } from './types'

const pdfjs = { OPS, AnnotationMode } as unknown as PdfjsModule
const glyph = (unicode: string, width: number, isSpace = false) => ({
  unicode,
  width,
  isSpace,
})

function page(
  ops: [number, unknown[] | null][],
  fonts: Record<
    string,
    { fontMatrix?: number[]; vertical?: boolean; isType3Font?: boolean }
  > = {}
) {
  const getOperatorList = vi.fn(() =>
    Promise.resolve({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) })
  )
  const p = {
    getOperatorList,
    commonObjs: { get: (name: string) => fonts[name] ?? {} },
  } as unknown as PdfjsPage
  return { p, getOperatorList }
}

/** Each glyph's start and end x, rounded to 3 places. */
const xs = (out: { start: { x: number }; end: { x: number } }[]) =>
  out.map((g) => [+g.start.x.toFixed(3), +g.end.x.toFixed(3)])

describe('pageGlyphs', () => {
  it('places glyphs along the line from the text position, at the font size', async () => {
    const { p, getOperatorList } = page([
      [OPS.beginText, null],
      [OPS.setFont, ['f', 10]],
      [OPS.moveText, [72, 700]],
      [OPS.showText, [[glyph('a', 500), glyph('b', 250)]]],
    ])
    const out = await pageGlyphs(p, pdfjs)
    expect(out.map((g) => g.text)).toEqual(['a', 'b'])
    expect(xs(out)).toEqual([
      [72, 77],
      [77, 79.5],
    ])
    expect(out[0]!.start.y).toBe(700)
    // Annotation appearances draw glyphs that are not page text.
    expect(getOperatorList).toHaveBeenCalledWith({
      annotationMode: AnnotationMode.DISABLE,
    })
  })

  it('moves the pen by character spacing, word spacing on spaces, and kerning', async () => {
    const { p } = page([
      [OPS.beginText, null],
      [OPS.setFont, ['f', 10]],
      [OPS.setCharSpacing, [1]],
      [OPS.setWordSpacing, [3]],
      [OPS.showText, [[glyph('a', 500), glyph(' ', 250, true), -1000, glyph('b', 500)]]],
    ])
    // a: 0..5, then +1; space: 6..8.5, then +1 +3; kerning +10; b at 22.5.
    expect(xs(await pageGlyphs(p, pdfjs))).toEqual([
      [0, 5],
      [6, 8.5],
      [22.5, 27.5],
    ])
  })

  it('follows text moves, text matrices, the line leading and the next run', async () => {
    const { p } = page([
      [OPS.beginText, null],
      [OPS.setFont, ['f', 10]],
      [OPS.setTextMatrix, [[2, 0, 0, 2, 100, 0]]],
      [OPS.showText, [[glyph('a', 500)]]],
      [OPS.moveText, [10, 0]],
      [OPS.showText, [[glyph('b', 500)]]],
      [OPS.showText, [[glyph('c', 500)]]],
      [OPS.setLeadingMoveText, [0, -12]],
      [OPS.nextLine, null],
      [OPS.showText, [[glyph('d', 500)]]],
    ])
    const out = await pageGlyphs(p, pdfjs)
    // The matrix doubles everything: a at 100..110, b at 100 + 2 * 10, c after it.
    expect(xs(out)).toEqual([
      [100, 110],
      [120, 130],
      [130, 140],
      [120, 130],
    ])
    expect(out.map((g) => g.start.y)).toEqual([0, 0, 0, -48])
  })

  it('applies horizontal scaling and the current transformation matrix', async () => {
    const { p } = page([
      [OPS.transform, [1, 0, 0, 1, 50, 0]],
      [OPS.beginText, null],
      [OPS.setFont, ['f', 10]],
      [OPS.setHScale, [50]],
      [OPS.showText, [[glyph('a', 500)]]],
      [OPS.setHScale, [100]],
      [OPS.showText, [[glyph('b', 500)]]],
    ])
    expect(xs(await pageGlyphs(p, pdfjs))).toEqual([
      [50, 52.5],
      [52.5, 57.5],
    ])
  })

  it('scales glyph widths by the font matrix, as for Type3 fonts', async () => {
    const { p } = page(
      [
        [OPS.beginText, null],
        [OPS.setFont, ['t3', 10]],
        [OPS.showText, [[glyph('a', 50), -100, glyph('b', 50)]]],
      ],
      { t3: { fontMatrix: [0.01, 0, 0, 0.01, 0, 0], isType3Font: true } }
    )
    expect(xs(await pageGlyphs(p, pdfjs))).toEqual([
      [0, 5],
      [6, 11],
    ])
  })

  it('takes the font size from a graphics state', async () => {
    const { p } = page([
      [OPS.beginText, null],
      [OPS.setFont, ['f', 20]],
      [OPS.setGState, [[['Font', ['f', 10]]]]],
      [OPS.showText, [[glyph('a', 500)]]],
    ])
    expect(xs(await pageGlyphs(p, pdfjs))).toEqual([[0, 5]])
  })

  it('restores state saved before a change, including around form XObjects', async () => {
    const { p } = page([
      [OPS.beginText, null],
      [OPS.setFont, ['f', 10]],
      [OPS.save, null],
      [OPS.setFont, ['f', 20]],
      [OPS.restore, null],
      [OPS.showText, [[glyph('a', 500)]]],
      [OPS.paintFormXObjectBegin, [[1, 0, 0, 1, 100, 0], null]],
      [OPS.beginText, null],
      [OPS.showText, [[glyph('b', 500)]]],
      [OPS.paintFormXObjectEnd, null],
    ])
    expect(xs(await pageGlyphs(p, pdfjs))).toEqual([
      [0, 5],
      [100, 105],
    ])
  })

  it('leaves out vertical fonts', async () => {
    const { p } = page(
      [
        [OPS.beginText, null],
        [OPS.setFont, ['v', 10]],
        [OPS.showText, [[glyph('a', 500)]]],
      ],
      { v: { vertical: true } }
    )
    expect(await pageGlyphs(p, pdfjs)).toEqual([])
  })
})
