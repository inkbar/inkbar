/*
 * A list of page thumbnails: a button per page that scrolls the viewport there, the current
 * page marked and kept in view. The controller holds the state, keys and windowing for
 * `createThumbnails` and for the bindings' components, which render their own items from
 * `state` and mount a `createThumbnailPainter` in each.
 *
 * Virtualised: each item's height is known from its page's size, so the controller gives the
 * `offsets` of every item and the `window` of items near the visible part of the scroller. Only
 * those are mounted; the rest of the list is an empty spacer of the total height.
 *
 * Focus: one Tab stop (roving tabindex), on the item last focused while focus is in the list,
 * else the current page's, else the first visible item. When the focused item leaves the
 * window because the list scrolled away from it, focus moves, without scrolling, to the same
 * page's item if it is mounted again, else to the first visible item. Keys that move to an
 * item outside the window mount it first, then focus it.
 */
import { readonly, writable, type Readable } from '../../model/readable'
import {
  messagesOf,
  onViewerDestroy,
  pluginHostOf,
  type Viewer,
} from '../viewer/create-viewer'
import { h } from '../viewer/dom'

import {
  createThumbnailPainter,
  THUMBNAIL_WIDTH,
  thumbnailSize,
  thumbnailWidthFor,
  type ThumbnailDeps,
  type ThumbnailPainter,
} from './thumbnail'

import type { InkDocument } from '../../model/document'
import type { Viewport } from '../viewport'

/** Space around the thumbnails in CSS px: each side, above the first, after each number and below the last. */
const GUTTER = 16

/** Height an item adds to its thumbnail, in CSS px: the gutter above it, the gap and its 16px number. */
const ITEM_CHROME = GUTTER + 6 + 16

/** Items mounted beyond each end of the visible ones. */
const OVERSCAN = 3

/** How long after a user scroll of the list it stops following the current page. */
const USER_SCROLL_MS = 1000

const ITEM = '[data-ink-thumbnail-item]'

export interface ThumbnailsDeps extends ThumbnailDeps {
  /** The viewport whose current page the list follows; null while none is mounted. */
  viewport: Readable<Viewport | null>
}

export interface ThumbnailsOptions {
  /** Zero-based pages to list, in this order. Default: every page. Missing pages and repeats are dropped. */
  pages?: readonly number[] | undefined
  /**
   * Thumbnail width in CSS pixels. Default: the list's width less a 16px gutter on each side,
   * following the list as it resizes. Until the list is attached and shown, the default is
   * `--ink-thumbnail-width` as computed on the list (px values only), else `THUMBNAIL_WIDTH`.
   */
  width?: number | undefined
  /** Draw each page's annotations. Default true. */
  annotations?: boolean | undefined
  /** Draw plugin marks. Default true. */
  marks?: boolean | undefined
}

export interface ThumbnailsState {
  /** What is listed: zero-based pages, in list order. */
  pages: readonly number[]
  /** The viewport's current page, -1 with no viewport. */
  current: number
  /** Indexes into `pages` to mount, `end` exclusive. Empty until `attach`. */
  window: { start: number; end: number }
  /** Top of each item in CSS px from the top of the list; the last entry is the total height. */
  offsets: readonly number[]
  /** The width each thumbnail is drawn at, in CSS px: `width`, else the measured fit. */
  width: number
}

export interface ThumbnailsController {
  readonly state: Readable<ThumbnailsState>
  /** Applies changed options; the others stay as they were. */
  update(opts: Partial<ThumbnailsOptions>): void
  /**
   * Binds the list's scroll element: the element that scrolls, with item `i` positioned at
   * `offsets[i]` from the top of its content. Follows its scrolling and size to move the
   * window, and handles clicks, keys and the Tab stop over `[data-ink-thumbnail-item]` buttons
   * inside it (`data-ink-thumbnail-item` is the page). It sets the items' `tabindex`: don't
   * render one. Attaching another element unbinds the previous one. Returns the unbind.
   */
  attach(scroller: HTMLElement): () => void
  /**
   * The attributes of the list item wrapping item `index` (into `pages`): `role="listitem"`
   * and, as only the window is mounted, `aria-setsize` and `aria-posinset` for its place in
   * the whole list.
   */
  itemAttrs(index: number): Record<string, string>
  /** Scrolls the viewport to `page`. */
  activate(page: number): void
  destroy(): void
}

