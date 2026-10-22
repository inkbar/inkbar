import { fixtureBytes } from '@inkbar/fixtures'
import { describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'

import { openDocument, type InkDocument } from './document'

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

  it('finds split, hyphenated, accented and quoted text', async () => {
    const doc = await open('text-search')
    expect(await doc.search('Invoice').all()).not.toHaveLength(0)
    expect(await doc.search('document').all()).not.toHaveLength(0)
    expect(await doc.search('cafe').all()).not.toHaveLength(0)
    expect(await doc.search('"quoted"').all()).not.toHaveLength(0)
    doc.destroy()
  })

  it('finds "right column" only in the right column', async () => {
    const doc = await open('text-search')
    const hits = await doc.search('right column').all()
    expect(hits.length).toBeGreaterThan(0)
    const mid = doc.pages[0]!.width / 2
    for (const hit of hits) expect(hit.rect.x).toBeGreaterThan(mid)
    doc.destroy()
  })

  it('keeps a hit on a rotated page inside the page', async () => {
    const doc = await open('text-rotated-90')
    const text = (await doc.pageText(0)).split(/\s+/)[0]!
    const [hit] = await doc.search(text).all()
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
})
