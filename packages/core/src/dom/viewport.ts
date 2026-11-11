/*
 * Inline styles. The headless DOM layer sets only what it cannot work without:
 * - container: `overflow: auto`, and `position: relative` when its computed position is static;
 * - container: `touch-action: pan-x pan-y` unless `pinchZoom` is false, so one finger still
 *   scrolls natively but a pinch zooms the document rather than the page (the tool controller
 *   turns off one-finger panning on the pages element while a drag tool is ready);
 * - pages element: `position: relative`, plus `width`/`height` from the layout, and a
 *   `transform` (with its origin and, as it settles, a `transition`) while a pinch is previewed;
 * - page hosts: `position: absolute` and `left`/`top`/`width`/`height` from the layout;
 * - page hosts: the `--scale-factor` (zoom) and `--total-scale-factor` (zoom × /UserUnit)
 *   custom properties.
 * Nothing cosmetic (colours, borders, backgrounds, fonts) is ever set inline; that belongs to
 * the stylesheet. `destroy()` restores the container's overflow, position and touch-action.
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
import {
  attachTouchPinch,
  attachTrackpadPinch,
  createZoomPreview,
  type PinchFrame,
  type ZoomPreview,
} from './pinch'
import { createPageTransform, type PageTransform, type ViewRotation } from './transform'

import type { Destination } from '../model/destination'
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
  /**
   * Zoom the document when two fingers pinch over the container. Default `true`. When false the
   * viewport leaves `touch-action` alone and the browser zooms the page as it would anyway.
   */
  pinchZoom?: boolean
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
  scrollToRect(page: number, rect: Rect, opts?: { behavior?: ScrollBehavior }): void
  /**
   * Scrolls to a PDF destination without touching zoom. The destination's own zoom is ignored.
   * `xyz` puts (`left`, `top`) at the container's top-left; a missing `left` keeps the horizontal
   * scroll and a missing `top` lands at the page top as `scrollToPage` does. `fith`/`fitbh` put
   * `top` at the top, `fitv`/`fitbv` put `left` at the left, `fitr` centres the rect (always
   * scrolling), and `fit`/`fitb` act as `scrollToPage`. Single-page mode switches page first.
   * "Top" and "left" are those of the converted point, so a rotated page is framed as it looks.
   */
  scrollToDestination(dest: Destination, opts?: { behavior?: ScrollBehavior }): void
  /**
   * The layout-space CSS y (measured from the pages element, as `readingLine` is) that
   * `scrollToDestination` puts at the container's top. `undefined` when the page has no box
   * (another page in single-page mode, or out of range).
   */
  destinationY(dest: Destination): number | undefined
  /**
   * Layout-space CSS y of the line one third down the visible area:
   * `scrollTop + clientHeight / 3`, less where the pages element starts. Compare it with
   * `destinationY` to tell which destination the reader has reached. Updates on scroll, resize
   * and layout.
   */
  readonly readingLine: Readable<number>
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
  const readingLine = writable(0)
  const mounted = writable<readonly number[]>([])
  const layout = writable<CssLayout>({ boxes: [], width: 0, height: 0 })

  const previousStyle = {
    overflow: container.style.overflow,
    position: container.style.position,
    touchAction: container.style.touchAction,
  }
  container.dataset.inkViewport = ''
  container.style.overflow = 'auto'
  const pinchZoom = opts.pinchZoom ?? true
  if (pinchZoom) container.style.touchAction = 'pan-x pan-y'
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
    readingLine.set(top + container.clientHeight / 3)
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

  /**
   * Absolute container scroll positions that frame `dest`, or `undefined` when its page has no
   * box. No `left` means "leave the horizontal scroll where it is". Shared by
   * `scrollToDestination` and `destinationY` so they cannot disagree.
   */
  function destinationScroll(
    dest: Destination
  ): { top: number; left?: number } | undefined {
    const box = boxFor(dest.page)
    if (!box) return undefined
    const t = transformFor(dest.page)
    const at = origin()
    const pageTop = mode.get() === 'single' ? 0 : Math.max(0, at.y + box.top - gap)
    const absTop = (css: number): number => Math.max(0, at.y + box.top + css)
    const absLeft = (css: number): number => Math.max(0, at.x + box.left + css)
    // Under /Rotate a CSS axis follows the other user axis, so a CSS axis is only known when
    // every user coordinate it depends on was given.
    const known = (
      x: number | undefined,
      y: number | undefined
    ): { top?: number; left?: number } => {
      const o = t.toCss({ x: 0, y: 0 })
      const dx = t.toCss({ x: 1, y: 0 })
      const dy = t.toCss({ x: 0, y: 1 })
      const p = t.toCss({ x: x ?? 0, y: y ?? 0 })
      const r: { top?: number; left?: number } = {}
      if ((x !== undefined || dx.y === o.y) && (y !== undefined || dy.y === o.y))
        r.top = p.y
      if ((x !== undefined || dx.x === o.x) && (y !== undefined || dy.x === o.x))
        r.left = p.x
      return r
    }
    switch (dest.fit) {
      case 'xyz': {
        const c = known(dest.left, dest.top)
        const r: { top: number; left?: number } = {
          top: c.top === undefined ? pageTop : absTop(c.top),
        }
        if (c.left !== undefined) r.left = absLeft(c.left)
        return r
      }
      case 'fith':
      case 'fitbh': {
        const c = known(undefined, dest.top)
        return { top: c.top === undefined ? pageTop : absTop(c.top) }
      }
      case 'fitv':
      case 'fitbv': {
        const c = known(dest.left, undefined)
        const r: { top: number; left?: number } = { top: pageTop }
        if (c.left !== undefined) r.left = absLeft(c.left)
        return r
      }
      case 'fitr': {
        const css = t.toCssRect(dest.rect)
        return {
          top: Math.max(
            0,
            at.y + box.top + css.top - (container.clientHeight - css.height) / 2
          ),
          left: Math.max(
            0,
            at.x + box.left + css.left - (container.clientWidth - css.width) / 2
          ),
        }
      }
      default:
        return { top: pageTop }
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

  /** The page and user-space point under `anchor` (container-relative), from the current layout. */
  function userAt(anchor: Point): { page: number; user: Point } | undefined {
    const o = origin()
    const x = container.scrollLeft + anchor.x - o.x
    const y = container.scrollTop + anchor.y - o.y
    const box = anchorBox(layout.get(), y)
    if (!box) return undefined
    return {
      page: box.index,
      user: transformFor(box.index).fromCss({ x: x - box.left, y: y - box.top }),
    }
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
    const at = userAt(anchor)
    change()
    relayout()
    if (!at) return
    const box = boxFor(at.page)
    if (!box) return
    const after = transformFor(at.page).toCss(at.user)
    const o = origin()
    container.scrollLeft = o.x + box.left + after.x - anchor.x
    container.scrollTop = o.y + box.top + after.y - anchor.y
    sync()
  }

  /**
   * The translation a pinch preview applies, from the current layout. While the zoomed pages
   * would still be narrower than the container, the committed layout centres them (and leaves
   * nothing to scroll sideways), so the preview puts them there instead of following the fingers.
   */
  function previewPan(factor: number, anchor: Point, pan: Point): Point {
    const l = layout.get()
    const widest = l.boxes.reduce((max, b) => Math.max(max, b.width), 0)
    const inner = innerSize().width
    if (widest * factor >= inner) return pan
    // The pages' centre line in the preview, and where the committed layout will put it, both
    // container-relative: the scale is around the anchor, in the pages element's coordinates.
    const o = origin()
    const ox = anchor.x + container.scrollLeft - o.x
    const shown = o.x - container.scrollLeft + ox + (l.width / 2 - ox) * factor + pan.x
    const centred = o.x + inner / 2
    return { x: pan.x + centred - shown, y: pan.y }
  }

  /**
   * Ends a pinch: one zoom change around the point that started between the fingers, then any
   * travel the touch pinch could not scroll as it went (all of it, for a trackpad pinch) as a
   * scroll, so that point ends up where the preview last showed it.
   * When the scroll's edges stop it getting there, the preview eases the difference out. A
   * pinch that did not zoom changes no zoom, so a fit mode stays: a two-finger pan only
   * scrolls, and a two-finger tap changes nothing.
   */
  function commitPinch(frame: PinchFrame): void {
    if (destroyed) return
    const zoomed = Math.abs(frame.factor - 1) >= 0.001
    if (!zoomed && Math.hypot(frame.pan.x, frame.pan.y) < 1) return
    const at = userAt(frame.anchor)
    const shown = previewPan(frame.factor, frame.anchor, frame.pan)
    if (zoomed) withAnchor(frame.anchor, () => zoom.set(clamp(frame.zoom)))
    container.scrollLeft -= frame.pan.x
    container.scrollTop -= frame.pan.y
    sync()
    const box = at && boxFor(at.page)
    if (!at || !box) return
    const css = transformFor(at.page).toCss(at.user)
    const o = origin()
    const actual = {
      x: o.x + box.left + css.x - container.scrollLeft,
      y: o.y + box.top + css.y - container.scrollTop,
    }
    const dx = frame.anchor.x + shown.x - actual.x
    const dy = frame.anchor.y + shown.y - actual.y
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) preview?.settle({ x: dx, y: dy })
  }

  const basePreview = pinchZoom ? createZoomPreview(container, pagesEl) : undefined
  const preview: ZoomPreview | undefined = basePreview && {
    ...basePreview,
    show: (factor, anchor, pan) =>
      basePreview.show(factor, anchor, previewPan(factor, anchor, pan)),
  }
  const pinch = preview
    ? attachTouchPinch({
        container,
        preview,
        scale: () => scale.get(),
        minZoom,
        maxZoom,
        scrollBy: (delta) => {
          const { scrollLeft, scrollTop } = container
          // Instant whatever the host's scroll-behavior: a smooth scroll would still be at the
          // old position when read back, and the next move would ask for the same travel again.
          container.scrollTo({
            left: scrollLeft - delta.x,
            top: scrollTop - delta.y,
            behavior: 'instant',
          })
          return {
            x: scrollLeft - container.scrollLeft,
            y: scrollTop - container.scrollTop,
          }
        },
        commit: commitPinch,
      })
    : undefined
  const trackpadPinch = preview
    ? attachTrackpadPinch({
        container,
        preview,
        scale: () => scale.get(),
        minZoom,
        maxZoom,
        commit: commitPinch,
      })
    : undefined

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
      // Catch up with a scroll whose frame has not run yet, then keep that page: relayout()
      // re-derives the current page from the scroll position, which the new mode changes.
      if (mode.get() === 'continuous') sync()
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
        // Also relayout when the layout shows another page, even if currentPage already matches.
        if (page !== currentPage.get() || layout.get().boxes[0]?.index !== page) {
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
    scrollToRect(page, rect, o) {
      if (mode.get() === 'single' && currentPage.get() !== page) {
        currentPage.set(page)
        relayout()
      }
      const box = boxFor(page)
      if (!box) return
      const css = transformFor(page).toCssRect(rect)
      const at = origin()
      const to: ScrollToOptions = { behavior: o?.behavior ?? 'auto' }
      const top = at.y + box.top + css.top
      if (
        top < container.scrollTop ||
        top + css.height > container.scrollTop + container.clientHeight
      ) {
        to.top = Math.max(0, top - (container.clientHeight - css.height) / 2)
      }
      const left = at.x + box.left + css.left
      if (
        left < container.scrollLeft ||
        left + css.width > container.scrollLeft + container.clientWidth
      ) {
        to.left = Math.max(0, left - (container.clientWidth - css.width) / 2)
      }
      if (to.top !== undefined || to.left !== undefined) container.scrollTo(to)
      sync()
    },
    scrollToDestination(dest, o) {
      // Destinations come from untrusted files: a page that does not exist moves nothing.
      if (!Number.isInteger(dest.page) || dest.page < 0 || dest.page >= doc.pages.length)
        return
      if (mode.get() === 'single' && currentPage.get() !== dest.page) {
        currentPage.set(dest.page)
        relayout()
      }
      const to = destinationScroll(dest)
      if (!to) return
      const scroll: ScrollToOptions = { top: to.top, behavior: o?.behavior ?? 'auto' }
      if (to.left !== undefined) scroll.left = to.left
      container.scrollTo(scroll)
      sync()
    },
    destinationY(dest) {
      const to = destinationScroll(dest)
      return to ? to.top - origin().y : undefined
    },
    readingLine: readonly(readingLine),
    transformFor,
    hostFor: (page) => hosts.get(page),
    pageAtCss,
    destroy() {
      if (destroyed) return
      destroyed = true
      pinch?.destroy()
      trackpadPinch?.destroy()
      preview?.destroy()
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
      container.style.touchAction = previousStyle.touchAction
    },
  }

  relayout()
  return viewport
}
