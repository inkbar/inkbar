/*
 * Inline styles. The headless DOM layer sets only what it cannot work without:
 * - container: `overflow: auto`, and `position: relative` when its computed position is static;
 * - pages element: `position: relative`, plus `width`/`height` from the layout;
 * - page hosts: `position: absolute` and `left`/`top`/`width`/`height` from the layout;
 * - page hosts: the `--scale-factor` (zoom) and `--total-scale-factor` (zoom × /UserUnit)
 *   custom properties.
 * Nothing cosmetic (colours, borders, backgrounds, fonts) is ever set inline; that belongs to
 * the stylesheet. `destroy()` restores the container's overflow and position.
 */
import { readonly, writable, type Readable } from '../model/readable'

import {
  computeCssLayout,
  fitZoomCss,
  mostVisiblePageCss,
  visibleRangeCss,
  type CssLayout,
  type CssPageBox,
  type LayoutMode,
} from './layout'
import { createPageTransform, type PageTransform, type ViewRotation } from './transform'

import type { InkDocument } from '../model/document'
import type { Point, Rect } from '../model/geometry'

export type ZoomValue = number | 'fit-width' | 'fit-page'

export interface ViewportOptions {
  container: HTMLElement
  document: InkDocument
  /** Default `'fit-width'`. */
  zoom?: ZoomValue
  /** Default `'continuous'`. */
  mode?: LayoutMode
  /** Default 0. */
  rotation?: ViewRotation
  /** Gap between pages, and the page padding used by fit modes, CSS px. Default 16. */
  gap?: number
  /** Pages to keep mounted either side of the visible range. Default 2. */
  buffer?: number
  /** Default 0.1. */
  minZoom?: number
  /** Default 8. */
  maxZoom?: number
  onMount(page: number, host: HTMLElement, transform: PageTransform): void
  onUpdate(page: number, host: HTMLElement, transform: PageTransform): void
  onUnmount(page: number, host: HTMLElement): void
}

/** The mounted page under a client point. The tools layer adds `user` and `css` (`PageHit`). */
export interface ViewportHit {
  page: number
  host: HTMLElement
  transform: PageTransform
}

export interface Viewport {
  readonly zoom: Readable<ZoomValue>
  /** Effective numeric zoom, with fit modes resolved. */
  readonly scale: Readable<number>
  readonly currentPage: Readable<number>
  readonly mounted: Readable<readonly number[]>
  readonly layout: Readable<CssLayout>
  readonly rotation: Readable<ViewRotation>
  readonly mode: Readable<LayoutMode>
  /** `anchorCss` is relative to the container's top-left inside its border, CSS px; defaults to its centre. */
  setZoom(zoom: ZoomValue, anchorCss?: Point): void
  zoomBy(factor: number, anchorCss?: Point): void
  setMode(mode: LayoutMode): void
  setRotation(rotation: ViewRotation): void
  scrollToPage(index: number, opts?: { behavior?: ScrollBehavior }): void
  /** Scrolls so `rect` (user space on `page`) is visible, centring it when it was not. */
  scrollToRect(page: number, rect: Rect): void
  transformFor(page: number): PageTransform
  hostFor(page: number): HTMLElement | undefined
  /** The mounted page under a viewport (client) point, if any. */
  pageAtCss(clientX: number, clientY: number): ViewportHit | undefined
  destroy(): void
}

