import { describe, expect, it } from 'vitest'

import { normalizeQuery, searchableText } from './search-text'

import type { TextContent, TextItem } from './text'

const SIZE = 10

/** A horizontal item on the baseline at `y`, starting at `x`, `width` wide. */
function item(
  str: string,
  x: number,
  width: number,
  opts: Partial<Pick<TextItem, 'hasEOL' | 'dir'>> & { y?: number } = {}
): TextItem {
  const y = opts.y ?? 100
  const quad = {
    p1: { x, y: y + SIZE },
    p2: { x: x + width, y: y + SIZE },
    p3: { x, y },
    p4: { x: x + width, y },
  }
  return {
    str,
    dir: opts.dir ?? 'ltr',
    fontName: 'f',
    fontSize: SIZE,
    hasEOL: opts.hasEOL ?? false,
    quad,
    rect: { x, y, width, height: SIZE },
  }
}

const content = (...items: TextItem[]): TextContent => ({ page: 0, items })

describe('searchableText', () => {
  it('joins touching items with nothing between them', () => {
    const t = searchableText(content(item('Inv', 0, 15), item('oice', 15, 20)))
    expect(t.raw).toBe('Invoice')
    expect(t.norm).toBe('Invoice')
  })

  it('inserts a space where the gap exceeds a fraction of the font size', () => {
    const t = searchableText(content(item('one', 0, 15), item('two', 20, 15)))
    expect(t.raw).toBe('one two')
    expect(Array.from(t.rawToItem)).toEqual([0, 0, 0, -1, 1, 1, 1])
    expect(t.rawToOffset[3]).toBe(-1)
  })

  it('leaves a small gap alone', () => {
    const t = searchableText(content(item('one', 0, 15), item('two', 16, 15)))
    expect(t.raw).toBe('onetwo')
  })

  it('does not double a space the items already carry', () => {
    const a = searchableText(content(item('one ', 0, 20), item('two', 30, 15)))
    expect(a.raw).toBe('one two')
    const b = searchableText(content(item('one', 0, 15), item(' two', 30, 20)))
    expect(b.raw).toBe('one two')
  })

  it('puts a space after an item with hasEOL', () => {
    const t = searchableText(
      content(item('one', 0, 15, { hasEOL: true }), item('two', 0, 15, { y: 88 }))
    )
    expect(t.raw).toBe('one two')
  })

  it('puts a space before an item on another baseline, even with no gap or hasEOL', () => {
    const t = searchableText(content(item('one', 0, 15), item('two', 15, 15, { y: 88 })))
    expect(t.raw).toBe('one two')
    expect(t.rawToItem[3]).toBe(-1)
  })

  it('joins a hyphenated line break in norm and keeps it in raw', () => {
    const t = searchableText(
      content(item('docu-', 0, 25, { hasEOL: true }), item('ment', 0, 20, { y: 88 }))
    )
    expect(t.raw).toBe('docu- ment')
    expect(t.norm).toBe('document')
  })

  it('joins a line break after U+2010 or a soft hyphen, not after an en dash', () => {
    const at = (end: string) =>
      searchableText(
        content(
          item(`docu${end}`, 0, 25, { hasEOL: true }),
          item('ment', 0, 20, { y: 88 })
        )
      ).norm
    expect(at('\u2010')).toBe('document')
    expect(at('\u2011')).toBe('document')
    expect(at('\u00ad')).toBe('document')
    expect(at('\u2013')).toBe('docu- ment')
    expect(at('\u2014')).toBe('docu- ment')
  })

  it('keeps a hyphen that is not followed by a line break', () => {
    const t = searchableText(content(item('a-b', 0, 15)))
    expect(t.norm).toBe('a-b')
  })

  it('expands ligatures and strips accents', () => {
    expect(searchableText(content(item('ﬁle', 0, 15))).norm).toBe('file')
    expect(searchableText(content(item('café', 0, 20))).norm).toBe('cafe')
  })

  it('folds curly quotes and dashes', () => {
    expect(searchableText(content(item('“x” ‘y’', 0, 30))).norm).toBe('"x" \'y\'')
    expect(searchableText(content(item('a–b—c', 0, 30))).norm).toBe('a-b-c')
  })

  it('collapses whitespace runs', () => {
    expect(searchableText(content(item('a  \t b', 0, 30))).norm).toBe('a b')
  })

  it('maps every norm char back to a raw char of the same item', () => {
    const t = searchableText(
      content(
        item('café', 0, 20),
        item('ﬁle', 30, 15, { hasEOL: true }),
        item('docu-', 0, 25, { hasEOL: true, y: 88 }),
        item('ment', 0, 20, { y: 76 })
      )
    )
    expect(t.normToRaw).toHaveLength(t.norm.length + 1)
    expect(t.normToRaw[t.norm.length]).toBe(t.raw.length)
    for (let i = 0; i < t.norm.length; i++) {
      const r = t.normToRaw[i]!
      const idx = t.rawToItem[r]!
      if (t.norm[i] === ' ') continue
      expect(idx).toBeGreaterThanOrEqual(0)
      const s = t.content.items[idx]!.str
      expect(t.rawToOffset[r]).toBeLessThan(s.length)
      expect(s[t.rawToOffset[r]!]).toBe(t.raw[r])
    }
    // "ﬁ" expands to "fi": both norm chars come from the one raw char.
    const f = t.norm.indexOf('file')
    expect(t.normToRaw[f]).toBe(t.normToRaw[f + 1])
  })

  it('keeps logical order for an RTL item', () => {
    const t = searchableText(content(item('שלום', 0, 30, { dir: 'rtl' })))
    expect(t.raw).toBe('שלום')
    expect(t.norm).toBe(t.raw)
  })

  it('spaces two RTL words that sit apart, reading right to left', () => {
    // The first word is on the right; the second ends 10 to its left.
    const t = searchableText(
      content(item('שלום', 40, 30, { dir: 'rtl' }), item('עולם', 0, 30, { dir: 'rtl' }))
    )
    expect(t.raw).toBe('שלום עולם')
  })

  it('joins two RTL pieces of one word that touch', () => {
    const t = searchableText(
      content(item('של', 30, 15, { dir: 'rtl' }), item('ום', 15, 15, { dir: 'rtl' }))
    )
    expect(t.raw).toBe('שלום')
  })

  it('handles an empty page', () => {
    const t = searchableText(content())
    expect(t.raw).toBe('')
    expect(Array.from(t.normToRaw)).toEqual([0])
  })
})

describe('normalizeQuery', () => {
  it('applies the same folding as norm', () => {
    expect(normalizeQuery('Café  “X”', true)).toBe('Cafe "X"')
    expect(normalizeQuery('ﬁle', true)).toBe('file')
  })

  it('lowercases unless matchCase', () => {
    expect(normalizeQuery('Invoice', false)).toBe('invoice')
    expect(normalizeQuery('Invoice', true)).toBe('Invoice')
  })
})
