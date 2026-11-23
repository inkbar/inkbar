import { describe, expect, it } from 'vitest'

import { textContentFromPdfjs } from './text-items'

import type { PageGlyph } from '../model/glyph-advances'

/** A PDF.js item for a vertical font: `width` holds one em, `height` the column's length. */
const verticalItem = (
  str: string,
  transform: number[],
  height: number,
  extra: { dir?: string; width?: number } = {}
) => ({
  str,
  dir: extra.dir ?? 'ttb',
  transform,
  width: extra.width ?? Math.hypot(transform[0]!, transform[1]!),
  height,
  fontName: 'v',
  hasEOL: false,
})

const styles = {
  v: { fontFamily: 'monospace', ascent: 0.88, descent: -0.12, vertical: true },
}

const read = (items: unknown[], glyphs?: PageGlyph[]) =>
  textContentFromPdfjs(0, { items, styles } as never, undefined, glyphs).items

describe('vertical text items', () => {
  // The column starts at the vertical origin, the top centre of the first glyph, and runs down
  // the page for `height`; it is one em wide, centred on the origin.
  it('covers the column of an upright vertical run', () => {
    const [item] = read([verticalItem('日本語のテキスト', [28, 0, 0, 28, 400, 760], 224)])
    expect(item!.dir).toBe('ttb')
    expect(item!.fontSize).toBe(28)
    expect(item!.quad).toEqual({
      p1: { x: 414, y: 760 },
      p2: { x: 414, y: 536 },
      p3: { x: 386, y: 760 },
      p4: { x: 386, y: 536 },
    })
    expect(item!.rect).toEqual({ x: 386, y: 536, width: 28, height: 224 })
  })

  it('follows a text matrix turned a quarter turn anticlockwise', () => {
    // The glyphs' up, (c, d), points along -x, so the column runs along +x from the origin.
    const [item] = read([verticalItem('ab', [0, 10, -10, 0, 100, 200], 20)])
    expect(item!.fontSize).toBe(10)
    expect(item!.quad).toEqual({
      p1: { x: 100, y: 205 },
      p2: { x: 120, y: 205 },
      p3: { x: 100, y: 195 },
      p4: { x: 120, y: 195 },
    })
    expect(item!.rect).toEqual({ x: 100, y: 195, width: 20, height: 10 })
  })

  it('takes the column across one em of the matrix, scaled as PDF.js scales it', () => {
    // Horizontal scaling of 50% narrows the column; the length is PDF.js's height.
    const [item] = read([verticalItem('ab', [6, 0, 0, 12, 50, 300], 24)])
    expect(item!.fontSize).toBe(12)
    expect(item!.rect).toEqual({ x: 47, y: 276, width: 6, height: 24 })
  })

  it('lays a space PDF.js adds inside a vertical run down the column too', () => {
    // PDF.js gives such a space `dir` ltr, no width and the gap as its height.
    const [space] = read([
      verticalItem(' ', [16, 0, 0, 16, 100, 260], 8, { dir: 'ltr', width: 0 }),
    ])
    expect(space!.dir).toBe('ttb')
    expect(space!.rect).toEqual({ x: 92, y: 252, width: 16, height: 8 })
  })

  it('keeps a space PDF.js adds where a vertical run gives way to horizontal text horizontal', () => {
    // PDF.js names it with the vertical font but gives the gap in its width, along the baseline.
    const [space] = read([
      verticalItem(' ', [16, 0, 0, 16, 100, 260], 0, { dir: 'ltr', width: 30 }),
    ])
    expect(space!.dir).toBe('ltr')
    // The fallback box: 0.25 em below the baseline, 0.75 above.
    expect(space!.rect).toEqual({ x: 100, y: 256, width: 30, height: 16 })
  })

  it('runs up the column at a negative font size, as PDF.js draws it', () => {
    const glyphs: PageGlyph[] = [
      { text: 'a', start: { x: 100, y: 280 }, end: { x: 100, y: 296 } },
      { text: 'b', start: { x: 100, y: 296 }, end: { x: 100, y: 312 } },
    ]
    const [item] = read([verticalItem('ab', [-16, 0, 0, -16, 100, 280], 32)], glyphs)
    expect(item!.quad).toEqual({
      p1: { x: 92, y: 280 },
      p2: { x: 92, y: 312 },
      p3: { x: 108, y: 280 },
      p4: { x: 108, y: 312 },
    })
    expect(item!.advances).toEqual([0, 0.5, 1])
  })

  it('takes each character boundary from where the page draws the glyph', () => {
    // Two glyphs down from y 200: the first advances 10, the second 6.
    const glyphs: PageGlyph[] = [
      { text: 'a', start: { x: 100, y: 200 }, end: { x: 100, y: 190 } },
      { text: 'b', start: { x: 100, y: 190 }, end: { x: 100, y: 184 } },
    ]
    const [item] = read([verticalItem('ab', [10, 0, 0, 10, 100, 200], 16)], glyphs)
    expect(item!.advances).toEqual([0, 0.625, 1])
    expect(item!.glyphEnds).toEqual([0.625, 1])
  })

  it('gives no advances without the glyphs, so each character takes an equal share', () => {
    const [item] = read([verticalItem('ab', [10, 0, 0, 10, 100, 200], 16)])
    expect(item!.advances).toBeUndefined()
  })
})
