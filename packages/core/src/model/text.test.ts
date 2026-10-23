import { fixtureBytes } from '@inkbar/fixtures'
import { describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'

import { openDocument } from './document'
import { textContentFromPdfjs } from './text'

describe('text content', () => {
  it('converts PDF.js items into user-space quads', async () => {
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const tc = await doc.text(0)
    expect(tc.page).toBe(0)
    const ni = tc.items.find((i) => i.str.includes('QQ123456C'))
    expect(ni).toBeDefined()
    // The fixture draws line 2 of page 1 at baseline y = 700 - 2 * 24 = 652, x = 72, Helvetica 14.
    // PDF.js reports Helvetica's ascent 0.9053 and descent -0.2119 in `styles`.
    expect(ni!.fontSize).toBe(14)
    expect(ni!.rect.x).toBe(72)
    expect(ni!.quad.p3.x).toBe(72)
    expect(ni!.rect.y).toBeCloseTo(652 - 14 * 0.2119, 2)
    expect(ni!.rect.height).toBeCloseTo(14 * (0.9053 + 0.2119), 2)
    expect(Math.abs(ni!.rect.width - 340.34)).toBeLessThanOrEqual(1)
    expect(ni!.quad.p3.y).toBeCloseTo(ni!.rect.y, 6)
    expect(ni!.quad.p1.y).toBeCloseTo(ni!.rect.y + ni!.rect.height, 6)
    doc.destroy()
  })

  it('handles rotated text matrices', () => {
    // A run rotated 90° counter-clockwise: transform = [0, 12, -12, 0, 100, 200], width 50.
    // Baseline direction u = (a, b) / |(a, b)| = (0, 1); glyph-up direction v = (c, d) / |(c, d)| = (-1, 0);
    // font size = |(c, d)| = 12. With no style metrics the box spans 0.25 * 12 = 3 below the
    // baseline and 0.75 * 12 = 9 above it, so along x it covers 100 + 3 down to 100 - 9 = 91,
    // and along y it covers the advance width 200 .. 250.
    const tc = textContentFromPdfjs(0, {
      items: [
        {
          str: 'up',
          dir: 'ltr',
          transform: [0, 12, -12, 0, 100, 200],
          width: 50,
          height: 12,
          fontName: 'f',
          hasEOL: false,
        },
      ],
      styles: {},
    } as never)
    const item = tc.items[0]!
    expect(item.fontSize).toBe(12)
    expect(item.quad.p3).toEqual({ x: 103, y: 200 })
    expect(item.quad.p4).toEqual({ x: 103, y: 250 })
    expect(item.quad.p1).toEqual({ x: 91, y: 200 })
    expect(item.quad.p2).toEqual({ x: 91, y: 250 })
    expect(item.rect).toEqual({ x: 91, y: 200, width: 12, height: 50 })
  })

  it('records glyph advances for left-to-right runs that can be measured', () => {
    const run = (str: string, dir: string) => ({
      str,
      dir,
      transform: [12, 0, 0, 12, 0, 0],
      width: 40,
      height: 12,
      fontName: 'f',
      hasEOL: false,
    })
    const widths: Record<string, number> = { i: 1, W: 4 }
    const tc = textContentFromPdfjs(
      0,
      {
        items: [run('iiWW', 'ltr'), run('iW', 'rtl'), run('iW', 'ttb')],
        styles: {
          f: { fontFamily: 'sans-serif', ascent: 0.75, descent: -0.25, vertical: false },
        },
      } as never,
      (char, family) => (family === 'sans-serif' ? widths[char]! : 0)
    )
    expect(tc.items[0]!.advances).toEqual([0, 0.1, 0.2, 0.6, 1])
    expect(tc.items[1]!.advances).toBeUndefined()
    expect(tc.items[2]!.advances).toBeUndefined()
  })

  it('prefers where the page draws the glyphs over measuring them', () => {
    const measure = vi.fn(() => 1)
    const tc = textContentFromPdfjs(
      0,
      {
        items: [
          {
            str: 'iW',
            dir: 'ltr',
            transform: [12, 0, 0, 12, 100, 200],
            width: 10,
            height: 12,
            fontName: 'f',
            hasEOL: false,
          },
        ],
        styles: {},
      } as never,
      measure,
      [
        { text: 'i', start: { x: 100, y: 200 }, end: { x: 102, y: 200 } },
        { text: 'W', start: { x: 102, y: 200 }, end: { x: 110, y: 200 } },
      ]
    )
    expect(tc.items[0]!.advances).toEqual([0, 0.2, 1])
    expect(measure).not.toHaveBeenCalled()
  })

  it('records no advances without a measurer or when nothing measures', () => {
    const tc = (measure?: (c: string, f: string) => number) =>
      textContentFromPdfjs(
        0,
        {
          items: [
            {
              str: 'ab',
              dir: 'ltr',
              transform: [12, 0, 0, 12, 0, 0],
              width: 20,
              height: 12,
              fontName: 'f',
              hasEOL: false,
            },
          ],
          styles: {},
        } as never,
        measure
      ).items[0]!
    expect(tc().advances).toBeUndefined()
    expect(tc(() => 0).advances).toBeUndefined()
  })

  it('skips marked-content items', () => {
    const tc = textContentFromPdfjs(0, {
      items: [{ type: 'beginMarkedContent', id: 'mc0' }],
      styles: {},
    } as never)
    expect(tc.items).toEqual([])
  })
})
