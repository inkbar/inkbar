import { describe, expect, it } from 'vitest'

import { linkDifferences, outlineDifferences, resolveLinks } from './links'

import type { OutlineItem, PageLink } from '@inkbar/core'

const link = (id: string, extra: Partial<PageLink> = {}): PageLink => ({
  id,
  page: 0,
  rect: { x: 10, y: 20, width: 100, height: 12 },
  order: 0,
  target: { kind: 'url', url: 'https://example.com/', newWindow: false },
  ...extra,
})

describe('linkDifferences', () => {
  it('finds equal links the same', () => {
    expect(linkDifferences([link('a'), link('b')], [link('a'), link('b')])).toEqual([])
  })

  it('keeps a rect within 0.01 pt the same', () => {
    const near = link('a', { rect: { x: 10.005, y: 20, width: 100, height: 12 } })
    expect(linkDifferences([link('a')], [near])).toEqual([])
  })

  it('names the link and the field when a rect is 0.02 pt off', () => {
    const off = link('a', { rect: { x: 10, y: 20, width: 100.02, height: 12 } })
    expect(linkDifferences([link('a')], [off])).toEqual([
      'link a: rect width: PDF.js 100, engine 100.02',
    ])
  })

  it('names the link and the field when a quad is off', () => {
    const quad = {
      p1: { x: 10, y: 32 },
      p2: { x: 110, y: 32 },
      p3: { x: 10, y: 20 },
      p4: { x: 110, y: 20 },
    }
    const moved = { ...quad, p4: { x: 110.5, y: 20 } }
    expect(
      linkDifferences([link('a', { quads: [quad] })], [link('a', { quads: [moved] })])
    ).toEqual(['link a: quad 1 p4: PDF.js (110, 20), engine (110.5, 20)'])
    expect(linkDifferences([link('a', { quads: [quad] })], [link('a')])).toEqual([
      'link a: quads: PDF.js 1, engine none',
    ])
  })

  it('names the link at its place when an id differs', () => {
    expect(linkDifferences([link('a'), link('b')], [link('a'), link('c')])).toEqual([
      'link 2: id: PDF.js b, engine c',
    ])
  })

  it('names the order when the links come in a different order', () => {
    expect(linkDifferences([link('a'), link('b')], [link('b'), link('a')])).toEqual([
      'links in a different order: PDF.js a, b; engine b, a',
    ])
  })

  it("names the link and the field when a link's order differs", () => {
    expect(linkDifferences([link('a')], [link('a', { order: 3 })])).toEqual([
      'link a: order: PDF.js 0, engine 3',
    ])
  })

  it('names the link and the field when a target differs', () => {
    const other = link('a', {
      target: { kind: 'url', url: 'https://example.org/', newWindow: false },
    })
    expect(linkDifferences([link('a')], [other])).toEqual([
      'link a: target: PDF.js {"kind":"url","url":"https://example.com/","newWindow":false}, engine {"kind":"url","url":"https://example.org/","newWindow":false}',
    ])
  })

  it('names a count that differs and the links only one reader gives', () => {
    expect(linkDifferences([link('a'), link('b')], [link('a')])).toEqual([
      'count: PDF.js 2, engine 1',
      'link b: only PDF.js gives it',
    ])
  })
})

describe('resolveLinks', () => {
  /** Resolves a PDF.js page reference `{ num, gen }` (num 3 is page 0) or an engine page index. */
  const resolve = (raw: unknown) => {
    const array = raw as unknown[]
    const first = array[0] as number | { num: number }
    const page = typeof first === 'number' ? first : first.num - 3
    return Promise.resolve({
      page,
      fit: 'xyz' as const,
      left: 0,
      top: array[3] as number,
    })
  }

  it('compares explicit destinations by where they resolve', async () => {
    const pdfjs = link('a', {
      target: { kind: 'dest', raw: [{ num: 3, gen: 0 }, { name: 'XYZ' }, 0, 700, null] },
    })
    const engine = link('a', {
      target: { kind: 'dest', raw: [0, { name: 'XYZ' }, 0, 700, null] },
    })
    const elsewhere = link('a', {
      target: { kind: 'dest', raw: [1, { name: 'XYZ' }, 0, 700, null] },
    })
    const [a] = await resolveLinks([pdfjs], resolve)
    const [b] = await resolveLinks([engine], resolve)
    const [c] = await resolveLinks([elsewhere], resolve)
    expect(linkDifferences([a!], [b!])).toEqual([])
    expect(linkDifferences([a!], [c!])).toEqual([
      'link a: target: PDF.js {"kind":"resolved","dest":{"page":0,"fit":"xyz","left":0,"top":700}}, engine {"kind":"resolved","dest":{"page":1,"fit":"xyz","left":0,"top":700}}',
    ])
  })

  it('keeps the name of a named destination that does not resolve', async () => {
    const raw = { kind: 'dest' as const, raw: 'nowhere' }
    const [a] = await resolveLinks([link('a', { target: raw })], () =>
      Promise.resolve(undefined)
    )
    expect(a!.target).toEqual(raw)
  })

  it('finds two explicit destinations that go nowhere the same', async () => {
    const nowhere = () => Promise.resolve(undefined)
    const [a] = await resolveLinks(
      [
        link('a', {
          target: { kind: 'dest', raw: [{ num: 1, gen: 0 }, { name: 'Fit' }] },
        }),
      ],
      nowhere
    )
    const [b] = await resolveLinks(
      [link('a', { target: { kind: 'dest', raw: [-1, { name: 'Fit' }] } })],
      nowhere
    )
    expect(linkDifferences([a!], [b!])).toEqual([])
  })
})

describe('outlineDifferences', () => {
  const entry = (
    id: string,
    title: string,
    children: OutlineItem[] = [],
    extra: Partial<OutlineItem> = {}
  ): OutlineItem => ({
    id,
    title,
    target: { kind: 'resolved', dest: { page: 0, fit: 'fit' } },
    bold: false,
    italic: false,
    open: false,
    children,
    ...extra,
  })
  const tree = () => [entry('0', 'One', [entry('0.0', 'One A')]), entry('1', 'Two')]

  it('finds the same tree the same', () => {
    expect(outlineDifferences(tree(), tree())).toEqual([])
  })

  it('names the item and the field that differs', () => {
    const other = tree()
    other[0] = entry('0', 'One', [entry('0.0', 'One A', [], { bold: true })], {
      open: true,
    })
    other[1] = entry('1', 'Too', [], {
      target: { kind: 'resolved', dest: { page: 2, fit: 'fit' } },
    })
    expect(outlineDifferences(tree(), other)).toEqual([
      'item 0 "One": open: PDF.js false, engine true',
      'item 0.0 "One A": bold: PDF.js false, engine true',
      'item 1 "Two": title: PDF.js "Two", engine "Too"',
      'item 1 "Two": target: PDF.js {"kind":"resolved","dest":{"page":0,"fit":"fit"}}, engine {"kind":"resolved","dest":{"page":2,"fit":"fit"}}',
    ])
  })

  it('names a count of children that differs', () => {
    const other = [entry('0', 'One'), entry('1', 'Two')]
    expect(outlineDifferences(tree(), other)).toEqual([
      'item 0 "One": children: PDF.js 1, engine 0',
    ])
    expect(outlineDifferences(tree(), [])).toEqual([
      'top level: PDF.js 2 items, engine 0',
    ])
  })
})
