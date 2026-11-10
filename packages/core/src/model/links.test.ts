import { fixtureBytes } from '@inkbar/fixtures'
import { describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'

import { openDocument } from './document'

import type { PageLink } from './links'

async function open() {
  const doc = await openDocument(await fixtureBytes('links'), {
    assets: nodeAssets(),
    verbosity: 0,
  })
  await doc.ready
  return doc
}

const byRect = (links: readonly PageLink[], x: number, y: number) =>
  links.find((l) => l.rect.x === x && l.rect.y === y)

describe('links', () => {
  it('is empty for a page out of range', async () => {
    const doc = await open()
    expect(doc.links(99)).toEqual([])
    doc.destroy()
  })

  it('reads every link target kind', async () => {
    const doc = await open()
    const links = doc.links(0)
    expect(links).toHaveLength(8)
    const target = (y: number) => byRect(links, 68, y)?.target
    expect(target(696)).toEqual({
      kind: 'dest',
      raw: [{ num: 6, gen: 0 }, { name: 'XYZ' }, 72, 600, null],
    })
    expect(target(666)).toEqual({ kind: 'dest', raw: 'chapter-3' })
    expect(target(636)).toEqual({
      kind: 'url',
      url: 'https://example.com/a',
      newWindow: false,
    })
    expect(target(576)).toEqual({ kind: 'named', action: 'NextPage' })
    expect(target(546)).toEqual({ kind: 'unsupported', reason: 'remote' })
    expect(target(516)).toEqual({ kind: 'unsupported', reason: 'launch' })
    expect(target(462)).toMatchObject({ kind: 'url', url: 'https://example.com/wrapped' })
    expect(byRect(links, 68, 696)?.id).toMatch(/^pdf:0:/)
    doc.destroy()
  })

  it('javascript URL is unsupported, never a url', async () => {
    const doc = await open()
    const link = byRect(doc.links(0), 68, 606)
    expect(link?.target.kind).toBe('unsupported')
    expect(link?.target).toEqual({ kind: 'unsupported', reason: 'unsafe-url' })
    doc.destroy()
  })

  it('quad points become quads', async () => {
    const doc = await open()
    const wrapped = byRect(doc.links(0), 68, 462)!
    expect(wrapped.rect).toEqual({ x: 68, y: 462, width: 93, height: 42 })
    expect(wrapped.quads).toHaveLength(2)
    expect(byRect(doc.links(0), 68, 696)?.quads).toBeUndefined()
    doc.destroy()
  })

  it('rotated page link keeps its user-space rect', async () => {
    const doc = await open()
    expect(doc.pages[2]?.rotate).toBe(90)
    const [link] = doc.links(2)
    expect(link?.rect).toEqual({ x: 68, y: 696, width: 87, height: 18 })
    expect(link?.target).toMatchObject({ kind: 'dest' })
    doc.destroy()
  })

  it('never adds links to the annotation store', async () => {
    const doc = await open()
    expect(doc.annotations.list.get()).toEqual([])
    doc.destroy()
  })

  it('resolveDestination caches', async () => {
    const doc = await open()
    const spy = vi.spyOn(doc._pdfjs.proxy, 'getDestination')
    const first = await doc.resolveDestination('chapter-3')
    const second = await doc.resolveDestination('chapter-3')
    expect(first).toMatchObject({ page: 2, fit: 'fit' })
    expect(second).toEqual(first)
    expect(spy).toHaveBeenCalledTimes(1)
    doc.destroy()
  })
})
