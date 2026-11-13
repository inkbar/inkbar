/*
 * The document outline as a tree: which items are expanded, which one has the Tab stop, and
 * which one the reader has reached. `createOutline` renders it for `createViewer`; the bindings
 * render their own markup and spread what the controller gives them.
 *
 * The current item is the last one in document order whose destination is at or above the
 * viewport's reading line. Destinations are placed once per layout, and the reading line is
 * found among them by binary search, so a long outline costs little per scroll. When that item
 * sits inside a collapsed parent, the outermost collapsed ancestor is marked instead; nothing
 * expands by itself. An item activated from the outline stays current until the reader scrolls
 * away from where it landed, so the item jumped to is the one marked.
 */
import { en, type InkMessages } from '../../messages'
import { readonly, writable, type Readable } from '../../model/readable'

import type { InkDocument } from '../../model/document'
import type { OutlineItem } from '../../model/outline'
import type { Navigation } from '../navigation'
import type { Viewport } from '../viewport'

/** How far, in CSS px, the view may drift after a jump before the jumped-to item lets go. */
const PIN_SLACK = 2

/** How long typed characters keep adding to one type-ahead search, in ms. */
const TYPE_AHEAD_MS = 500

export interface OutlineControllerDeps {
  /** The open document; null while none is. */
  document: Readable<InkDocument | null>
  /** The viewport whose reading line marks the current item; null while none is mounted. */
  viewport: Readable<Viewport | null>
  /** Where activated items go, so jumps can be gone back from; null while no document is ready. */
  navigation: Readable<Navigation | null>
  /** Prefix for the items' element ids. Pass one when the markup is rendered on the server. */
  idPrefix?: string | undefined
}

export interface OutlineController {
  /** The outline's top-level items; `[]` while loading and when the document has none. */
  readonly items: Readable<readonly OutlineItem[]>
  /** True while the open document's outline is being read. */
  readonly loading: Readable<boolean>
  /** The ids of the expanded items. Another document starts from its file's `open` flags. */
  readonly expanded: Readable<ReadonlySet<string>>
  /**
   * The id of the item marked as where the reader is: the item reached, or its outermost
   * collapsed ancestor; the item last activated, until the reader scrolls away from it. Null
   * before the first item's destination.
   */
  readonly current: Readable<string | null>
  /** The id of the item the user last moved to or activated; null until they do. */
  readonly focused: Readable<string | null>
  /** Expands or collapses an item that has children. */
  toggle(id: string): void
  expandAll(): void
  collapseAll(): void
  /**
   * Follows the item: a destination is scrolled to and recorded for Back, a URL goes to the host
   * through `onAction`, a page action navigates. An unsupported item does nothing.
   */
  activate(id: string): void
  /**
   * `role="tree"` and its label (`m.outline.label`, English without `m`), for the element
   * holding the items.
   */
  treeAttrs(m?: InkMessages): Record<string, string>
  /**
   * For each item's element: `role="treeitem"`, its `id`, `aria-level`, `aria-setsize`,
   * `aria-posinset`, `aria-expanded` (items with children), `aria-current="location"` on the
   * current item, `aria-disabled` on items Inkbar cannot follow, `aria-labelledby` (its title)
   * and `tabindex` (one item has 0).
   *
   * The item element contains its own children, as the WAI-ARIA tree pattern has it, so it is
   * named by its title rather than by everything inside it:
   *
   * ```html
   * <ul class="ink-outline-tree" {...treeAttrs()} onkeydown>
   *   <li class="ink-outline-item" {...itemAttrs(id)} style="--ink-outline-level: 0">
   *     <div class="ink-outline-row" {...rowAttrs(id)}>
   *       <span class="ink-outline-toggle" aria-hidden="true">chevron</span>
   *       <span class="ink-outline-title" {...titleAttrs(id)}>Title</span>
   *     </div>
   *     <ul class="ink-outline-group" role="group">children, shown only while expanded</ul>
   *   </li>
   * </ul>
   * ```
   *
   * An item without children has `ink-outline-spacer` in place of the toggle and no group.
   * `--ink-outline-level` is its depth, 0 at the top; `data-bold` and `data-italic` go on the
   * item. A click on the toggle calls `toggle(id)`, anywhere else on the row `activate(id)`.
   */
  itemAttrs(id: string): Record<string, string | undefined>
  /** The `id` of an item's title element, which names the item. */
  titleAttrs(id: string): Record<string, string>
  /**
   * The `id` of an item's row (its chevron and title, without its children), which `bindScroll`
   * measures to keep the current item in view.
   */
  rowAttrs(id: string): Record<string, string>
  /** The tree's key handler: put it on the element with `treeAttrs()`. */
  onKeydown(e: KeyboardEvent): void
  /** Scrolls the current item into view inside `scroller` unless focus is in the tree. */
  bindScroll(scroller: HTMLElement): () => void
  destroy(): void
}

