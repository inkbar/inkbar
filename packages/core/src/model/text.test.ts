import { fixtureBytes } from '@inkbar/fixtures'
import { describe, expect, it } from 'vitest'

import { nodeAssets } from '../test-support/node-assets'

import { openDocument } from './document'

describe('text content', () => {
  it('gives items as user-space quads', async () => {
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const tc = await doc.text(0)
    expect(tc.page).toBe(0)
    const ni = tc.items.find((i) => i.str.includes('QQ123456C'))
    expect(ni).toBeDefined()
    // The fixture draws line 2 of page 1 at baseline y = 700 - 2 * 24 = 652, x = 72, Helvetica 14.
    // The engine's box spans 0.207 of the size below the baseline and 0.718 above it.
    expect(ni!.fontSize).toBe(14)
    expect(ni!.rect.x).toBe(72)
    expect(ni!.quad.p3.x).toBe(72)
    expect(ni!.rect.y).toBeCloseTo(652 - 14 * 0.207, 2)
    expect(ni!.rect.height).toBeCloseTo(14 * 0.925, 2)
    expect(Math.abs(ni!.rect.width - 340.34)).toBeLessThanOrEqual(1)
    expect(ni!.quad.p3.y).toBeCloseTo(ni!.rect.y, 6)
    expect(ni!.quad.p1.y).toBeCloseTo(ni!.rect.y + ni!.rect.height, 6)
    doc.destroy()
  })
})
