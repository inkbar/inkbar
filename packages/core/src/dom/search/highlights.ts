/*
 * Search match highlights. Each mounted page gets one layer, `div.ink-search-layer`, inserted
 * before the annotation overlay so annotations and plugin marks draw over it, with one
 * `div[data-search-hit]` per quad of every hit on that page (`data-current` on the current
 * hit's). It is `pointer-events: none`: presses go to the overlay and the tools underneath.
 *
 * A page redraws when it mounts, when its transform changes, and when the hits on it or the
 * current hit change; a scan that finds hits on other pages leaves it alone.
 */
import type { SearchController } from './controller'
import type { Quad } from '../../model/geometry'
import type { SearchHit } from '../../model/search'
import type { PageLayers } from '../plugins/layer'
import type { PageTransform } from '../transform'

/** The highlights of one viewer's pages; see `createSearchHighlights`. */
export interface SearchHighlights {
  mount(page: number, host: HTMLElement, transform: PageTransform): PageLayers
  /** Stops following the controller. Pages still mounted keep their highlights until they unmount. */
  destroy(): void
}

interface MountedPage {
  el: HTMLElement
  transform: PageTransform
  /** What the layer shows now, to skip a redraw when nothing on this page changed. */
  hits: readonly SearchHit[]
  current: SearchHit | undefined
}

const NO_HITS: readonly SearchHit[] = []

/** One box over the quad: its CSS bounding box, clipped to the quad when it is not upright. */
function hitBox(doc: Document, t: PageTransform, quad: Quad): HTMLElement {
  const { p1, p2, p3, p4 } = t.toCssQuad(quad)
  const xs = [p1.x, p2.x, p3.x, p4.x]
  const ys = [p1.y, p2.y, p3.y, p4.y]
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const width = Math.max(...xs) - left
  const height = Math.max(...ys) - top
  const el = doc.createElement('div')
  el.dataset.searchHit = ''
  let css = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;`
  const upright =
    Math.abs(p1.y - p2.y) < 0.01 && Math.abs(p3.y - p4.y) < 0.01
      ? true
      : Math.abs(p1.x - p2.x) < 0.01 && Math.abs(p3.x - p4.x) < 0.01
  if (!upright && width > 0 && height > 0) {
    const pt = (p: { x: number; y: number }) =>
      `${(((p.x - left) / width) * 100).toFixed(3)}% ${(((p.y - top) / height) * 100).toFixed(3)}%`
    css += `clip-path:polygon(${[p1, p2, p4, p3].map(pt).join(',')});`
  }
  el.style.cssText = css
  return el
}

export function createSearchHighlights(
  search: Pick<SearchController, 'state'>
): SearchHighlights {
  const pages = new Map<number, MountedPage>()

  const sameHits = (a: readonly SearchHit[], b: readonly SearchHit[]): boolean =>
    a.length === b.length && a.every((hit, i) => hit === b[i])

  const draw = (page: MountedPage, force: boolean, hits: readonly SearchHit[]) => {
    const { current: index, hits: all } = search.state.get()
    const current = all[index]
    const shown = current && hits.includes(current) ? current : undefined
    if (!force && sameHits(page.hits, hits) && page.current === shown) return
    page.hits = hits
    page.current = shown
    const doc = page.el.ownerDocument
    page.el.replaceChildren(
      ...hits.flatMap((hit) =>
        hit.quads.map((quad) => {
          const box = hitBox(doc, page.transform, quad)
          if (hit === shown) box.dataset.current = ''
          return box
        })
      )
    )
  }

  /** The hits on each mounted page, in one pass over the state's hits. */
  const forMounted = (): Map<number, SearchHit[]> => {
    const byPage = new Map<number, SearchHit[]>()
    for (const hit of search.state.get().hits) {
      if (!pages.has(hit.page)) continue
      const list = byPage.get(hit.page)
      if (list) list.push(hit)
      else byPage.set(hit.page, [hit])
    }
    return byPage
  }

  const stop = search.state.subscribe(() => {
    if (pages.size === 0) return
    const byPage = forMounted()
    for (const [index, page] of pages) draw(page, false, byPage.get(index) ?? NO_HITS)
  })

  return {
    mount(index, host, transform) {
      const el = host.ownerDocument.createElement('div')
      el.className = 'ink-search-layer'
      el.dataset.inkSearchLayer = ''
      el.setAttribute('aria-hidden', 'true')
      el.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
      const overlay = host.querySelector(':scope > .ink-overlay')
      host.insertBefore(el, overlay)
      const page: MountedPage = { el, transform, hits: NO_HITS, current: undefined }
      pages.set(index, page)
      const own = search.state.get().hits.filter((hit) => hit.page === index)
      draw(page, true, own.length > 0 ? own : NO_HITS)
      return {
        update(next) {
          page.transform = next
          draw(page, true, page.hits)
        },
        destroy() {
          if (pages.get(index) === page) pages.delete(index)
          el.remove()
        },
      }
    },
    destroy: stop,
  }
}