function sameList(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export function createViewport(opts: ViewportOptions): Viewport {
  const { container, document: doc } = opts
  const gap = opts.gap ?? 16
  const buffer = opts.buffer ?? 2
  const minZoom = opts.minZoom ?? 0.1
  const maxZoom = opts.maxZoom ?? 8
  const clamp = (z: number): number => Math.min(maxZoom, Math.max(minZoom, z))

  const zoom = writable<ZoomValue>(
    typeof opts.zoom === 'number' ? clamp(opts.zoom) : (opts.zoom ?? 'fit-width')
  )
  const scale = writable(1)
  const rotation = writable<ViewRotation>(opts.rotation ?? 0)
  const mode = writable<LayoutMode>(opts.mode ?? 'continuous')
  const currentPage = writable(0)
  const mounted = writable<readonly number[]>([])
  const layout = writable<CssLayout>({ boxes: [], width: 0, height: 0 })

  const previousStyle = {
    overflow: container.style.overflow,
    position: container.style.position,
  }
  container.dataset.inkViewport = ''
  container.style.overflow = 'auto'
  if (getComputedStyle(container).position === 'static')
    container.style.position = 'relative'

  const pagesEl = container.ownerDocument.createElement('div')
  pagesEl.className = 'ink-pages'
  pagesEl.dataset.inkPages = ''
  pagesEl.style.position = 'relative'
  container.append(pagesEl)

  const hosts = new Map<number, HTMLElement>()
  const transforms = new Map<number, PageTransform>()
  let lastSize = { width: -1, height: -1 }
  let destroyed = false

  function boxFor(page: number, l = layout.get()): CssPageBox | undefined {
    return l.boxes.find((b) => b.index === page)
  }

  /** Where the pages element starts inside the container's scrollable content (its padding). */
  function origin(): Point {
    return { x: pagesEl.offsetLeft, y: pagesEl.offsetTop }
  }

  /** The container's content box, CSS px: client size less padding. The pages element sits inside it. */
  function innerSize(): { width: number; height: number } {
    const cs = getComputedStyle(container)
    const px = (v: string): number => Number.parseFloat(v) || 0
    return {
      width: container.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight),
      height: container.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom),
    }
  }

  function resolveScale(): number {
    const z = zoom.get()
    if (typeof z === 'number') return clamp(z)
    const page = doc.pages[currentPage.get()] ?? doc.pages[0]
    if (!page) return 1
    return clamp(fitZoomCss(page, rotation.get(), innerSize(), z, gap))
  }

  function transformFor(page: number): PageTransform {
    let t = transforms.get(page)
    if (!t) {
      const info = doc.pages[page]
      if (!info) throw new RangeError(`page ${page} out of range`)
      t = createPageTransform(info, scale.get(), rotation.get())
      transforms.set(page, t)
    }
    return t
  }

  function layoutOnce(): void {
    scale.set(resolveScale())
    transforms.clear()
    const l = computeCssLayout({
      pages: doc.pages,
      zoom: scale.get(),
      rotation: rotation.get(),
      gap,
      mode: mode.get(),
      current: currentPage.get(),
      containerWidth: innerSize().width,
    })
    pagesEl.style.width = `${l.width}px`
    pagesEl.style.height = `${l.height}px`
    layout.set(l)
  }

  /**
   * Recomputes the layout. Sizing the pages element can add or remove a scrollbar, which
   * changes the client width the layout (and a fit zoom) was based on, so it runs again
   * once when that happens.
   */
  function relayout(): void {
    const width = container.clientWidth
    layoutOnce()
    if (container.clientWidth !== width) layoutOnce()
    lastSize = { width: container.clientWidth, height: container.clientHeight }
    const l = layout.get()
    for (const [page, host] of hosts) {
      if (!boxFor(page, l)) continue
      place(page, host, l)
      opts.onUpdate(page, host, transformFor(page))
    }
    sync()
  }

  function place(page: number, host: HTMLElement, l: CssLayout): void {
    const box = boxFor(page, l)
    if (!box) return
    const t = transformFor(page)
    host.style.left = `${box.left}px`
    host.style.top = `${box.top}px`
    host.style.width = `${t.cssWidth}px`
    host.style.height = `${t.cssHeight}px`
    // As in PDF.js's viewer: --scale-factor is the zoom, --total-scale-factor also folds in
    // /UserUnit (pdf_viewer.css: calc(var(--scale-factor) * var(--user-unit))).
    host.style.setProperty('--scale-factor', String(t.zoom))
    host.style.setProperty('--total-scale-factor', String(t.scale))
    host.dataset.rotation = String(t.totalRotation)
  }

  /** Mounts and unmounts hosts for the scroll position, and updates the current page. */
  function sync(): void {
    if (destroyed) return
    const l = layout.get()
    const top = container.scrollTop - origin().y
    const wanted = visibleRangeCss(l, top, container.clientHeight, buffer)
    const wantedSet = new Set(wanted)
    for (const [page, host] of [...hosts]) {
      if (wantedSet.has(page)) continue
      hosts.delete(page)
      opts.onUnmount(page, host)
      host.remove()
    }
    for (const page of wanted) {
      if (hosts.has(page)) continue
      const host = container.ownerDocument.createElement('div')
      host.className = 'ink-page'
      host.dataset.page = String(page)
      host.style.position = 'absolute'
      place(page, host, l)
      hosts.set(page, host)
      pagesEl.append(host)
      opts.onMount(page, host, transformFor(page))
    }
    if (!sameList(mounted.get(), wanted)) mounted.set(wanted)
    if (mode.get() === 'continuous') {
      currentPage.set(mostVisiblePageCss(l, top, container.clientHeight))
    }
  }

  let scrollFrame = 0
  const onScroll = (): void => {
    if (scrollFrame) return
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0
      sync()
    })
  }
  container.addEventListener('scroll', onScroll, { passive: true })

  const ro = new ResizeObserver(() => {
    if (destroyed) return
    if (
      container.clientWidth === lastSize.width &&
      container.clientHeight === lastSize.height
    ) {
      return
    }
    withAnchor(undefined, () => undefined)
  })
  ro.observe(container)

  function pageAtCss(clientX: number, clientY: number): ViewportHit | undefined {
    for (const [page, host] of hosts) {
      const r = host.getBoundingClientRect()
      if (
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      ) {
        return { page, host, transform: transformFor(page) }
      }
    }
    return undefined
  }

  /**
   * The page box an anchor at layout-space `y` belongs to: the one whose vertical span
   * contains it, otherwise the nearest one (an anchor in a gap or past either end).
   */
  function anchorBox(l: CssLayout, y: number): CssPageBox | undefined {
    let best: CssPageBox | undefined
    let bestDistance = Infinity
    for (const b of l.boxes) {
      const distance =
        y < b.top ? b.top - y : y > b.top + b.height ? y - b.top - b.height : 0
      if (distance < bestDistance) {
        best = b
        bestDistance = distance
      }
    }
    return best
  }

  /**
   * Keeps the user-space point under `anchorCss` still while `change` alters the layout.
   * The anchor is taken in layout space, so it holds in the margins and gaps too: there it
   * is extrapolated from the nearest page's transform, which is affine, so the point maps
   * back exactly. The browser may still clamp the scroll at the content edges.
   */
  function withAnchor(anchorCss: Point | undefined, change: () => void): void {
    const anchor = anchorCss ?? {
      x: container.clientWidth / 2,
      y: container.clientHeight / 2,
    }
    // Read everything from the old layout before relayout() clears the cached transforms.
    const o = origin()
    const x = container.scrollLeft + anchor.x - o.x
    const y = container.scrollTop + anchor.y - o.y
    const old = anchorBox(layout.get(), y)
    const user = old
      ? transformFor(old.index).fromCss({ x: x - old.left, y: y - old.top })
      : undefined
    change()
    relayout()
    if (!old || !user) return
    const box = boxFor(old.index)
    if (!box) return
    const after = transformFor(old.index).toCss(user)
    const o2 = origin()
    container.scrollLeft = o2.x + box.left + after.x - anchor.x
    container.scrollTop = o2.y + box.top + after.y - anchor.y
    sync()
  }

  const viewport: Viewport = {
    zoom: readonly(zoom),
    scale: readonly(scale),
    currentPage: readonly(currentPage),
    mounted: readonly(mounted),
    layout: readonly(layout),
    rotation: readonly(rotation),
    mode: readonly(mode),
    setZoom(z, anchorCss) {
      withAnchor(anchorCss, () => zoom.set(typeof z === 'number' ? clamp(z) : z))
    },
    zoomBy(factor, anchorCss) {
      viewport.setZoom(clamp(scale.get() * factor), anchorCss)
    },
    setMode(m) {
      if (m === mode.get()) return
      // relayout() re-derives the current page from the old scroll position; keep the selection.
      const page = currentPage.get()
      mode.set(m)
      relayout()
      viewport.scrollToPage(page)
    },
    setRotation(r) {
      withAnchor(undefined, () => rotation.set(r))
    },
    scrollToPage(index, o) {
      const page = Math.max(0, Math.min(doc.pages.length - 1, index))
      const behavior = o?.behavior ?? 'auto'
      if (mode.get() === 'single') {
        if (page !== currentPage.get()) {
          currentPage.set(page)
          relayout()
        }
        container.scrollTo({ top: 0, behavior })
        sync()
        return
      }
      const box = boxFor(page)
      if (!box) return
      container.scrollTo({ top: Math.max(0, origin().y + box.top - gap), behavior })
      sync()
    },
    scrollToRect(page, rect) {
      if (mode.get() === 'single' && currentPage.get() !== page) {
        currentPage.set(page)
        relayout()
      }
      const box = boxFor(page)
      if (!box) return
      const css = transformFor(page).toCssRect(rect)
      const o = origin()
      const top = o.y + box.top + css.top
      if (
        top < container.scrollTop ||
        top + css.height > container.scrollTop + container.clientHeight
      ) {
        container.scrollTop = Math.max(0, top - (container.clientHeight - css.height) / 2)
      }
      const left = o.x + box.left + css.left
      if (
        left < container.scrollLeft ||
        left + css.width > container.scrollLeft + container.clientWidth
      ) {
        container.scrollLeft = Math.max(0, left - (container.clientWidth - css.width) / 2)
      }
      sync()
    },
    transformFor,
    hostFor: (page) => hosts.get(page),
    pageAtCss,
    destroy() {
      if (destroyed) return
      destroyed = true
      ro.disconnect()
      container.removeEventListener('scroll', onScroll)
      if (scrollFrame) cancelAnimationFrame(scrollFrame)
      for (const [page, host] of hosts) {
        opts.onUnmount(page, host)
        host.remove()
      }
      hosts.clear()
      transforms.clear()
      pagesEl.remove()
      delete container.dataset.inkViewport
      container.style.overflow = previousStyle.overflow
      container.style.position = previousStyle.position
    },
  }

  relayout()
  return viewport
}