const sameNumbers = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((n, i) => n === b[i])

/** The pages to list from `doc`: `wanted` without missing pages and repeats, else all. */
function pagesFor(
  doc: InkDocument | null,
  wanted: readonly number[] | undefined
): number[] {
  if (!doc) return []
  const count = doc.pages.length
  if (!wanted) return Array.from({ length: count }, (_, i) => i)
  const seen = new Set<number>()
  return wanted.filter((p) => {
    if (!Number.isInteger(p) || p < 0 || p >= count || seen.has(p)) return false
    seen.add(p)
    return true
  })
}

export function createThumbnailsController(
  deps: ThumbnailsDeps,
  initial: ThumbnailsOptions = {}
): ThumbnailsController {
  let opts: ThumbnailsOptions = { ...initial }
  /** The list's width less its gutters, once measured; null before. */
  let fitted: number | null = null
  /** `--ink-thumbnail-width` on the list, read on attach and resize; the width before a fit. */
  let token = THUMBNAIL_WIDTH
  const thumbWidth = (): number => opts.width ?? fitted ?? token
  let doc = deps.document.get()
  let pages: readonly number[] = pagesFor(doc, opts.pages)
  let offsets: readonly number[] = offsetsFor(pages)
  let viewport = deps.viewport.get()
  let current = viewport ? viewport.currentPage.get() : -1
  let destroyed = false

  let scroller: HTMLElement | null = null
  /** The first visible item's index in `pages`, for moving focus that lost its item. */
  let firstVisible = 0
  /** The page holding the Tab stop while the user works in the list. */
  let rove: number | null = null
  /** A page whose item takes focus once mounted. */
  let pendingFocus: number | null = null
  /** A page whose item scrolls into view once mounted. */
  let reveal: number | null = null
  /** When the user last scrolled the list. */
  let userScrolledAt = -Infinity
  /** Set while a scroll of ours is on its way, so its scroll event is not the user's. */
  let ownScroll = false

  const store = writable<ThumbnailsState>({
    pages,
    current,
    window: { start: 0, end: 0 },
    offsets,
    width: thumbWidth(),
  })

  function offsetsFor(list: readonly number[]): number[] {
    const width = thumbWidth()
    const out = [0]
    let top = 0
    for (const p of list) {
      top += thumbnailSize(doc!.pages[p]!, { width }).height + ITEM_CHROME
      out.push(top)
    }
    return out
  }

  /** The part of the list the scroller shows, in list coordinates; empty when none. */
  function visibleRange(el: HTMLElement): { top: number; bottom: number } {
    let top = el.scrollTop
    let bottom = top + el.clientHeight
    const view = el.ownerDocument?.defaultView
    if (view) {
      // A list that does not scroll itself (in a scrolling sidebar) is clipped by the window.
      const boxTop = el.getBoundingClientRect().top + el.clientTop
      const origin = boxTop - el.scrollTop
      top = Math.max(top, -origin)
      bottom = Math.min(bottom, view.innerHeight - origin)
    }
    return { top, bottom }
  }

  /** How many items start before `y` (`strict`) or at or before it. */
  function countBefore(y: number, strict: boolean): number {
    let lo = 0
    let hi = pages.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      const at = offsets[mid]!
      if (strict ? at < y : at <= y) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  function computeWindow(): { start: number; end: number } {
    const n = pages.length
    if (!scroller || n === 0) return { start: 0, end: 0 }
    const { top, bottom } = visibleRange(scroller)
    if (bottom <= top) return { start: 0, end: 0 }
    const first = Math.max(0, countBefore(top, false) - 1)
    const last = countBefore(bottom, true)
    if (last <= first) return { start: 0, end: 0 }
    firstVisible = first
    let start = Math.max(0, first - OVERSCAN)
    let end = Math.min(n, last + OVERSCAN)
    // An item about to be focused, or revealed in a list that does not scroll itself, is
    // mounted wherever the list is scrolled.
    for (const page of [scrollsItself(scroller) ? null : reveal, pendingFocus]) {
      const i = page === null ? -1 : pages.indexOf(page)
      if (i < 0 || (i >= start && i < end)) continue
      start = Math.max(0, i - OVERSCAN)
      end = Math.min(n, i + OVERSCAN + 1)
    }
    return { start, end }
  }

  function publish(): void {
    const before = store.get()
    const win = computeWindow()
    const same = win.start === before.window.start && win.end === before.window.end
    if (
      same &&
      pages === before.pages &&
      offsets === before.offsets &&
      current === before.current &&
      thumbWidth() === before.width
    )
      return
    store.set({
      pages,
      current,
      window: same ? before.window : win,
      offsets,
      width: thumbWidth(),
    })
  }

  /** Recomputes the window and does what waits on mounted items. */
  function refresh(): void {
    if (destroyed) return
    publish()
    flush()
  }

  const itemFor = (page: number): HTMLElement | null =>
    scroller?.querySelector<HTMLElement>(`[data-ink-thumbnail-item="${page}"]`) ?? null

  const pageOf = (el: HTMLElement): number => Number(el.dataset.inkThumbnailItem)

  /** Whether the list is its own scroll container, as opposed to growing in a scrolling parent. */
  const scrollsItself = (el: HTMLElement): boolean => el.scrollHeight > el.clientHeight

  /** Marks the next scroll event as ours. Scroll events run before the frame's callbacks. */
  function markOwnScroll(): void {
    const view = scroller?.ownerDocument?.defaultView
    if (!view) return
    ownScroll = true
    view.requestAnimationFrame(() => {
      ownScroll = false
    })
  }

  /** The page whose item holds the Tab stop. */
  function tabStop(): number | undefined {
    if (rove !== null && pages.includes(rove)) return rove
    if (pages.includes(current)) return current
    return pages[firstVisible]
  }

  function syncTabIndex(): void {
    if (!scroller) return
    const items = [...scroller.querySelectorAll<HTMLElement>(ITEM)]
    const stop = tabStop()
    // With the stop's item unmounted, the first visible one takes it so Tab still enters.
    const holder =
      items.find((el) => pageOf(el) === stop) ??
      items.find((el) => pages.indexOf(pageOf(el)) >= firstVisible) ??
      items[0]
    for (const el of items) {
      const index = el === holder ? 0 : -1
      if (el.tabIndex !== index) el.tabIndex = index
    }
  }

  /** Focuses and reveals the items waiting for their mount, once they are there. */
  function flush(): void {
    if (!scroller) return
    syncTabIndex()
    let moved = false
    if (pendingFocus !== null) {
      const el = itemFor(pendingFocus)
      if (el) {
        pendingFocus = null
        el.focus()
        moved = true
      }
    }
    // A hidden list keeps the reveal for when it shows.
    if (reveal !== null && scroller.clientHeight > 0) {
      const i = pages.indexOf(reveal)
      const el = itemFor(reveal)
      if (i < 0) reveal = null
      else if (scrollsItself(scroller)) {
        // Scrolled from the offsets, so no ancestor (the host page) moves.
        reveal = null
        const view = {
          top: scroller.scrollTop,
          bottom: scroller.scrollTop + scroller.clientHeight,
        }
        const top = offsets[i]!
        const bottom = offsets[i + 1]!
        const to =
          top < view.top
            ? top
            : bottom > view.bottom
              ? Math.min(top, bottom - scroller.clientHeight)
              : null
        if (to !== null) {
          markOwnScroll()
          scroller.scrollTop = to
          moved = true
        }
      } else if (el) {
        // A list that does not scroll itself (in a scrolling sidebar) is revealed by its item.
        reveal = null
        markOwnScroll()
        el.scrollIntoView({ block: 'nearest' })
        moved = true
      }
    }
    // The scroll is done; place the window by it now rather than on the scroll event.
    if (moved) refresh()
  }

  function moveFocus(page: number): void {
    rove = page
    const el = itemFor(page)
    if (el) {
      el.focus()
      return
    }
    pendingFocus = page
    refresh()
  }

  const focusInside = (): boolean => {
    const active = scroller?.ownerDocument?.activeElement
    return !!active && !!scroller?.contains(active)
  }

  function follow(next: number): void {
    if (next === current) return
    current = next
    if (!focusInside()) rove = null
    if (
      scroller &&
      pages.includes(current) &&
      Date.now() - userScrolledAt >= USER_SCROLL_MS
    )
      reveal = current
    refresh()
  }

  let stopCurrent: (() => void) | null = null
  function watchViewport(next: Viewport | null): void {
    stopCurrent?.()
    viewport = next
    stopCurrent = next ? next.currentPage.subscribe(follow) : null
    follow(next ? next.currentPage.get() : -1)
  }

  /**
   * Reads the token and fits the thumbnails to the scroller's width; a hidden scroller keeps
   * the last fit.
   */
  function measure(): void {
    if (!scroller) return
    const width = thumbWidth()
    token = thumbnailWidthFor(scroller)
    if (scroller.clientWidth > 0)
      fitted = Math.max(1, Math.floor(scroller.clientWidth - 2 * GUTTER))
    if (thumbWidth() !== width) relist()
  }

  function relist(): void {
    const next = pagesFor(doc, opts.pages)
    if (!sameNumbers(next, pages)) pages = next
    offsets = offsetsFor(pages)
    if (sameNumbers(offsets, store.get().offsets)) offsets = store.get().offsets
  }

  const stopDocument = deps.document.subscribe((next) => {
    doc = next
    // Another document starts at its top, with nothing carried over.
    rove = null
    pendingFocus = null
    reveal = null
    if (scroller) {
      markOwnScroll()
      scroller.scrollTop = 0
    }
    relist()
    refresh()
  })
  const stopViewport = deps.viewport.subscribe(watchViewport)
  watchViewport(viewport)

  let unbind: (() => void) | null = null

  function attach(el: HTMLElement): () => void {
    unbind?.()
    if (destroyed) return () => undefined
    scroller = el
    // Undefined for a stand-in element with no document (tests outside a browser).
    const owner = el.ownerDocument as Document | undefined
    const view = owner?.defaultView ?? null

    const itemOf = (target: EventTarget | null): HTMLElement | null => {
      const item = target instanceof Element ? target.closest<HTMLElement>(ITEM) : null
      return item && el.contains(item) ? item : null
    }

    /** The focused item, kept to put focus back when it is unmounted. */
    let focused: HTMLElement | null = null
    function checkFocus(): void {
      if (!focused || !owner) return
      const active = owner.activeElement
      if (focused.isConnected) {
        if (!el.contains(active)) focused = null
        return
      }
      const lost = focused
      focused = null
      if (active && active !== owner.body) return
      // The first item starting in view, else the first one partly in view.
      const shown = [...el.querySelectorAll<HTMLElement>(ITEM)].filter(
        (item) => pages.indexOf(pageOf(item)) >= firstVisible
      )
      const { top } = visibleRange(el)
      const target =
        itemFor(pageOf(lost)) ??
        shown.find((item) => offsets[pages.indexOf(pageOf(item))]! >= top) ??
        shown[0]
      if (!target) return
      rove = pageOf(target)
      syncTabIndex()
      target.focus({ preventScroll: true })
    }

    const onScroll = (e: Event): void => {
      const t = e.target
      // The list's own scroll or an ancestor's; the viewport's scrolling is not ours.
      if (t !== owner && !(t instanceof Node && t.contains(el))) return
      // An ancestor's scroll moves the list only when the list does not scroll itself.
      const listMoved = t === el || !scrollsItself(el)
      if (!ownScroll && listMoved) {
        userScrolledAt = Date.now()
        // The user took over: drop what was waiting to be focused or shown.
        pendingFocus = null
        reveal = null
      }
      refresh()
    }
    const onResize = (): void => {
      measure()
      refresh()
    }
    const onFocusIn = (e: FocusEvent): void => {
      const item = itemOf(e.target)
      if (!item) return
      focused = item
      rove = pageOf(item)
      syncTabIndex()
    }
    const onFocusOut = (): void => queueMicrotask(checkFocus)
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const item = itemOf(e.target)
      if (!item) return
      const i = pages.indexOf(pageOf(item))
      if (i < 0) return
      const last = pages.length - 1
      const next =
        e.key === 'ArrowDown' || e.key === 'ArrowRight'
          ? Math.min(last, i + 1)
          : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
            ? Math.max(0, i - 1)
            : e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? last
                : -1
      if (next < 0) return
      e.preventDefault()
      if (next !== i) moveFocus(pages[next]!)
    }
    // Enter and Space reach here as the native button's click.
    const onClick = (e: MouseEvent): void => {
      const item = itemOf(e.target)
      if (!item || (item as HTMLButtonElement).disabled) return
      rove = pageOf(item)
      activate(rove)
    }

    // Items added or removed by any renderer: fix the Tab stop, focus and reveal.
    const touchesItems = (records: MutationRecord[]): boolean =>
      records.some((r) =>
        [...r.addedNodes, ...r.removedNodes].some(
          (node) =>
            node instanceof Element &&
            (node.matches(ITEM) || node.querySelector(ITEM) !== null)
        )
      )
    const mutations =
      view && 'MutationObserver' in view
        ? new view.MutationObserver((records) => {
            if (!touchesItems(records)) return
            flush()
            checkFocus()
          })
        : null
    mutations?.observe(el, { childList: true, subtree: true })
    const resize =
      view && 'ResizeObserver' in view ? new view.ResizeObserver(onResize) : null
    resize?.observe(el)

    const scrollTarget: EventTarget = owner ?? el
    scrollTarget.addEventListener('scroll', onScroll, { capture: true, passive: true })
    view?.addEventListener('resize', onResize)
    el.addEventListener('focusin', onFocusIn)
    el.addEventListener('focusout', onFocusOut)
    el.addEventListener('keydown', onKeyDown)
    el.addEventListener('click', onClick)

    // The list opens on the current page.
    if (pages.includes(current)) reveal = current
    measure()
    refresh()

    const off = (): void => {
      if (unbind !== off) return
      unbind = null
      mutations?.disconnect()
      resize?.disconnect()
      scrollTarget.removeEventListener('scroll', onScroll, { capture: true })
      view?.removeEventListener('resize', onResize)
      el.removeEventListener('focusin', onFocusIn)
      el.removeEventListener('focusout', onFocusOut)
      el.removeEventListener('keydown', onKeyDown)
      el.removeEventListener('click', onClick)
      scroller = null
      pendingFocus = null
      reveal = null
      if (!destroyed) publish()
    }
    unbind = off
    return off
  }

  function activate(page: number): void {
    if (destroyed) return
    viewport?.scrollToPage(page)
  }

  return {
    state: readonly(store),
    update(patch) {
      if (destroyed) return
      const width = thumbWidth()
      const wanted = opts.pages
      opts = { ...opts, ...patch }
      if (thumbWidth() !== width || opts.pages !== wanted) {
        relist()
        refresh()
      }
    },
    attach,
    itemAttrs: (index) => ({
      role: 'listitem',
      'aria-setsize': String(store.get().pages.length),
      'aria-posinset': String(index + 1),
    }),
    activate,
    destroy() {
      if (destroyed) return
      unbind?.()
      destroyed = true
      stopDocument()
      stopViewport()
      stopCurrent?.()
      stopCurrent = null
    },
  }
}

