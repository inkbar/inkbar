import { describe, expect, it } from 'vitest'

import { orderStops, pageStopOrder, pageTabOrder } from './form-order'

import type { FormField, FormWidget, TabsOrder } from '../model/form/types'
import type { PageLink } from '../model/links'
import type { PageInfo } from '../model/pages'

const FLAGS: FormField['flags'] = {
  readOnly: false,
  required: false,
  noExport: false,
  multiline: false,
  password: false,
  comb: false,
  fileSelect: false,
  doNotSpellCheck: false,
  doNotScroll: false,
  multiSelect: false,
  editable: false,
  radiosInUnison: false,
}

/** A text field per widget: `[id, page, x, y, width, height]`. */
function fields(...widgets: [string, number, number, number, number?, number?][]) {
  return widgets.map(([id, page, x, y, width = 100, height = 20]): FormField => ({
    name: id,
    type: 'text',
    flags: FLAGS,
    options: [],
    locked: false,
    widgets: [
      {
        id,
        page,
        rect: { x, y, width, height },
        rotation: 0,
        hidden: false,
        printOnly: false,
        appearance: { fontSize: 12, align: 'left' },
        hasScripts: false,
      } satisfies FormWidget,
    ],
  }))
}

const page = (index: number, rotate: PageInfo['rotate'] = 0): PageInfo => ({
  index,
  box: { x: 0, y: 0, width: 612, height: 792 },
  rotate,
  userUnit: 1,
  width: 612,
  height: 792,
})

// Listed out of reading order on purpose: c (low on the page) first, then the top row.
const LAYOUT = fields(
  ['c', 0, 72, 400],
  ['b', 0, 320, 700, 100, 44],
  ['a', 0, 72, 722],
  ['d', 0, 320, 400]
)

/** Page 0's widget ids in Tab order under `tabs`. */
const order = (
  list: readonly FormField[],
  tabs?: TabsOrder,
  info: PageInfo = page(0),
  structure?: readonly string[]
) =>
  pageTabOrder(
    list.flatMap((f) => f.widgets),
    tabs,
    info,
    0,
    structure
  )

describe('pageTabOrder', () => {
  it('row order on /Tabs R', () => {
    // b is taller than a, but they share a row: a is left of it.
    expect(order(LAYOUT, 'R')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('column order on /Tabs C', () => {
    expect(order(LAYOUT, 'C')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('widget order when absent', () => {
    expect(order(LAYOUT)).toEqual(['c', 'b', 'a', 'd'])
    expect(order(LAYOUT, 'S')).toEqual(['c', 'b', 'a', 'd'])
    expect(order(LAYOUT, 'W')).toEqual(['c', 'b', 'a', 'd'])
    expect(order(LAYOUT, 'A')).toEqual(['c', 'b', 'a', 'd'])
  })

  it('widget order is /Annots order, not the order fields list their widgets', () => {
    // Field x has widgets first and third in /Annots; field y's sits between them.
    const [x, y] = fields(['x1', 0, 72, 700], ['y1', 0, 72, 600])
    const xs: FormField = {
      ...x!,
      widgets: [
        { ...x!.widgets[0]!, order: 0 },
        {
          ...x!.widgets[0]!,
          id: 'x2',
          rect: { x: 72, y: 100, width: 100, height: 20 },
          order: 2,
        },
      ],
    }
    const ys: FormField = { ...y!, widgets: [{ ...y!.widgets[0]!, order: 1 }] }
    expect(order([xs, ys])).toEqual(['x1', 'y1', 'x2'])
    expect(order([xs, ys], 'S')).toEqual(['x1', 'y1', 'x2'])
  })

  it('structure order on /Tabs S, then the widgets the tree leaves out', () => {
    const list = fields(
      ['a', 0, 72, 700],
      ['b', 0, 72, 600],
      ['c', 0, 72, 500],
      ['d', 0, 72, 400]
    )
    expect(order(list, 'S', page(0), ['c', 'x', 'a'])).toEqual(['c', 'a', 'b', 'd'])
    // No tree: /Annots order.
    expect(order(list, 'S')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('row order on a /Rotate 90 page follows the displayed rows', () => {
    // Turned a quarter clockwise, user space's left edge is the top of the page on screen:
    // a and b share the top row (b further right), and c sits below a.
    const list = fields(['c', 0, 300, 100], ['b', 0, 100, 500], ['a', 0, 100, 100])
    expect(order(list, 'R', page(0, 90))).toEqual(['a', 'b', 'c'])
    // The same widgets unturned read b first: it is highest on the page.
    expect(order(list, 'R')).toEqual(['b', 'a', 'c'])
  })
})

describe('orderStops', () => {
  const link = (id: string, x: number, y: number, order: number): PageLink => ({
    id,
    page: 0,
    rect: { x, y, width: 80, height: 18 },
    order,
    target: { kind: 'url', url: 'https://example.com/', newWindow: false },
  })
  const widgets = (list: FormField[]) => list.flatMap((f) => f.widgets)

  it('links and fields interleave by position', () => {
    // Rows: [a, link-top], [c, link-low]; widgets listed before links in /Annots.
    const list = widgets(fields(['c', 0, 72, 400], ['a', 0, 72, 722]))
    const links = [link('link-low', 320, 402, 3), link('link-top', 320, 724, 2)]
    expect(pageStopOrder(list, links, 'R', page(0))).toEqual([
      'a',
      'link-top',
      'c',
      'link-low',
    ])
    expect(pageStopOrder(list, links, 'C', page(0))).toEqual([
      'a',
      'c',
      'link-top',
      'link-low',
    ])
    // Without /Tabs, /Annots order; with W, the widgets come first.
    const mixed = [link('link-top', 320, 724, 0), link('link-low', 320, 402, 2)]
    const listed = widgets(fields(['a', 0, 72, 722], ['c', 0, 72, 400])).map((w, i) => ({
      ...w,
      order: i === 0 ? 1 : 3,
    }))
    expect(pageStopOrder(listed, mixed, undefined, page(0))).toEqual([
      'link-top',
      'a',
      'link-low',
      'c',
    ])
    expect(pageStopOrder(listed, mixed, 'W', page(0))).toEqual([
      'a',
      'c',
      'link-top',
      'link-low',
    ])
  })

  it('orders stops given as boxes', () => {
    const box = (left: number, top: number) => ({ left, top, width: 50, height: 20 })
    const items = [
      { id: 'b', box: box(200, 10), index: 0 },
      { id: 'c', box: box(10, 100), index: 1 },
      { id: 'a', box: box(10, 12), index: 2 },
    ]
    expect(orderStops(items, 'R')).toEqual(['a', 'b', 'c'])
    expect(orderStops(items, 'A')).toEqual(['b', 'c', 'a'])
  })
})
