import { mergeLineRects } from '../model/selection'

import type { PageTransform } from './transform'
import type { Quad, Rect } from '../model/geometry'

export interface SelectionQuads {
  /** Zero-based page index. */
  page: number
  /** One user-space quad per selected line, top to bottom. */
  quads: Quad[]
  text: string
}

/**
 * Converts viewport-relative CSS-pixel rects (from `getClientRects()`) to user-space rects on
 * the page rendered in `host`. Empty rects are skipped.
 */
export function cssRectsToUserRects(
  rects: Iterable<DOMRect>,
  host: HTMLElement,
  transform: PageTransform
): Rect[] {
  const h = host.getBoundingClientRect()
  const out: Rect[] = []
  for (const r of rects) {
    if (r.width === 0 || r.height === 0) continue
    out.push(
      transform.fromCssRect({
        left: r.left - h.left,
        top: r.top - h.top,
        width: r.width,
        height: r.height,
      })
    )
  }
  return out
}

/**
 * Reads the live DOM selection and returns one entry per page it touches, with line-merged
 * user-space quads. Only text inside `[data-ink-text-layer]` under a `[data-page]` host counts;
 * `pageFor` maps a host to its page index and current transform.
 */
export function getSelectionQuads(
  root: HTMLElement,
  pageFor: (host: HTMLElement) => { page: number; transform: PageTransform } | undefined
): SelectionQuads[] {
  const sel = root.ownerDocument.defaultView?.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return []
  const results = new Map<number, { rects: Rect[]; text: string[] }>()
  const layers = [...root.querySelectorAll<HTMLElement>('[data-ink-text-layer]')]
  if (root.matches('[data-ink-text-layer]')) layers.unshift(root)
  for (let i = 0; i < sel.rangeCount; i++) {
    const range = sel.getRangeAt(i)
    for (const layer of layers) {
      if (!range.intersectsNode(layer)) continue
      const host = layer.closest<HTMLElement>('[data-page]')
      if (!host) continue
      const info = pageFor(host)
      if (!info) continue
      const sub = range.cloneRange()
      if (!layer.contains(range.startContainer)) sub.setStart(layer, 0)
      if (!layer.contains(range.endContainer)) sub.setEnd(layer, layer.childNodes.length)
      const entry = results.get(info.page) ?? { rects: [], text: [] }
      entry.rects.push(...cssRectsToUserRects(sub.getClientRects(), host, info.transform))
      entry.text.push(rangeText(sub))
      results.set(info.page, entry)
    }
  }
  return [...results.entries()]
    .sort(([a], [b]) => a - b)
    .map(([page, { rects, text }]) => ({
      page,
      quads: mergeLineRects(rects),
      text: normaliseText(text.join('\n')),
    }))
    .filter((r) => r.quads.length > 0)
}

/**
 * The range's text with each PDF.js `<br>` (an end of line) kept as a newline.
 * `Range.toString()` would run the lines together.
 */
function rangeText(range: Range): string {
  const fragment = range.cloneContents()
  for (const br of fragment.querySelectorAll('br')) br.replaceWith('\n')
  return fragment.textContent ?? ''
}

/** Collapses runs of spaces and tabs, and any whitespace around a line break, to one. */
function normaliseText(text: string): string {
  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n\s*/g, '\n')
    .trim()
}
