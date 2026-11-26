import { describe, expect, it, vi } from 'vitest'

import { linksFromFacts, outlineFromFacts } from './links'
import { explicitDest } from './test-utils'

import type {
  OutlineEntryShape,
  PageAnnotationEntryShape,
  PageLinkFactsShape,
  PageLinksShape,
} from './types'
import type { Destination, RawDestination } from '../model/destination'

const ascii = (text: string) => new TextEncoder().encode(text)

/**
 * An annotation entry, a printable Link with object number 10 + index unless told otherwise.
 * `objectNumber: undefined` makes it a direct object.
 */
const entry = (
  index: number,
  over: Omit<Partial<PageAnnotationEntryShape>, 'objectNumber'> & {
    objectNumber?: number | undefined
  } = {}
): PageAnnotationEntryShape => {
  const { objectNumber = 'objectNumber' in over ? undefined : 10 + index, ...rest } = over
  return {
    index,
    subtype: 'Link',
    flags: 4,
    rectOk: true,
    hasQuads: false,
    quadsOk: true,
    ...rest,
    ...(objectNumber === undefined ? {} : { objectNumber }),
  }
}

/** A Link's facts going to https://example.com/<index>, over 72 700 172 720. */
const link = (
  index: number,
  over: Partial<PageLinkFactsShape> = {}
): PageLinkFactsShape => ({
  index,
  rect: { x: 72, y: 700, width: 100, height: 20 },
  action: { kind: 'URI', uriKind: 'string', uri: ascii(`https://example.com/${index}`) },
  ...over,
})

const page = (
  annotations: PageAnnotationEntryShape[],
  links: PageLinkFactsShape[] = annotations
    .filter((a) => a.subtype === 'Link')
    .map((a) => link(a.index))
): PageLinksShape => ({ annotations, links })

const urlOf = (index: number) => ({
  kind: 'url',
  url: `https://example.com/${index}`,
  newWindow: false,
})

