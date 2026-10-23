// The order Tab visits form widgets in: page by page, and on each page by its `/Tabs`.
//
// Rows and columns are read off the page as it displays, so a page with `/Rotate` reads in the
// rows its reader sees. A widget joins the row (or column) under way when its centre falls
// inside the first widget of that row, so a tall list box and the short field beside it share
// a row even though their tops differ.
import { createPageTransform, type CssRect } from './transform'

import type { FormField, FormWidget } from '../model/form/types'
import type { PageInfo } from '../model/pages'

/** A page's `/Tabs`: rows, columns, structure or widget (annotation) order. */
export type TabsOrder = 'R' | 'C' | 'S' | 'W'

const unturned = (index: number): PageInfo => ({
  index,
  box: { x: 0, y: 0, width: 0, height: 0 },
  rotate: 0,
  userUnit: 1,
  width: 0,
  height: 0,
})

interface Placed {
  id: string
  /** Position in `/Annots` order on its page. */
  index: number
  box: CssRect
}

/** Groups `items` into bands along one axis, then orders each band along the other. */
function banded(
  items: readonly Placed[],
  start: (b: CssRect) => number,
  size: (b: CssRect) => number,
  across: (b: CssRect) => number
): Placed[] {
  const sorted = [...items].sort(
    (a, b) =>
      start(a.box) - start(b.box) || across(a.box) - across(b.box) || a.index - b.index
  )
  const bands: Placed[][] = []
  let first: CssRect | undefined
  for (const item of sorted) {
    const mid = start(item.box) + size(item.box) / 2
    const band = bands.at(-1)
    if (band && first && mid >= start(first) && mid <= start(first) + size(first))
      band.push(item)
    else {
      bands.push([item])
      first = item.box
    }
  }
  return bands.flatMap((band) =>
    band.sort(
      (a, b) =>
        across(a.box) - across(b.box) || start(a.box) - start(b.box) || a.index - b.index
    )
  )
}

/**
 * A page's widgets in paint order: their `/Annots` order (`FormWidget.order`), else the order
 * they are listed in.
 */
export function annotsOrder<T>(
  items: readonly T[],
  widget: (item: T) => Pick<FormWidget, 'order'>
): T[] {
  return items
    .map((item, i) => ({ item, i, at: widget(item).order ?? i }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map(({ item }) => item)
}

/**
 * One page's widget ids in Tab order: `R` reads rows top to bottom and each row left to right,
 * `C` reads columns left to right and each column top to bottom, and `S` follows `structure`
 * (the page's annotation ids in structure-tree order), with widgets the tree leaves out after
 * the rest in `/Annots` order. `W`, `A` or no `/Tabs` keep `/Annots` order. Positions are taken
 * as the page displays, after its `/Rotate`; without `info` the page is read unturned.
 */
export function pageTabOrder(
  widgets: readonly Pick<FormWidget, 'id' | 'rect' | 'order'>[],
  order: TabsOrder | undefined,
  info: PageInfo | undefined,
  page = 0,
  structure: readonly string[] = []
): string[] {
  const listed = annotsOrder(widgets, (w) => w)
  if (order === 'S') {
    const at = new Map(structure.map((id, i) => [id, i]))
    return listed
      .map((w, i) => ({ id: w.id, i, at: at.get(w.id) ?? Infinity }))
      .sort((a, b) => a.at - b.at || a.i - b.i)
      .map((w) => w.id)
  }
  if (order !== 'R' && order !== 'C') return listed.map((w) => w.id)
  // Only the order matters, so a page without `info` is read through an unturned stand-in of
  // no size.
  const transform = createPageTransform(info ?? unturned(page), 1)
  const placed = listed.map((w, index): Placed => ({
    id: w.id,
    index,
    box: transform.toCssRect(w.rect),
  }))
  const sorted =
    order === 'R'
      ? banded(
          placed,
          (b) => b.top,
          (b) => b.height,
          (b) => b.left
        )
      : banded(
          placed,
          (b) => b.left,
          (b) => b.width,
          (b) => b.top
        )
  return sorted.map((p) => p.id)
}

/**
 * Widget ids in Tab order: pages in order, each by its `/Tabs` (`pageTabOrder`), with
 * `structure` the structure order of each `S` page. A page missing from `pages` is read
 * unturned.
 */
export function tabOrder(
  fields: readonly FormField[],
  tabs: ReadonlyMap<number, TabsOrder>,
  pages: readonly PageInfo[] = [],
  structure: ReadonlyMap<number, readonly string[]> = new Map()
): string[] {
  const byPage = new Map<number, FormWidget[]>()
  for (const field of fields)
    for (const w of field.widgets) {
      const list = byPage.get(w.page) ?? []
      list.push(w)
      byPage.set(w.page, list)
    }
  return [...byPage.keys()]
    .sort((a, b) => a - b)
    .flatMap((page) =>
      pageTabOrder(
        byPage.get(page)!,
        tabs.get(page),
        pages[page],
        page,
        structure.get(page)
      )
    )
}