/**
 * A scrolling list of `viewer`'s pages as thumbnails. Give it a height (it fills its parent's)
 * and place it anywhere, a sidebar panel for instance. Each item is a button that scrolls the
 * viewer to its page; the current page is marked and kept in view. It stops when the viewer
 * is destroyed.
 */
export function createThumbnails(
  viewer: Viewer,
  opts: ThumbnailsOptions = {}
): HTMLElement {
  const host = pluginHostOf(viewer)
  const deps: ThumbnailsDeps = {
    document: viewer.document,
    pluginHost: { get: () => host, subscribe: () => () => undefined },
    viewport: viewer.viewport,
    messages: messagesOf(viewer),
  }
  const controller = createThumbnailsController(deps, opts)
  const spacer = h('div', { class: 'ink-thumbnails-spacer', 'aria-hidden': 'true' })
  const root = h(
    'div',
    { class: 'ink-thumbnails', 'data-ink-thumbnails': '', role: 'list' },
    spacer
  )

  interface Item {
    entry: HTMLElement
    button: HTMLButtonElement
    painter: ThumbnailPainter
    width: number
  }
  const mounted = new Map<number, Item>()

  function mount(page: number, width: number): Item {
    const thumb = h('div')
    const button = h(
      'button',
      {
        type: 'button',
        class: 'ink-thumbnails-item',
        'data-ink-thumbnail-item': String(page),
      },
      thumb,
      // The thumbnail names the button "Page N"; the visible number repeats it.
      h(
        'span',
        { class: 'ink-thumbnails-label', 'aria-hidden': 'true' },
        String(page + 1)
      )
    )
    // `render` gives it the controller's item attributes, its role included.
    const entry = h('div', { class: 'ink-thumbnails-entry' }, button)
    const painter = createThumbnailPainter(thumb, deps, {
      page,
      width,
      ...(opts.annotations !== undefined && { annotations: opts.annotations }),
      ...(opts.marks !== undefined && { marks: opts.marks }),
    })
    const item = { entry, button, painter, width }
    mounted.set(page, item)
    return item
  }

  function unmount(page: number, item: Item): void {
    item.painter.destroy()
    item.entry.remove()
    mounted.delete(page)
  }

  function render(s: ThumbnailsState): void {
    spacer.style.height = `${s.offsets.at(-1)}px`
    const shown = s.pages.slice(s.window.start, s.window.end)
    const keep = new Set(shown)
    for (const [page, item] of mounted) if (!keep.has(page)) unmount(page, item)
    // Mounted items stay where they are when in order, so a focused one keeps focus.
    let previous: Element = spacer
    shown.forEach((page, k) => {
      const i = s.window.start + k
      const item = mounted.get(page) ?? mount(page, s.width)
      if (item.width !== s.width) {
        item.width = s.width
        item.painter.update({ width: s.width })
      }
      // Set on each render: a page's place moves when the pages listed change.
      for (const [name, value] of Object.entries(controller.itemAttrs(i)))
        if (item.entry.getAttribute(name) !== value) item.entry.setAttribute(name, value)
      item.entry.style.top = `${s.offsets[i]}px`
      item.entry.style.height = `${s.offsets[i + 1]! - s.offsets[i]!}px`
      if (page === s.current) item.button.setAttribute('aria-current', 'page')
      else item.button.removeAttribute('aria-current')
      if (previous.nextElementSibling !== item.entry) previous.after(item.entry)
      previous = item.entry
    })
  }

  render(controller.state.get())
  const stopState = controller.state.subscribe(render)
  const detach = controller.attach(root)
  onViewerDestroy(viewer, () => {
    detach()
    stopState()
    controller.destroy()
    for (const [page, item] of mounted) unmount(page, item)
    spacer.style.height = '0px'
  })
  return root
}