describe('linksFromFacts', () => {
  it('gives each link its id, page, rect, order and target', () => {
    expect(linksFromFacts(3, page([entry(0), entry(1)]))).toEqual([
      {
        id: 'pdf:3:10R',
        page: 3,
        rect: { x: 72, y: 700, width: 100, height: 20 },
        order: 0,
        target: urlOf(0),
      },
      {
        id: 'pdf:3:11R',
        page: 3,
        rect: { x: 72, y: 700, width: 100, height: 20 },
        order: 1,
        target: urlOf(1),
      },
    ])
  })

  it('drops a link with the NoView flag, and keeps one with only Invisible, as PDF.js does', () => {
    // PDF.js clears Invisible from an annotation of a kind it knows, a Link included.
    const links = linksFromFacts(
      0,
      page([entry(0, { flags: 32 }), entry(1, { flags: 1 }), entry(2, { flags: 36 })])
    )
    expect(links.map((l) => [l.id, l.order])).toEqual([['pdf:0:11R', 0]])
  })

  it('keeps a link with the Hidden flag, as PDF.js does', () => {
    // PDF.js keeps a Link with the Hidden flag: getAnnotations does not test Hidden, and the
    // PDF.js reader keeps what it lists (link-order's link-hidden).
    expect(linksFromFacts(0, page([entry(0, { flags: 2 })])).map((l) => l.id)).toEqual([
      'pdf:0:10R',
    ])
  })

  it('keeps a link whose rect is not well formed, with the zero rect, as PDF.js does', () => {
    // PDF.js keeps a Link whose /Rect is not four numbers, with a rect of [0 0 0 0].
    const links = linksFromFacts(
      0,
      page(
        [entry(0, { rectOk: false })],
        [link(0, { rect: { x: 0, y: 0, width: 0, height: 0 } })]
      )
    )
    expect(links).toEqual([
      {
        id: 'pdf:0:10R',
        page: 0,
        rect: { x: 0, y: 0, width: 0, height: 0 },
        order: 0,
        target: urlOf(0),
      },
    ])
  })

  it('orders links among the annotations PDF.js keeps, widgets and popups after the rest', () => {
    const links = linksFromFacts(
      0,
      page([
        entry(0, { subtype: 'Square', flags: 2 }), // hidden: still kept, order 0
        entry(1), // order 1
        entry(2, { subtype: 'Widget', flags: 32 }), // a widget: listed after the rest
        entry(3, { flags: 32 }), // no view: left out
        entry(4, { subtype: 'Popup' }), // a popup: listed after the rest
        entry(5, { subtype: 'Square', flags: 1 }), // invisible, a kind PDF.js knows: order 2
        entry(6, { subtype: 'Highlight', hasQuads: true, quadsOk: false }), // bad quads: left out
        entry(7, { subtype: 'Ink', flags: 0 }), // order 3
        entry(8, { subtype: 'Ink', flags: 33 }), // no view: left out
        entry(9, { subtype: 'Underline', hasQuads: true }), // order 4
        entry(10, { subtype: 'Redact', flags: 1 }), // invisible, a kind PDF.js does not know: left out
        entry(11, { subtype: 'Square', flags: -4 }), // flags below 0 count as 0: order 5
        entry(12), // order 6
      ])
    )
    expect(links.map((l) => [l.id, l.order])).toEqual([
      ['pdf:0:11R', 1],
      ['pdf:0:22R', 6],
    ])
  })

  it("keeps the page's other links when one destination's fit is named constructor", () => {
    const crafted = (fit: string): PageLinkFactsShape => {
      const { action: _action, ...rest } = link(1)
      return { ...rest, destination: explicitDest(0, fit) }
    }
    for (const fit of ['constructor', '__proto__', 'toString']) {
      const links = linksFromFacts(
        0,
        page([entry(0), entry(1), entry(2)], [link(0), crafted(fit), link(2)])
      )
      expect(links.map((l) => l.target)).toEqual([
        urlOf(0),
        { kind: 'unsupported', reason: 'unknown' },
        urlOf(2),
      ])
    }
  })

  it('leaves out text markup with no /QuadPoints, as PDF.js does', () => {
    // PDF.js gives Highlight, Underline, Squiggly and StrikeOut null quad points when the file
    // has none, and its `viewable` test then fails. Any other kind needs none.
    const links = linksFromFacts(
      0,
      page([
        entry(0, { subtype: 'Highlight' }),
        entry(1, { subtype: 'Squiggly', flags: 0 }),
        entry(2, { subtype: 'StrikeOut' }),
        entry(3, { subtype: 'Square' }), // order 0
        entry(4, { subtype: 'Underline', hasQuads: true }), // order 1
        entry(5), // order 2
      ])
    )
    expect(links.map((l) => [l.id, l.order])).toEqual([['pdf:0:15R', 2]])
  })

  it('writes the generation after the R when it is not 0, as PDF.js does', () => {
    const links = linksFromFacts(
      0,
      page([entry(0, { generation: 0 }), entry(1, { generation: 3 })], [link(0), link(1)])
    )
    expect(links.map((l) => l.id)).toEqual(['pdf:0:10R', 'pdf:0:11R3'])
  })

  it('a link stored as a direct object gets the id its annotation has', () => {
    // Its page and place in /Annots, p<page>i<index>, as the annotations read names it.
    const links = linksFromFacts(
      2,
      page([
        entry(0, { subtype: 'Square', objectNumber: undefined }),
        entry(1),
        entry(2, { objectNumber: undefined }),
        entry(3, { subtype: 'Widget', objectNumber: undefined }),
        entry(4, { objectNumber: undefined, flags: 32 }),
        entry(5, { objectNumber: undefined }),
      ])
    )
    expect(links.map((l) => l.id)).toEqual(['pdf:2:11R', 'pdf:2:p2i2', 'pdf:2:p2i5'])
  })

  it('pairs each link with its entry by index, whatever order the links come in', () => {
    const links = linksFromFacts(
      0,
      page([entry(0), entry(1, { flags: 32 }), entry(2)], [link(2), link(1), link(0)])
    )
    expect(links.map((l) => [l.id, l.target])).toEqual([
      ['pdf:0:10R', urlOf(0)],
      ['pdf:0:12R', urlOf(2)],
    ])
  })

  it('gives quads as PDF.js does: each one boxed, top edge first, in 32-bit floats', () => {
    const [l] = linksFromFacts(
      0,
      page(
        [entry(0)],
        [
          link(0, {
            rect: { x: 60, y: 450, width: 110, height: 60 },
            // One quad stored bottom edge first, one top edge first.
            quads: [
              68, 462, 161, 462, 68, 480, 161, 480, 68.1, 504, 158, 504, 68.1, 486, 158,
              486,
            ],
          }),
        ]
      )
    )
    const f = Math.fround(68.1)
    expect(l!.quads).toEqual([
      {
        p1: { x: 68, y: 480 },
        p2: { x: 161, y: 480 },
        p3: { x: 68, y: 462 },
        p4: { x: 161, y: 462 },
      },
      {
        p1: { x: f, y: 504 },
        p2: { x: 158, y: 504 },
        p3: { x: f, y: 486 },
        p4: { x: 158, y: 486 },
      },
    ])
  })

  it('no quads when they are not well formed, or reach outside the rect', () => {
    const outside = [70, 690, 80, 690, 70, 680, 80, 680]
    const links = linksFromFacts(
      0,
      page(
        [entry(0, { quadsOk: false }), entry(1)],
        [link(0), link(1, { quads: outside })]
      )
    )
    expect(links.map((l) => 'quads' in l)).toEqual([false, false])
  })

  it('normalises the rect', () => {
    const [l] = linksFromFacts(
      0,
      page([entry(0)], [link(0, { rect: { x: 172, y: 720, width: -100, height: -20 } })])
    )
    expect(l!.rect).toEqual({ x: 72, y: 700, width: 100, height: 20 })
  })

  it('a link with no entry, or an entry with no link, gives nothing', () => {
    expect(linksFromFacts(0, page([entry(0)], [link(5)]))).toEqual([])
    expect(linksFromFacts(0, page([entry(0)], []))).toEqual([])
  })
})

