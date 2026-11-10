import { fixtureBytes, type FixtureName } from '@inkbar/fixtures'
import { describe, expect, it } from 'vitest'

import { openDocument } from '../model/document'

import { destinationPage, resolveDestination } from './destinations'
import { nodeAssets } from './node-assets'

import type { PdfjsDocument } from './types'

async function proxyOf(name: FixtureName): Promise<PdfjsDocument> {
  const doc = await openDocument(await fixtureBytes(name), { assets: nodeAssets() })
  await doc.ready
  return doc._pdfjs.proxy
}

interface OutlineNode {
  title: string
  dest: string | unknown[] | null
  items: OutlineNode[]
}

/** Every outline item's title with its raw destination, depth first. */
function flatten(items: OutlineNode[]): [string, OutlineNode['dest']][] {
  return items.flatMap((i) => [[i.title, i.dest] as const, ...flatten(i.items)])
}

describe('resolveDestination', () => {
  it('resolves every fit type', async () => {
    const proxy = await proxyOf('outline')
    const items = new Map(flatten(await proxy.getOutline()))
    const resolve = (title: string) => resolveDestination(proxy, items.get(title)!)
    expect(await resolve('Cover')).toEqual({
      page: 0,
      fit: 'xyz',
      left: undefined,
      top: 700,
      zoom: undefined,
    })
    expect(await resolve('Part One')).toEqual({ page: 1, fit: 'fit' })
    expect(await resolve('Chapter 1')).toEqual({ page: 1, fit: 'fith', top: 600 })
    expect(await resolve('Part Two')).toEqual({ page: 2, fit: 'fitv', left: 144 })
    expect(await resolve('Section A')).toEqual({
      page: 3,
      fit: 'fitr',
      rect: { x: 72, y: 100, width: 228, height: 300 },
    })
    expect(await resolve('Section B')).toEqual({ page: 3, fit: 'fitb' })
  })

  it('resolves names from both name stores', async () => {
    const proxy = await proxyOf('outline')
    expect(await resolveDestination(proxy, 'chapter-2')).toEqual({
      page: 1,
      fit: 'xyz',
      left: 72,
      top: 500,
      zoom: undefined,
    })
    expect(await resolveDestination(proxy, 'appendix')).toEqual({ page: 4, fit: 'fit' })
  })

  it('reads the variants the fixture does not hold', async () => {
    const proxy = await proxyOf('outline')
    const at = { name: 'FitBH' }
    expect(await resolveDestination(proxy, [2, at, 50])).toEqual({
      page: 2,
      fit: 'fitbh',
      top: 50,
    })
    expect(await resolveDestination(proxy, [2, { name: 'FitBV' }, null])).toEqual({
      page: 2,
      fit: 'fitbv',
      left: undefined,
    })
  })

  it('unreadable destinations resolve to undefined', async () => {
    const proxy = await proxyOf('outline')
    const items = new Map(flatten(await proxy.getOutline()))
    expect(await resolveDestination(proxy, 'no-such-name')).toBeUndefined()
    expect(await resolveDestination(proxy, [])).toBeUndefined()
    // A destination whose target is the catalog, not a page.
    expect(await resolveDestination(proxy, items.get('Broken')!)).toBeUndefined()
    expect(await resolveDestination(proxy, [6, { name: 'Fit' }])).toBeUndefined()
    expect(await resolveDestination(proxy, [-1, { name: 'Fit' }])).toBeUndefined()
    expect(await resolveDestination(proxy, [0, { name: 'Bogus' }])).toBeUndefined()
    expect(await resolveDestination(proxy, [0, { name: 'FitR' }, 1, 2])).toBeUndefined()
  })
})

describe('destinationPage', () => {
  it('still returns a page', async () => {
    const proxy = await proxyOf('form-goto')
    expect(await destinationPage(proxy, 'chapter-3')).toBe(2)
    expect(await destinationPage(proxy, 'nowhere')).toBeUndefined()
  })
})
