import { describe, expect, it } from 'vitest'

import { openFixtureInBrowser } from '../dom/test-utils'

// Helvetica advances per 1000 em, from its AFM.
const HELVETICA: Record<string, number> = {
  l: 222,
  e: 556,
  f: 278,
  t: 278,
  ' ': 278,
  c: 500,
  o: 556,
  u: 556,
  m: 833,
  n: 556,
}
const advance = (s: string, size: number) =>
  [...s].reduce((sum, ch) => sum + HELVETICA[ch]!, 0) * (size / 1000)

describe('search hit boxes', () => {
  it('cover the matched glyphs in proportional text', async () => {
    // The fixture draws "left column" in Helvetica 14 at x = 72.
    const doc = await openFixtureInBrowser('text-search')
    const [hit] = await doc.search('column', { pages: [0] }).all()
    doc.destroy()
    const left = 72 + advance('left ', 14)
    // Counting characters instead of measuring them puts the box about 8 pt too far right. The
    // measuring font is the system's sans-serif, whose widths differ a little from Helvetica's.
    expect(Math.abs(hit!.rect.x - left)).toBeLessThan(2)
    expect(
      Math.abs(hit!.rect.x + hit!.rect.width - (left + advance('column', 14)))
    ).toBeLessThan(2)
  })
})
