import { describe, expect, it } from 'vitest'

import { tabOrder } from './form-order'

import type { FormField, FormWidget } from '../model/form/types'
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

describe('tabOrder', () => {
  it('row order on /Tabs R', () => {
    // b is taller than a, but they share a row: a is left of it.
    expect(tabOrder(LAYOUT, new Map([[0, 'R']]), [page(0)])).toEqual(['a', 'b', 'c', 'd'])
  })

  it('column order on /Tabs C', () => {
    expect(tabOrder(LAYOUT, new Map([[0, 'C']]), [page(0)])).toEqual(['a', 'c', 'b', 'd'])
  })

  it('widget order when absent', () => {
    expect(tabOrder(LAYOUT, new Map(), [page(0)])).toEqual(['c', 'b', 'a', 'd'])
    expect(tabOrder(LAYOUT, new Map([[0, 'S']]), [page(0)])).toEqual(['c', 'b', 'a', 'd'])
    expect(tabOrder(LAYOUT, new Map([[0, 'W']]), [page(0)])).toEqual(['c', 'b', 'a', 'd'])
  })

  it('row order on a /Rotate 90 page follows the displayed rows', () => {
    // Turned a quarter clockwise, user space's left edge is the top of the page on screen:
    // a and b share the top row (b further right), and c sits below a.
    const list = fields(['c', 0, 300, 100], ['b', 0, 100, 500], ['a', 0, 100, 100])
    expect(tabOrder(list, new Map([[0, 'R']]), [page(0, 90)])).toEqual(['a', 'b', 'c'])
    // The same widgets unturned read b first: it is highest on the page.
    expect(tabOrder(list, new Map([[0, 'R']]), [page(0)])).toEqual(['b', 'a', 'c'])
  })

  it('goes page by page, each page by its own /Tabs', () => {
    const list = fields(
      ['p1-low', 1, 72, 100],
      ['p0-low', 0, 72, 100],
      ['p1-high', 1, 72, 700],
      ['p0-high', 0, 72, 700]
    )
    expect(tabOrder(list, new Map([[1, 'R']]), [page(0), page(1)])).toEqual([
      'p0-low',
      'p0-high',
      'p1-high',
      'p1-low',
    ])
  })
})
