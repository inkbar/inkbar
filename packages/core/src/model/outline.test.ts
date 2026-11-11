import { fixtureBytes } from '@inkbar/fixtures'
import { describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'

import { openDocument } from './document'

import type { OutlineItem } from './outline'

async function open(name: 'outline' | 'text-simple' = 'outline') {
  const doc = await openDocument(await fixtureBytes(name), {
    assets: nodeAssets(),
    verbosity: 0,
  })
  await doc.ready
  return doc
}

/** The tree as titles, ids, flags and children, without targets. */
function shape(items: readonly OutlineItem[]): unknown[] {
  return items.map((i) => ({
    id: i.id,
    title: i.title,
    bold: i.bold,
    italic: i.italic,
    open: i.open,
    children: shape(i.children),
  }))
}

const flat = (items: readonly OutlineItem[]): OutlineItem[] =>
  items.flatMap((i) => [i, ...flat(i.children)])

const leaf = (id: string, title: string, extra: Partial<OutlineItem> = {}) => ({
  id,
  title,
  bold: false,
  italic: false,
  open: false,
  children: [],
  ...extra,
})

describe('outline', () => {
  it('reads the tree', async () => {
    const doc = await open()
    const items = await doc.outline()
    expect(shape(items)).toEqual([
      leaf('0', 'Cover'),
      {
        ...leaf('1', 'Part One', { bold: true }),
        children: [leaf('1.0', 'Chapter 1'), leaf('1.1', 'Chapter 2')],
      },
      {
        ...leaf('2', 'Part Two', { open: true }),
        children: [leaf('2.0', 'Section A'), leaf('2.1', 'Section B', { italic: true })],
      },
      leaf('3', 'Appendix'),
      leaf('4', 'Website'),
      leaf('5', 'Next page'),
      leaf('6', 'Broken'),
    ])
    const target = (title: string) => flat(items).find((i) => i.title === title)?.target
    expect(target('Cover')).toEqual({
      kind: 'resolved',
      dest: { page: 0, fit: 'xyz', left: undefined, top: 700, zoom: undefined },
    })
    expect(target('Part One')).toEqual({
      kind: 'resolved',
      dest: { page: 1, fit: 'fit' },
    })
    expect(target('Chapter 1')).toEqual({
      kind: 'resolved',
      dest: { page: 1, fit: 'fith', top: 600 },
    })
    expect(target('Chapter 2')).toEqual({
      kind: 'resolved',
      dest: { page: 1, fit: 'xyz', left: 72, top: 500, zoom: undefined },
    })
    expect(target('Part Two')).toEqual({
      kind: 'resolved',
      dest: { page: 2, fit: 'fitv', left: 144 },
    })
    expect(target('Section A')).toEqual({
      kind: 'resolved',
      dest: { page: 3, fit: 'fitr', rect: { x: 72, y: 100, width: 228, height: 300 } },
    })
    expect(target('Section B')).toEqual({
      kind: 'resolved',
      dest: { page: 3, fit: 'fitb' },
    })
    expect(target('Appendix')).toEqual({
      kind: 'resolved',
      dest: { page: 4, fit: 'fit' },
    })
    expect(target('Next page')).toEqual({ kind: 'named', action: 'NextPage' })
    doc.destroy()
  })

  it('broken destination is unsupported', async () => {
    const doc = await open()
    const broken = (await doc.outline()).find((i) => i.title === 'Broken')
    expect(broken?.target).toEqual({ kind: 'unsupported', reason: 'unknown' })
    doc.destroy()
  })

  it('url item passes safeUrl', async () => {
    const doc = await open()
    const site = (await doc.outline()).find((i) => i.title === 'Website')
    expect(site?.target).toEqual({
      kind: 'url',
      url: 'https://example.com/outline',
      newWindow: false,
    })
    doc.destroy()
  })

  it('reads nothing until called', async () => {
    const doc = await open()
    const spy = vi.spyOn(doc._pdfjs.proxy, 'getOutline')
    await new Promise((r) => setTimeout(r, 20))
    expect(spy).not.toHaveBeenCalled()
    const first = await doc.outline()
    const second = await doc.outline()
    expect(second).toBe(first)
    expect(spy).toHaveBeenCalledTimes(1)
    doc.destroy()
  })

  it('no outline gives []', async () => {
    const doc = await open('text-simple')
    expect(await doc.outline()).toEqual([])
    doc.destroy()
  })
})
