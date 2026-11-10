// The order Tab visits form widgets and links in: page by page, and on each page by its `/Tabs`.
//
// Rows and columns are read off the page as it displays, so a page with `/Rotate` reads in the
// rows its reader sees. A stop joins the row (or column) under way when its centre falls
// inside the first stop of that row, so a tall list box and the short field beside it share
// a row even though their tops differ.

import { importedId } from '../model/annotations/embedded'
import { rectFromQuad } from '../model/geometry'

import { createPageTransform, type CssRect } from './transform'

import type { FormWidget, TabsOrder } from '../model/form/types'
import type { PageLink } from '../model/links'
import type { PageInfo } from '../model/pages'

export type { TabsOrder }

const unturned = (index: number): PageInfo => ({
  index,
  box: { x: 0, y: 0, width: 0, height: 0 },
  rotate: 0,
  userUnit: 1,
  width: 0,
  height: 0,
})

/** Groups `items` into bands along one axis, then orders each band along the other. */
function banded<Placed extends Pick<TabStopItem, 'box' | 'index'>>(
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

/** Something Tab stops at on a page: a widget or a link, placed as the page displays. */
export interface TabStopItem {
  id: string
  /** Where it shows, after the page's `/Rotate`; only positions relative to each other count. */
  box: CssRect
  /** Position in the page's `/Annots`. */
  index: number
  /** A form widget, which `/Tabs W` puts before everything else. */
  widget?: boolean
}

/**
 * One page's stops in Tab order: `R` reads rows top to bottom and each row left to right, `C`
 * reads columns left to right and each column top to bottom, and `S` follows `structure` (the
 * page's stop ids in structure-tree order), with stops the tree leaves out after the rest in
 * `/Annots` order. `W` puts widgets first, each group in `/Annots` order; `A` or no `/Tabs`
 * keep `/Annots` order.
 */
export function orderStops(
  items: readonly TabStopItem[],
  tabs: TabsOrder | undefined,
  structure: readonly string[] = []
): string[] {
  const listed = [...items].sort((a, b) => a.index - b.index)
  if (tabs === 'S') {
    const at = new Map(structure.map((id, i) => [id, i]))
    return listed
      .map((item, i) => ({ id: item.id, i, at: at.get(item.id) ?? Infinity }))
      .sort((a, b) => a.at - b.at || a.i - b.i)
      .map((item) => item.id)
  }
  if (tabs === 'W')
    return [...listed.filter((i) => i.widget), ...listed.filter((i) => !i.widget)].map(
      (i) => i.id
    )
  if (tabs !== 'R' && tabs !== 'C') return listed.map((i) => i.id)
  const sorted =
    tabs === 'R'
      ? banded(
          listed,
          (b) => b.top,
          (b) => b.height,
          (b) => b.left
        )
      : banded(
          listed,
          (b) => b.left,
          (b) => b.width,
          (b) => b.top
        )
  return sorted.map((p) => p.id)
}

/**
 * One page's widget and link ids in Tab order (`orderStops`), so fields and links share one
 * reading order. A link is placed by its first quad, the line it starts on. Positions are taken
 * as the page displays, after its `/Rotate`; without `info` the page is read unturned.
 * `structure` holds the page's annotation ids as PDF.js reports them, which link ids wrap.
 */
export function pageStopOrder(
  widgets: readonly Pick<FormWidget, 'id' | 'rect' | 'order'>[],
  links: readonly Pick<PageLink, 'id' | 'rect' | 'quads' | 'order'>[],
  order: TabsOrder | undefined,
  info: PageInfo | undefined,
  page = 0,
  structure: readonly string[] = []
): string[] {
  // Only the order matters, so a page without `info` is read through an unturned stand-in of
  // no size.
  const transform = createPageTransform(info ?? unturned(page), 1)
  const listed = annotsOrder(widgets, (w) => w)
  // Widgets without an `/Annots` place keep the order they are listed in, and links without one
  // follow them.
  const items: TabStopItem[] = [
    ...listed.map((w, i) => ({
      id: w.id,
      box: transform.toCssRect(w.rect),
      index: w.order ?? i,
      widget: true,
    })),
    ...links.map((l, i) => ({
      id: l.id,
      box: transform.toCssRect(l.quads?.[0] ? rectFromQuad(l.quads[0]) : l.rect),
      index: l.order ?? listed.length + i,
    })),
  ]
  const prefix = importedId(page, '')
  const ids = new Set(links.map((l) => l.id))
  const keyed = structure.map((id) => (ids.has(prefix + id) ? prefix + id : id))
  return orderStops(items, order, keyed)
}

/**
 * One page's widget ids in Tab order (`orderStops`). Positions are taken as the page displays,
 * after its `/Rotate`; without `info` the page is read unturned.
 */
export function pageTabOrder(
  widgets: readonly Pick<FormWidget, 'id' | 'rect' | 'order'>[],
  order: TabsOrder | undefined,
  info: PageInfo | undefined,
  page = 0,
  structure: readonly string[] = []
): string[] {
  return pageStopOrder(widgets, [], order, info, page, structure)
}
