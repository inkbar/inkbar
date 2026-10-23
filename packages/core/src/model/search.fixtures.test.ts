import { fixtureBytes } from '@inkbar/fixtures'
import { describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'

import { openDocument, type InkDocument } from './document'

// Helvetica advances per 1000 em, from its AFM.
const HELVETICA: Record<string, number> = {
  ' ': 278,
  H: 722,
  W: 944,
  a: 556,
  c: 500,
  d: 556,
  e: 556,
  f: 278,
  h: 556,
  i: 222,
  k: 500,
  l: 222,
  n: 556,
  o: 556,
  p: 556,
  r: 333,
  s: 500,
  u: 556,
  w: 722,
  y: 500,
}

/** How far `s` moves the pen in Helvetica 14 with the fixture's character spacing 1 and word spacing 4. */
const spaced = (s: string) =>
  [...s].reduce((x, ch) => x + (HELVETICA[ch]! * 14) / 1000 + 1 + (ch === ' ' ? 4 : 0), 0)

async function open(name: Parameters<typeof fixtureBytes>[0]): Promise<InkDocument> {
  const doc = await openDocument(await fixtureBytes(name), { assets: nodeAssets() })
  await doc.ready
  return doc
}

describe('InkDocument.search', () => {
  it('finds a string on every page, inside the text the page draws', async () => {
    const doc = await open('text-simple')
    const hits = await doc.search('QQ123456C').all()
    expect(hits.map((h) => h.page)).toEqual([0, 1, 2])
    for (const hit of hits) {
      const items = (await doc.text(hit.page)).items.filter((i) =>
        i.str.includes('QQ123456C')
      )
      const ok = items.some(
        (i) =>
          hit.rect.x >= i.rect.x - 1 &&
          hit.rect.y >= i.rect.y - 1 &&
          hit.rect.x + hit.rect.width <= i.rect.x + i.rect.width + 1 &&
          hit.rect.y + hit.rect.height <= i.rect.y + i.rect.height + 1
      )
      expect(ok).toBe(true)
    }
    doc.destroy()
  })

  it('finds a word split over two font runs as one hit with a quad per run', async () => {
    const doc = await open('text-search')
    const items = (await doc.text(0)).items
    const hits = await doc.search('Invoice').all()
    expect(hits).toHaveLength(1)
    const hit = hits[0]!
    expect(hit.text).toBe('Invoice')
    expect(hit.quads).toHaveLength(2)
    const runs = ['Inv', 'oice'].map((str) => items.find((i) => i.str === str)!.rect)
    const left = Math.min(...runs.map((r) => r.x))
    const right = Math.max(...runs.map((r) => r.x + r.width))
    expect(hit.rect.x).toBeCloseTo(left, 1)
    expect(hit.rect.x + hit.rect.width).toBeCloseTo(right, 1)
    doc.destroy()
  })

  it('finds a hyphenated word across the line break, one quad on each line', async () => {
    const doc = await open('text-search')
    const hits = await doc.search('document').all()
    expect(hits).toHaveLength(1)
    const { quads } = hits[0]!
    expect(quads).toHaveLength(2)
    expect(quads[0]!.p3.y).toBeGreaterThan(quads[1]!.p3.y + 5)
    doc.destroy()
  })

  it('finds accented text from a plain query', async () => {
    const doc = await open('text-search')
    const hits = await doc.search('cafe').all()
    expect(hits.map((h) => h.text)).toEqual(['café'])
    doc.destroy()
  })

  it('finds straight quotes in a query against the curly quotes on the page', async () => {
    const doc = await open('text-search')
    const hits = await doc.search('"quoted"').all()
    expect(hits.map((h) => h.text)).toEqual(['\u201cquoted\u201d'])
    doc.destroy()
  })

  it('finds "right column" only in the right column', async () => {
    const doc = await open('text-search')
    const hits = await doc.search('right column').all()
    expect(hits).toHaveLength(1)
    expect(hits[0]!.rect.x).toBeGreaterThan(300)
    // The columns sit on one baseline: the gap between them is a space, not a join.
    expect(await doc.search('columnright').all()).toEqual([])
    expect(await doc.search('lineright').all()).toEqual([])
    expect(await doc.search('column right', { wholeWord: true }).all()).toHaveLength(1)
    doc.destroy()
  })

  it('keeps a hit on a rotated page inside the page', async () => {
    const doc = await open('text-rotated-90')
    const [hit] = await doc.search('Rotated').all()
    const { box } = doc.pages[0]!
    expect(hit).toBeDefined()
    for (const q of hit!.quads)
      for (const p of [q.p1, q.p2, q.p3, q.p4]) {
        expect(p.x).toBeGreaterThanOrEqual(box.x - 0.01)
        expect(p.x).toBeLessThanOrEqual(box.x + box.width + 0.01)
        expect(p.y).toBeGreaterThanOrEqual(box.y - 0.01)
        expect(p.y).toBeLessThanOrEqual(box.y + box.height + 0.01)
      }
    doc.destroy()
  })

  it('finds nothing in a page with no text', async () => {
    const doc = await open('scanned-no-text')
    expect(await doc.search('a').all()).toEqual([])
    doc.destroy()
  })

  it('searches the pages in the order given', async () => {
    const doc = await open('text-simple')
    const hits = await doc.search('QQ123456C', { pages: [2, 0] }).all()
    expect(hits.map((h) => h.page)).toEqual([2, 0])
    doc.destroy()
  })

  it('stops on abort and reads no more pages', async () => {
    const doc = await open('text-simple')
    const text = vi.spyOn(doc, 'text')
    const abort = new AbortController()
    const it = doc.search('QQ123456C', { signal: abort.signal })[Symbol.asyncIterator]()
    expect((await it.next()).value).toMatchObject({ page: 0 })
    abort.abort()
    await expect(it.next()).rejects.toMatchObject({ name: 'AbortError' })
    expect(text.mock.calls.map((c) => c[0])).toEqual([0])
    doc.destroy()
  })

  it('rejects with the abort reason when there is one', async () => {
    const doc = await open('text-simple')
    const reason = new Error('stop')
    await expect(
      doc.search('x', { signal: AbortSignal.abort(reason) }).all()
    ).rejects.toBe(reason)
    doc.destroy()
  })

  it('stops when the document is destroyed mid-scan', async () => {
    const doc = await open('text-simple')
    const it = doc.search('QQ123456C')[Symbol.asyncIterator]()
    await it.next()
    doc.destroy()
    await expect(it.next()).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('reads page text once per page across searches', async () => {
    const doc = await open('text-simple')
    await doc.search('QQ123456C').all()
    const text = vi.spyOn(doc, 'text')
    await doc.search('QQ123456C').all()
    await doc.search('a', { matchCase: true }).all()
    expect(text).not.toHaveBeenCalled()
    doc.destroy()
  })

  it('cuts hit boxes at the glyph widths, spacing and kerning the page draws with', async () => {
    const doc = await open('text-search')
    const [words] = await doc.search('words').all()
    const [rned] = await doc.search('rned').all()
    doc.destroy()
    // The fixture draws "widely spaced words" at x = 72 and "ke", a -20 TJ gap, then "rned word"
    // at x = 72 below it. A box ends before the character spacing after its last glyph.
    expect(words!.rect.x).toBeCloseTo(72 + spaced('widely spaced '), 2)
    expect(words!.rect.width).toBeCloseTo(spaced('words') - 1, 2)
    expect(rned!.rect.x).toBeCloseTo(72 + spaced('ke') + (20 * 14) / 1000, 2)
    expect(rned!.rect.width).toBeCloseTo(spaced('rned') - 1, 2)
  })

  it('follows a move and a scaling change inside one line of text', async () => {
    const doc = await open('text-search')
    const [world] = await doc.search('World').all()
    const [full] = await doc.search('full').all()
    doc.destroy()
    const plain = (s: string) =>
      [...s].reduce((x, ch) => x + (HELVETICA[ch]! * 14) / 1000, 0)
    // "World" starts after a 40 pt move from x = 72; "full" follows "half " drawn at 50% width.
    expect(world!.rect.x).toBeCloseTo(112, 2)
    expect(world!.rect.width).toBeCloseTo(plain('World'), 2)
    expect(full!.rect.x).toBeCloseTo(72 + plain('half ') / 2, 2)
    expect(full!.rect.width).toBeCloseTo(plain('full'), 2)
  })

  it('covers the whole of a glyph that kerning tucks the next one under', async () => {
    const doc = await open('text-search')
    const [t] = await doc.search('T', { matchCase: true }).all()
    doc.destroy()
    // The fixture draws "To" at x = 72 with the "o" kerned 120 back; the T is 611 wide.
    expect(t!.rect.x).toBeCloseTo(72, 2)
    expect(t!.rect.width).toBeCloseTo((611 * 14) / 1000, 2)
  })
})
