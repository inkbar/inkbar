import { createPageTransform, type ViewRotation } from './transform'

import type { PageInfo } from '../model/pages'

export type LayoutMode = 'single' | 'continuous'

/** Where one page sits inside the pages element, in CSS pixels. */
export interface CssPageBox {
  index: number
  left: number
  top: number
  width: number
  height: number
}

/** Every laid-out page plus the size of the pages element, in CSS pixels. */
export interface CssLayout {
  boxes: CssPageBox[]
  width: number
  height: number
}

export interface CssLayoutInput {
  pages: readonly PageInfo[]
  zoom: number
  rotation: ViewRotation
  /** Gap above, between and below pages, CSS px. */
  gap: number
  mode: LayoutMode
  /** The page shown in `single` mode. */
  current: number
  /** The container's content width (client width less padding), CSS px. Narrower pages are centred. */
  containerWidth: number
}

function cssSize(page: PageInfo, zoom: number, rotation: ViewRotation) {
  const t = createPageTransform(page, zoom, rotation)
  return { width: t.cssWidth, height: t.cssHeight }
}

/** Stacks pages vertically, centred horizontally, with `gap` around each. */
export function computeCssLayout(input: CssLayoutInput): CssLayout {
  const pages =
    input.mode === 'single'
      ? input.pages.filter((p) => p.index === input.current)
      : input.pages
  const sizes = pages.map((p) => cssSize(p, input.zoom, input.rotation))
  const width = Math.max(input.containerWidth, ...sizes.map((s) => s.width))
  let top = input.gap
  const boxes = pages.map((p, i): CssPageBox => {
    const s = sizes[i]!
    const box = {
      index: p.index,
      left: (width - s.width) / 2,
      top,
      width: s.width,
      height: s.height,
    }
    top += s.height + input.gap
    return box
  })
  return { boxes, width, height: top }
}

/** The zoom at which `page` fits a container of the given CSS size, less `padding` on each side. */
export function fitZoomCss(
  page: PageInfo,
  rotation: ViewRotation,
  container: { width: number; height: number },
  mode: 'fit-width' | 'fit-page',
  padding: number
): number {
  const size = cssSize(page, 1, rotation)
  const byWidth = (container.width - padding * 2) / size.width
  if (mode === 'fit-width') return Math.max(0.05, byWidth)
  const byHeight = (container.height - padding * 2) / size.height
  return Math.max(0.05, Math.min(byWidth, byHeight))
}

/**
 * Indexes of pages intersecting [scrollTop, scrollTop + viewportHeight], extended by
 * `buffer` pages each side. Past the end it returns the last page plus its buffer.
 */
export function visibleRangeCss(
  layout: CssLayout,
  scrollTop: number,
  viewportHeight: number,
  buffer: number
): number[] {
  const boxes = layout.boxes
  if (boxes.length === 0) return []
  const bottom = scrollTop + viewportHeight
  let first = boxes.findIndex((b) => b.top + b.height >= scrollTop)
  if (first === -1) first = boxes.length - 1
  let last = first
  while (last + 1 < boxes.length && boxes[last + 1]!.top <= bottom) last++
  const from = Math.max(0, first - buffer)
  const to = Math.min(boxes.length - 1, last + buffer)
  return boxes.slice(from, to + 1).map((b) => b.index)
}

/** The page with the most visible height in the viewport; the first page on a tie. */
export function mostVisiblePageCss(
  layout: CssLayout,
  scrollTop: number,
  viewportHeight: number
): number {
  let best = layout.boxes[0]?.index ?? 0
  let bestArea = -1
  const bottom = scrollTop + viewportHeight
  for (const b of layout.boxes) {
    const visible = Math.max(
      0,
      Math.min(b.top + b.height, bottom) - Math.max(b.top, scrollTop)
    )
    if (visible > bestArea) {
      bestArea = visible
      best = b.index
    }
  }
  return best
}
