import { describe, expect, it } from 'vitest'

import { openFixtureInBrowser } from '../dom/test-utils'

import type { InkDocument } from './document'

/** What a document's text, page text and search give for the fixture's pages. */
async function readAll(doc: InkDocument) {
  const pages = [0, 1, 2]
  const text = await Promise.all(pages.map((p) => doc.text(p)))
  return {
    // PDF.js names fonts by document (`g_d0_f1`): the two opens differ only in that.
    text: text.map((t) => ({
      ...t,
      items: t.items.map((i) => ({ ...i, fontName: i.fontName.replace(/^g_d\d+_/, '') })),
    })),
    pageText: await Promise.all(pages.map((p) => doc.pageText(p))),
    hits: await doc.search('QQ123456C').all(),
  }
}

describe('page text in a browser without async iteration over streams', () => {
  // iOS Safari 26 has ReadableStream but cannot iterate one with `for await`.
  it('reads text, page text and search hits as a browser with it does', async () => {
    const withIt = await openFixtureInBrowser('text-simple')
    const expected = await readAll(withIt)
    withIt.destroy()
    expect(expected.hits.length).toBeGreaterThan(0)

    const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>
    const saved = Object.getOwnPropertyDescriptor(proto, Symbol.asyncIterator)
    delete proto[Symbol.asyncIterator]
    try {
      const doc = await openFixtureInBrowser('text-simple')
      try {
        expect(await readAll(doc)).toEqual(expected)
      } finally {
        doc.destroy()
      }
    } finally {
      if (saved) Object.defineProperty(proto, Symbol.asyncIterator, saved)
    }
    expect(Symbol.asyncIterator in ReadableStream.prototype).toBe(true)
  })
})
