// The order Tab visits form widgets in: page by page, and on each page by its `/Tabs`.
//
// Rows and columns are read off the page as it displays, so a page with `/Rotate` reads in the
// rows its reader sees. A widget joins the row (or column) under way when its centre falls
// inside the first widget of that row, so a tall list box and the short field beside it share
// a row even though their tops differ.
import { createPageTransform, type CssRect } from './transform'

import type { FormField } from '../model/form/types'
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
  /** Position in widget order on its page. */
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
 * Widget ids in Tab order. Pages go in order; on each page, `R` reads rows top to bottom and
 * each row left to right, `C` reads columns left to right and each column top to bottom, and
 * `S`, `W` or no `/Tabs` keep widget order (PDF.js gives no structure tree, so `S` falls back
 * to it). Widget order is the order the fields list their widgets. Positions are taken as the
 * page displays, after its `/Rotate`; a page missing from `pages` is read unturned.
 */
export function tabOrder(
  fields: readonly FormField[],
  tabs: ReadonlyMap<number, TabsOrder>,
  pages: readonly PageInfo[] = []
): string[] {
  const byPage = new Map<
    number,
    { id: string; rect: FormField['widgets'][number]['rect'] }[]
  >()
  for (const field of fields)
    for (const w of field.widgets) {
      const list = byPage.get(w.page) ?? []
      list.push({ id: w.id, rect: w.rect })
      byPage.set(w.page, list)
    }
  const out: string[] = []
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const widgets = byPage.get(page)!
    const order = tabs.get(page)
    if (order !== 'R' && order !== 'C') {
      out.push(...widgets.map((w) => w.id))
      continue
    }
    // Only the order matters, so a page missing from `pages` is read through an unturned
    // stand-in of no size.
    const transform = createPageTransform(pages[page] ?? unturned(page), 1)
    const placed = widgets.map((w, index): Placed => ({
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
    out.push(...sorted.map((p) => p.id))
  }
  return out
}