/** An item with where it sits in the tree. */
interface Node {
  item: OutlineItem
  parent: Node | null
  /** 1-based, as `aria-level`. */
  level: number
  /** 1-based place among its siblings. */
  posinset: number
  setsize: number
}

let instances = 0

const hasChildren = (node: Node): boolean => node.item.children.length > 0

/**
 * `role="tree"` and its label, for the element holding an outline's items. The same as a
 * controller's `treeAttrs()`, without one, so markup rendered on the server has them too.
 */
export function outlineTreeAttrs(m: InkMessages): Record<string, string> {
  return { role: 'tree', 'aria-label': m.outline.label }
}

export function createOutlineController(deps: OutlineControllerDeps): OutlineController {
  const prefix = deps.idPrefix ?? `ink-outline-${++instances}`
  const domId = (id: string): string => `${prefix}-${id.replaceAll('.', '-')}`

  const items = writable<readonly OutlineItem[]>([])
  const loading = writable(false)
  const expanded = writable<ReadonlySet<string>>(new Set())
  const current = writable<string | null>(null)
  const focused = writable<string | null>(null)

  /** Every item, in document order. */
  let nodes: Node[] = []
  const byId = new Map<string, Node>()
  const byDomId = new Map<string, Node>()
  /** The items with a destination on a laid-out page, in document order, with its y. */
  let placed: { node: Node; y: number }[] = []
  /** `suffixMin[i]`: the least y from `placed[i]` on, which never decreases with `i`. */
  let suffixMin: number[] = []
  /** The item the reading line has reached, before collapsed ancestors are applied. */
  let reached: Node | null = null
  let destroyed = false
  /** Bumped per document, so an outline read for an earlier one is dropped. */
  let generation = 0
  /** The document the tree's elements live in, once a key or `bindScroll` has shown it. */
  let ownerDoc: Document | null = null

  /**
   * The item last jumped to from the outline. It stays current until the reader scrolls away
   * from where the jump landed (`line`, recorded once the jump settles): a destination centred
   * in the view, or one sharing a page with later items, may otherwise not be the one the rule
   * picks there.
   */
  let pin: { node: Node; line: number | undefined } | null = null
  /** Cancels the wait for the jump to settle. */
  let cancelSettle: (() => void) | null = null

  let typed = ''
  let typedTimer: ReturnType<typeof setTimeout> | undefined

  function index(roots: readonly OutlineItem[]): void {
    nodes = []
    byId.clear()
    byDomId.clear()
    const walk = (list: readonly OutlineItem[], parent: Node | null): void =>
      list.forEach((item, i) => {
        const node: Node = {
          item,
          parent,
          level: parent ? parent.level + 1 : 1,
          posinset: i + 1,
          setsize: list.length,
        }
        nodes.push(node)
        byId.set(item.id, node)
        byDomId.set(domId(item.id), node)
        walk(item.children, node)
      })
    walk(roots, null)
  }

  const isExpanded = (node: Node): boolean => expanded.get().has(node.item.id)

  /** Whether every ancestor of `node` is expanded. */
  function shown(node: Node): boolean {
    for (let p = node.parent; p; p = p.parent) if (!isExpanded(p)) return false
    return true
  }

  /** The items a reader sees, in order: those whose ancestors are all expanded. */
  function visible(): Node[] {
    const out: Node[] = []
    const walk = (list: readonly OutlineItem[]): void => {
      for (const item of list) {
        const node = byId.get(item.id)!
        out.push(node)
        if (isExpanded(node)) walk(item.children)
      }
    }
    walk(items.get())
    return out
  }

  /** `node`, or its outermost collapsed ancestor when one hides it. */
  function showing(node: Node): Node {
    let out = node
    for (let p = node.parent; p; p = p.parent) if (!isExpanded(p)) out = p
    return out
  }

  function mark(): void {
    current.set(reached ? showing(reached).item.id : null)
  }

  /** Places every destination in the current layout. */
  function place(): void {
    const vp = deps.viewport.get()
    placed = []
    if (vp) {
      const shown = vp.currentPage.get()
      for (const node of nodes) {
        const target = node.item.target
        if (target.kind !== 'resolved') continue
        const y = vp.destinationY(target.dest)
        if (y !== undefined && Number.isFinite(y)) placed.push({ node, y })
        // A page without a box (single-page mode shows one) is ordered by its page: above the
        // reading line before the shown page, below it after.
        else if (y === undefined && target.dest.page !== shown)
          placed.push({ node, y: target.dest.page < shown ? -Infinity : Infinity })
      }
    }
    suffixMin = new Array<number>(placed.length)
    let least = Infinity
    for (let i = placed.length - 1; i >= 0; i--) {
      least = Math.min(least, placed[i]!.y)
      suffixMin[i] = least
    }
  }

  /**
   * Finds the last placed item at or above the reading line. The last `i` with
   * `suffixMin[i] <= line` is that item: nothing after it is at or above the line.
   */
  function reach(): void {
    const vp = deps.viewport.get()
    if (!vp || placed.length === 0) {
      reached = null
    } else {
      const line = vp.readingLine.get()
      let lo = 0
      let hi = placed.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (suffixMin[mid]! <= line) lo = mid + 1
        else hi = mid
      }
      reached = lo > 0 ? placed[lo - 1]!.node : null
      if (pin && pin.line !== undefined && Math.abs(line - pin.line) > PIN_SLACK) unpin()
      if (pin) reached = pin.node
    }
    mark()
  }

  /** The item holding the Tab stop: the focused one, else the current one, else the first. */
  function tabStop(): string | null {
    const f = focused.get()
    if (f !== null && byId.has(f)) return f
    return current.get() ?? nodes[0]?.item.id ?? null
  }

  const elementFor = (id: string): HTMLElement | null =>
    ownerDoc?.getElementById(domId(id)) ?? null

  /** The item's own row: the item element holds its children too, which can run far below. */
  const rowFor = (id: string): HTMLElement | null =>
    ownerDoc?.getElementById(`${domId(id)}-row`) ?? null

  const focusInTree = (): boolean => {
    const active = ownerDoc?.activeElement
    return !!active && byDomId.has(active.id)
  }

  /** Moves the Tab stop, and focus, to `id`. */
  function moveTo(id: string): void {
    focused.set(id)
    elementFor(id)?.focus()
  }

  function setExpanded(next: ReadonlySet<string>): void {
    // Read before the change: a framework may unmount the focused item when its parent closes.
    const hadFocus = focusInTree()
    expanded.set(next)
    const f = focused.get()
    const node = f === null ? undefined : byId.get(f)
    // A focused item hidden by the collapse hands focus to the ancestor that hid it.
    if (node && !shown(node)) {
      const to = showing(node).item.id
      focused.set(to)
      if (hadFocus) elementFor(to)?.focus()
    }
    mark()
  }

  function unpin(): void {
    pin = null
    cancelSettle?.()
    cancelSettle = null
  }

  /** Runs `fn` once the scroll a jump started has landed: on the next frame. */
  function afterFrame(fn: () => void): () => void {
    const view = ownerDoc?.defaultView ?? globalThis
    if (typeof view.requestAnimationFrame === 'function') {
      const handle = view.requestAnimationFrame(fn)
      return () => view.cancelAnimationFrame(handle)
    }
    const timer = setTimeout(fn, 0)
    return () => clearTimeout(timer)
  }

  function load(doc: InkDocument | null): void {
    const mine = ++generation
    unpin()
    index([])
    items.set([])
    expanded.set(new Set())
    focused.set(null)
    reached = null
    place()
    mark()
    typed = ''
    if (!doc) {
      loading.set(false)
      return
    }
    loading.set(true)
    const done = (list: readonly OutlineItem[]): void => {
      if (destroyed || mine !== generation) return
      index(list)
      expanded.set(
        new Set(nodes.filter((n) => n.item.open && hasChildren(n)).map((n) => n.item.id))
      )
      items.set(list)
      place()
      reach()
      loading.set(false)
    }
    // A document that failed to load has no outline to show.
    doc.outline().then(done, () => done([]))
  }

  let stopLine: (() => void) | null = null
  function watchViewport(vp: Viewport | null): void {
    stopLine?.()
    stopLine = null
    if (vp) {
      const offLine = vp.readingLine.subscribe(reach)
      const replace = (): void => {
        place()
        reach()
      }
      const offLayout = vp.layout.subscribe(() => {
        // A new layout (zoom, rotation, resize) moves every destination: back to the rule. The
        // jump's own relayout, before it settles, keeps the pin.
        if (pin?.line !== undefined) unpin()
        replace()
      })
      // In single-page mode another page shows without a new layout.
      const offPage = vp.currentPage.subscribe(replace)
      stopLine = () => {
        offLine()
        offLayout()
        offPage()
      }
    }
    place()
    reach()
  }

  const stopDocument = deps.document.subscribe(load)
  const stopViewport = deps.viewport.subscribe(watchViewport)
  load(deps.document.get())
  watchViewport(deps.viewport.get())

  function toggle(id: string): void {
    const node = byId.get(id)
    if (destroyed || !node || !hasChildren(node)) return
    const next = new Set(expanded.get())
    if (!next.delete(id)) next.add(id)
    setExpanded(next)
  }

  function activate(id: string): void {
    const node = byId.get(id)
    if (destroyed || !node) return
    focused.set(id)
    const target = node.item.target
    const navigation = deps.navigation.get()
    if (target.kind === 'unsupported' || !navigation) return
    const follow = navigation.follow(target)
    if (target.kind !== 'resolved') return
    unpin()
    const mine = { node, line: undefined as number | undefined }
    pin = mine
    reach()
    void follow.then(() => {
      if (pin !== mine) return
      cancelSettle = afterFrame(() => {
        cancelSettle = null
        const vp = deps.viewport.get()
        if (pin !== mine || !vp) return
        mine.line = vp.readingLine.get()
        reach()
      })
    })
  }

  /** The visible item whose title starts with what was typed, searching on from `from`. */
  function typeAhead(char: string, from: Node): Node | undefined {
    clearTimeout(typedTimer)
    typed += char.toLowerCase()
    typedTimer = setTimeout(() => {
      typed = ''
    }, TYPE_AHEAD_MS)
    const list = visible()
    const at = list.indexOf(from)
    // A first character moves on from the focused item; more characters refine the match on it.
    const start = typed.length === 1 ? at + 1 : at
    for (let k = 0; k < list.length; k++) {
      const node = list[(start + k) % list.length]!
      if (node.item.title.toLowerCase().startsWith(typed)) return node
    }
    return undefined
  }

  function onKeydown(e: KeyboardEvent): void {
    if (destroyed || e.defaultPrevented || e.isComposing) return
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const target = e.target as Element | null
    if (target?.ownerDocument) ownerDoc = target.ownerDocument
    const el =
      target && typeof target.closest === 'function'
        ? target.closest('[role="treeitem"]')
        : null
    const stop = tabStop()
    const node =
      (el && byDomId.get(el.id)) || (stop === null ? undefined : byId.get(stop))
    if (!node) return
    const list = visible()
    const at = list.indexOf(node)
    let to: Node | undefined
    switch (e.key) {
      case 'ArrowDown':
        to = list[at + 1] ?? node
        break
      case 'ArrowUp':
        to = list[at - 1] ?? node
        break
      case 'Home':
        to = list[0]
        break
      case 'End':
        to = list.at(-1)
        break
      case 'ArrowRight':
        to = node
        if (hasChildren(node)) {
          if (!isExpanded(node)) toggle(node.item.id)
          else to = byId.get(node.item.children[0]!.id)
        }
        break
      case 'ArrowLeft':
        to = node
        if (hasChildren(node) && isExpanded(node)) toggle(node.item.id)
        else if (node.parent) to = node.parent
        break
      case 'Enter':
        e.preventDefault()
        activate(node.item.id)
        return
      case '*': {
        const siblings = node.parent ? node.parent.item.children : items.get()
        const next = new Set(expanded.get())
        for (const s of siblings) if (s.children.length > 0) next.add(s.id)
        setExpanded(next)
        to = node
        break
      }
      default:
        // Space only continues a search, as titles have spaces; alone it is the browser's.
        if (e.key.length !== 1 || (e.key === ' ' && typed === '')) return
        to = typeAhead(e.key, node) ?? node
    }
    e.preventDefault()
    if (to) moveTo(to.item.id)
  }

  /** Scrolls `row` into view inside `scroller` by the least amount; never any ancestor. */
  function scrollWithin(scroller: HTMLElement, row: HTMLElement): void {
    const box = scroller.getBoundingClientRect()
    const r = row.getBoundingClientRect()
    if (r.top < box.top) scroller.scrollTop -= box.top - r.top
    else if (r.bottom > box.bottom)
      scroller.scrollTop += Math.min(r.bottom - box.bottom, r.top - box.top)
  }

  /** The live `bindScroll` bindings, undone by `destroy`. */
  const bindings = new Set<() => void>()

  function bindScroll(scroller: HTMLElement): () => void {
    if (destroyed) return () => undefined
    ownerDoc = scroller.ownerDocument
    const view = ownerDoc.defaultView
    /** Set while the current item waits for a hidden list to show. */
    let pending = false
    let frame = 0

    function reveal(): void {
      const id = current.get()
      if (id === null) return
      const active = ownerDoc?.activeElement
      if (active && scroller.contains(active)) return
      // A closed panel scrolls once it shows.
      if (scroller.clientHeight === 0) {
        pending = true
        return
      }
      pending = false
      const row = rowFor(id)
      if (row && scroller.contains(row)) return scrollWithin(scroller, row)
      // A renderer that updates after this (a framework's next tick) has it by the next frame.
      if (view) {
        view.cancelAnimationFrame(frame)
        frame = view.requestAnimationFrame(() => {
          const later = current.get() === id ? rowFor(id) : null
          if (later && scroller.contains(later)) scrollWithin(scroller, later)
        })
      }
    }

    const stopCurrent = current.subscribe(reveal)
    // The outline arrives after the list is bound, so the first current item shows too.
    const stopItems = items.subscribe(reveal)
    const resize =
      view && 'ResizeObserver' in view
        ? new view.ResizeObserver(() => {
            if (pending) reveal()
          })
        : null
    resize?.observe(scroller)
    reveal()
    const unbind = (): void => {
      if (!bindings.delete(unbind)) return
      stopCurrent()
      stopItems()
      resize?.disconnect()
      if (view) view.cancelAnimationFrame(frame)
    }
    bindings.add(unbind)
    return unbind
  }

  return {
    items: readonly(items),
    loading: readonly(loading),
    expanded: readonly(expanded),
    current: readonly(current),
    focused: readonly(focused),
    toggle,
    expandAll() {
      if (destroyed) return
      setExpanded(new Set(nodes.filter(hasChildren).map((n) => n.item.id)))
    },
    collapseAll() {
      if (destroyed) return
      setExpanded(new Set())
    },
    activate,
    // English without words, as before: the controller has no message state of its own.
    treeAttrs: (m = en) => outlineTreeAttrs(m),
    titleAttrs: (id) => ({ id: `${domId(id)}-title` }),
    rowAttrs: (id) => ({ id: `${domId(id)}-row` }),
    itemAttrs(id) {
      const node = byId.get(id)
      return {
        role: 'treeitem',
        id: domId(id),
        'aria-level': node ? String(node.level) : undefined,
        'aria-setsize': node ? String(node.setsize) : undefined,
        'aria-posinset': node ? String(node.posinset) : undefined,
        'aria-expanded': node && hasChildren(node) ? String(isExpanded(node)) : undefined,
        'aria-current': current.get() === id ? 'location' : undefined,
        'aria-disabled': node?.item.target.kind === 'unsupported' ? 'true' : undefined,
        'aria-labelledby': `${domId(id)}-title`,
        tabindex: tabStop() === id ? '0' : '-1',
      }
    },
    onKeydown,
    bindScroll,
    destroy() {
      if (destroyed) return
      for (const unbind of [...bindings]) unbind()
      destroyed = true
      unpin()
      generation++
      clearTimeout(typedTimer)
      stopDocument()
      stopViewport()
      stopLine?.()
      stopLine = null
    },
  }
}
