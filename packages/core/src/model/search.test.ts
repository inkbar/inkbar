import { describe, expect, it, vi } from 'vitest'

import { rectFromQuad, unionRects } from './geometry'
import { CONTEXT_CHARS, matchPage } from './search'
import { searchableText } from './search-text'

import type { TextItem } from './text'

const SIZE = 10
const OPTS = { matchCase: false, wholeWord: false }

function item(
  str: string,
  x: number,
  width: number,
  opts: Partial<Pick<TextItem, 'hasEOL' | 'dir'>> & { y?: number } = {}
): TextItem {
  const y = opts.y ?? 100
  return {
    str,
    dir: opts.dir ?? 'ltr',
    fontName: 'f',
    fontSize: SIZE,
    hasEOL: opts.hasEOL ?? false,
    quad: {
      p1: { x, y: y + SIZE },
      p2: { x: x + width, y: y + SIZE },
      p3: { x, y },
      p4: { x: x + width, y },
    },
    rect: { x, y, width, height: SIZE },
  }
}

const page = (...items: TextItem[]) => searchableText({ page: 0, items })
const one = (str: string) => page(item(str, 0, str.length * 5))

describe('matchPage', () => {
  it('ignores case unless asked not to', () => {
    const st = one('Invoice')
    expect(matchPage(st, 'invoice', OPTS)).toHaveLength(1)
    expect(matchPage(st, 'invoice', { ...OPTS, matchCase: true })).toHaveLength(0)
    expect(matchPage(st, 'Invoice', { ...OPTS, matchCase: true })).toHaveLength(1)
  })

  it('finds accented text from a plain query and reports the page text', () => {
    const hits = matchPage(one('un café noir'), 'cafe', OPTS)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ text: 'café', start: 3, end: 7, page: 0 })
  })

  it('finds a hyphenated word split over two lines, with a quad for each line', () => {
    const st = page(
      item('docu-', 0, 25, { hasEOL: true }),
      item('ment', 0, 20, { y: 80 })
    )
    const hits = matchPage(st, 'document', OPTS)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.quads).toHaveLength(2)
  })

  it('covers two touching items with quads that join up to their rects', () => {
    const a = item('Inv', 0, 15)
    const b = item('oice', 15, 20)
    const [hit] = matchPage(page(a, b), 'Invoice', OPTS)
    expect(hit!.quads).toHaveLength(2)
    const union = unionRects(hit!.quads.map(rectFromQuad))
    const want = unionRects([a.rect, b.rect])
    for (const k of ['x', 'y', 'width', 'height'] as const)
      expect(union[k]).toBeCloseTo(want[k], 2)
  })

  it('cuts a quad for part of one item', () => {
    const [hit] = matchPage(page(item('oice', 10, 40)), 'oic', OPTS)
    expect(hit!.quads).toHaveLength(1)
    const q = hit!.quads[0]!
    expect(q.p3.x).toBeCloseTo(10, 5)
    expect(q.p4.x).toBeCloseTo(10 + 40 * 0.75, 5)
    expect(q.p1.x).toBeCloseTo(q.p3.x, 5)
    expect(q.p2.x).toBeCloseTo(q.p4.x, 5)
    expect(q.p1.y).toBe(110)
  })

  it('cuts a quad by the item glyph advances when it has them', () => {
    // "iiWW": the narrow i's take a fifth of the run, the W's the rest.
    const it = { ...item('iiWW', 10, 40), advances: [0, 0.1, 0.2, 0.6, 1] }
    const [hit] = matchPage(page(it), 'ww', OPTS)
    expect(hit!.quads[0]!.p3.x).toBeCloseTo(18, 5)
    expect(hit!.quads[0]!.p4.x).toBeCloseTo(50, 5)
  })

  it('cuts along a rotated baseline', () => {
    const it = item('abcd', 0, 40)
    it.quad = {
      p1: { x: 0, y: 40 },
      p2: { x: 0, y: 0 },
      p3: { x: 10, y: 40 },
      p4: { x: 10, y: 0 },
    }
    const [hit] = matchPage(page(it), 'bc', OPTS)
    expect(hit!.quads[0]!.p3).toEqual({ x: 10, y: 30 })
    expect(hit!.quads[0]!.p4).toEqual({ x: 10, y: 10 })
  })

  it('keeps whole-word matches off the middle of a word', () => {
    const st = one('invoice in')
    expect(matchPage(st, 'in', OPTS)).toHaveLength(2)
    const hits = matchPage(st, 'in', { ...OPTS, wholeWord: true })
    expect(hits.map((h) => h.start)).toEqual([8])
  })

  it('runs a regular expression on the page text', () => {
    const hits = matchPage(one('NI QQ123456C ok'), /\b[A-Z]{2}\d{6}[A-D]\b/, OPTS)
    expect(hits.map((h) => h.text)).toEqual(['QQ123456C'])
  })

  it('skips zero-length regular expression matches', () => {
    const hits = matchPage(one('banana'), /a*/, OPTS)
    expect(hits.map((h) => h.text)).toEqual(['a', 'a', 'a'])
  })

  it('steps past an astral character after a zero-length unicode match', () => {
    const st = one('x😀aa😀y')
    expect(matchPage(st, /a*/u, OPTS).map((h) => h.text)).toEqual(['aa'])
    expect(matchPage(st, /\b/u, OPTS)).toEqual([])
    expect(matchPage(st, /(?:)/u, OPTS)).toEqual([])
    expect(matchPage(st, new RegExp('a*', 'v'), OPTS).map((h) => h.text)).toEqual(['aa'])
  })

  it('finds every match for a sticky regular expression', () => {
    expect(matchPage(one('banana'), /a/y, OPTS)).toHaveLength(3)
  })

  it('leaves the caller regular expression alone', () => {
    const re = /an/
    const before = { source: re.source, flags: re.flags }
    expect(matchPage(one('banana'), re, OPTS)).toHaveLength(2)
    expect(re.lastIndex).toBe(0)
    expect({ source: re.source, flags: re.flags }).toEqual(before)
  })

  it('does not ignore case for a regular expression unless it says so', () => {
    expect(matchPage(one('Invoice'), /invoice/, OPTS)).toHaveLength(0)
    expect(
      matchPage(one('Invoice'), /invoice/i, { ...OPTS, matchCase: true })
    ).toHaveLength(1)
  })

  it('returns context that excludes the hit and fits CONTEXT_CHARS', () => {
    const text = `${'a '.repeat(60)}needle${' b'.repeat(60)}`
    const [hit] = matchPage(one(text), 'needle', OPTS)
    expect(hit!.before.length).toBeLessThanOrEqual(CONTEXT_CHARS)
    expect(hit!.after.length).toBeLessThanOrEqual(CONTEXT_CHARS)
    expect(hit!.before.endsWith('a ')).toBe(true)
    expect(hit!.after.startsWith(' b')).toBe(true)
    expect(hit!.before + hit!.text + hit!.after).not.toContain('needleneedle')
  })

  it('collapses whitespace in context', () => {
    const [hit] = matchPage(
      page(item('a', 0, 5, { hasEOL: true }), item('x  b', 0, 20, { y: 80 })),
      'x',
      OPTS
    )
    expect(hit!.before).toBe('a ')
  })

  it('finds nothing for an empty query', () => {
    expect(matchPage(one('Invoice'), '', OPTS)).toEqual([])
  })

  it('finds nothing for a query of only whitespace', () => {
    expect(matchPage(one('a b  c'), ' ', OPTS)).toEqual([])
    expect(matchPage(one('a b  c'), ' \t\u00a0', OPTS)).toEqual([])
  })

  it('keeps indexes in step when lower-casing changes a length', () => {
    // "İ" lower-cases to two UTF-16 units, so offsets into the folded text would drift.
    const st = one('İİ İstanbul invoice')
    const hits = matchPage(st, 'invoice', OPTS)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.text).toBe('invoice')
    expect(st.raw.slice(hits[0]!.start, hits[0]!.end)).toBe('invoice')
    expect(matchPage(st, 'ISTANBUL', OPTS)).toHaveLength(1)
    const [lower] = matchPage(st, 'istanbul', OPTS)
    expect(lower).toMatchObject({ text: 'İstanbul', start: 3, end: 11 })
  })

  it('ignores case the same way whatever the default locale', () => {
    // Turkish lower-cases "I" to dotless "ı", so "INVOICE" would not match "invoice".
    const turkish = vi
      .spyOn(String.prototype, 'toLocaleLowerCase')
      .mockImplementation(function (this: string) {
        return this.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase()
      })
    try {
      expect(matchPage(one('INVOICE Invoice'), 'invoice', OPTS)).toHaveLength(2)
    } finally {
      turkish.mockRestore()
    }
  })

  it('finds a word, or part of one, in the second of two RTL items, inside that item', () => {
    // Read right to left: "שלום " sits right of "עולם" on the line.
    const second = item('עולם', 0, 30, { dir: 'rtl' })
    const st = page(item('שלום ', 40, 35, { dir: 'rtl' }), second)
    expect(st.raw).toBe('שלום עולם')
    const run = rectFromQuad(second.quad)
    // The whole item, then its last three letters, whose cut is an estimate.
    for (const [query, start] of [
      ['עולם', 5],
      ['ולם', 6],
    ] as const) {
      const hits = matchPage(st, query, OPTS)
      expect(hits).toHaveLength(1)
      expect(hits[0]).toMatchObject({ text: query, start, end: 9 })
      const [quad] = hits[0]!.quads
      expect(hits[0]!.quads).toHaveLength(1)
      for (const p of [quad!.p1, quad!.p2, quad!.p3, quad!.p4]) {
        expect(p.x).toBeGreaterThanOrEqual(run.x)
        expect(p.x).toBeLessThanOrEqual(run.x + run.width)
        expect(p.y).toBeGreaterThanOrEqual(run.y)
        expect(p.y).toBeLessThanOrEqual(run.y + run.height)
      }
      const width = rectFromQuad(quad!).width
      expect(width).toBeCloseTo((run.width * query.length) / 4, 5)
    }
  })
})