describe('outlineFromFacts', () => {
  const item = (over: Partial<OutlineEntryShape> = {}): OutlineEntryShape => ({
    title: 'Item',
    bold: false,
    italic: false,
    count: 0,
    children: [],
    ...over,
  })
  const at = (page: number): Destination => ({ page, fit: 'fit' })
  const resolver = () =>
    vi.fn((raw: RawDestination): Promise<Destination | undefined> => {
      if (raw === 'chapter-2') return Promise.resolve(at(1))
      if (Array.isArray(raw) && (raw[0] as number) >= 0)
        return Promise.resolve(at(raw[0] as number))
      return Promise.resolve(undefined)
    })

  it('ids by position, titles on one line, styles, open when the count is positive', async () => {
    const outline = await outlineFromFacts(
      [
        item({
          title: '  Part\n\tOne  ',
          bold: true,
          count: 2,
          children: [item({ title: 'A', italic: true }), item({ title: 'B', count: -1 })],
        }),
        item({ title: 'Two', count: -2, children: [item({ title: 'C' })] }),
      ],
      resolver()
    )
    const unknown = { kind: 'unsupported', reason: 'unknown' }
    expect(outline).toEqual([
      {
        id: '0',
        title: 'Part One',
        target: unknown,
        bold: true,
        italic: false,
        open: true,
        children: [
          {
            id: '0.0',
            title: 'A',
            target: unknown,
            bold: false,
            italic: true,
            open: false,
            children: [],
          },
          {
            id: '0.1',
            title: 'B',
            target: unknown,
            bold: false,
            italic: false,
            open: false,
            children: [],
          },
        ],
      },
      {
        id: '1',
        title: 'Two',
        target: unknown,
        bold: false,
        italic: false,
        open: false,
        children: [
          {
            id: '1.0',
            title: 'C',
            target: unknown,
            bold: false,
            italic: false,
            open: false,
            children: [],
          },
        ],
      },
    ])
  })

  it('resolves each destination, in document order; one naming no page is unknown', async () => {
    const resolve = resolver()
    const outline = await outlineFromFacts(
      [
        item({
          destination: explicitDest(0, 'Fit'),
          children: [item({ destination: { name: ascii('chapter-2') } })],
        }),
        item({ destination: explicitDest(-1, 'Fit') }),
        item({ action: { kind: 'GoTo', destination: { name: ascii('missing') } } }),
      ],
      resolve
    )
    expect(resolve.mock.calls.map(([raw]) => raw)).toEqual([
      [0, { name: 'Fit' }],
      'chapter-2',
      [-1, { name: 'Fit' }],
      'missing',
    ])
    expect(outline.map((o) => o.target)).toEqual([
      { kind: 'resolved', dest: at(0) },
      { kind: 'unsupported', reason: 'unknown' },
      { kind: 'unsupported', reason: 'unknown' },
    ])
    expect(outline[0]!.children[0]!.target).toEqual({ kind: 'resolved', dest: at(1) })
  })

  it('other targets pass through', async () => {
    const outline = await outlineFromFacts(
      [
        item({
          action: { kind: 'URI', uriKind: 'string', uri: ascii('https://example.com/o') },
        }),
        item({ action: { kind: 'Named', name: 'NextPage' } }),
        item({
          action: { kind: 'URI', uriKind: 'string', uri: ascii('javascript:alert(1)') },
        }),
      ],
      resolver()
    )
    expect(outline.map((o) => o.target)).toEqual([
      { kind: 'url', url: 'https://example.com/o', newWindow: false },
      { kind: 'named', action: 'NextPage' },
      { kind: 'unsupported', reason: 'unsafe-url' },
    ])
  })

  it('an empty outline is empty', async () => {
    expect(await outlineFromFacts([], resolver())).toEqual([])
  })
})
