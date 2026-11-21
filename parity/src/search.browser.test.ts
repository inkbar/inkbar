// Runs the queries core's own search tests run, with PDF.js and with the engine, and checks both
// readers find the same hits: as many, on the same pages, with the same text, and each quad's
// centre within TEXT_TOLERANCE of the other's.
import { describe, expect, it } from 'vitest'

import { searchableText } from '../../packages/core/src/model/search-text'

import { openWith } from './draw'
import { TEXT_TOLERANCE } from './text'

import type { InkDocument, SearchHit, SearchOptions } from '@inkbar/core'
import type { FixtureName } from '@inkbar/fixtures/urls'

type Query = [string, SearchOptions?]

/**
 * Core's search tests, by fixture: `model/search.fixtures.test.ts` and
 * `model/search.browser.test.ts`.
 */
const QUERIES: [FixtureName, Query[]][] = [
  [
    'text-simple',
    [
      ['QQ123456C'],
      ['QQ123456C', { pages: [2, 0] }],
      ['QQ123456C', { pages: [1] }],
      ['a', { matchCase: true }],
      ['not anywhere in this file'],
      ['x'],
    ],
  ],
  [
    'text-search',
    [
      ['Invoice'],
      ['document'],
      ['cafe'],
      ['"quoted"'],
      ['right column'],
      ['columnright'],
      ['lineright'],
      ['column right', { wholeWord: true }],
      ['words'],
      ['rned'],
      ['World'],
      ['full'],
      ['T', { matchCase: true }],
      ['column', { pages: [0] }],
    ],
  ],
  ['text-rotated-90', [['Rotated']]],
  ['scanned-no-text', [['a']]],
]

const centre = (q: SearchHit['quads'][number]) => ({
  x: (q.p1.x + q.p2.x + q.p3.x + q.p4.x) / 4,
  y: (q.p1.y + q.p2.y + q.p3.y + q.p4.y) / 4,
})

/** The font size of the text `hit` starts in, from the page text search matched against. */
async function fontSize(doc: InkDocument, hit: SearchHit): Promise<number> {
  const st = searchableText(await doc.text(hit.page))
  for (let r = hit.start; r < hit.end; r++) {
    const i = st.rawToItem[r]!
    if (i >= 0) return st.content.items[i]!.fontSize
  }
  throw new Error(`no text under the hit on page ${hit.page + 1} at ${hit.start}`)
}

describe.each(QUERIES)('%s', (name, queries) => {
  it.each(queries)(
    'finds the same hits for %j with both readers',
    async (query, opts) => {
      const pdfjs = await openWith(name, 'pdfjs')
      try {
        const engine = await openWith(name, 'engine')
        try {
          const a = await pdfjs.search(query, opts).all()
          const b = await engine.search(query, opts).all()
          expect(b.length, 'hits, engine against PDF.js').toBe(a.length)
          expect(
            b.map((h) => h.page),
            'pages of the hits'
          ).toEqual(a.map((h) => h.page))
          expect(
            b.map((h) => h.text),
            'text of the hits'
          ).toEqual(a.map((h) => h.text))
          for (const [i, hit] of a.entries()) {
            const other = b[i]!
            expect(other.quads.length, `hit ${i + 1}: quads`).toBe(hit.quads.length)
            const size = Math.max(
              await fontSize(pdfjs, hit),
              await fontSize(engine, other)
            )
            hit.quads.forEach((q, k) => {
              const p = centre(q)
              const o = centre(other.quads[k]!)
              const apart = Math.hypot(p.x - o.x, p.y - o.y) / size
              expect(
                apart,
                `hit ${i + 1} quad ${k + 1}: centres (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) and (${o.x.toFixed(2)}, ${o.y.toFixed(2)}), ${apart.toFixed(3)} of the font size apart`
              ).toBeLessThanOrEqual(TEXT_TOLERANCE)
            })
          }
        } finally {
          engine.destroy()
        }
      } finally {
        pdfjs.destroy()
      }
    }
  )
})
