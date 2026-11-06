/*
 * A record list: one card per item of a source, as the popover card shows it, linked to the
 * marks through the shared selection. The controller holds the rows, the count and what to
 * announce, and handles keys, clicks and focus over the rows a renderer puts in the element it
 * is attached to. `createRecordList` renders them for `createViewer`; the bindings render their
 * own from `rows`.
 *
 * Choosing a row (click, or Enter on it) selects its item and scrolls the viewport there; focus
 * stays in the list and no popover opens. When the selection moves from elsewhere (a mark, the
 * find bar), the selected row scrolls into view inside the list. When the focused row goes, by
 * an action, undo or anything else, focus moves to the next row, else the previous, else the
 * list.
 */
import { readonly, writable, type Readable } from '../../model/readable'
import { cardClass, cardParts } from '../plugins/api/card'
import { onViewerDestroy, pluginHostOf, type Viewer } from '../viewer/create-viewer'
import { h } from '../viewer/dom'

import {
  recordsSource,
  type ListItem,
  type RecordListSource,
  type RecordsSourceOptions,
} from './source'

import type { RecordBase } from '../../model/records'
import type { CardSpec } from '../plugins/api/card'

export interface RecordListRow {
  item: ListItem
  card: CardSpec | null
  selected: boolean
}

export interface RecordListController {
  /** One per listed item, in order. */
  readonly rows: Readable<readonly RecordListRow[]>
  readonly count: Readable<number>
  /** Polite live-region text: "3 items" when a change made from the app adds or removes rows. */
  readonly announcement: Readable<string>
  /**
   * Binds the element holding the rows: each row is an element with `data-ink-record` set to
   * its item's id. Handles clicks, arrow keys, Home and End, Enter and Escape inside it, keeps
   * one row as the Tab stop (it sets the rows' `tabindex`: don't render one), and scrolls the
   * selected row into view. `el` is where focus goes when the last row goes; it gets
   * `tabindex="-1"` unless it has one. Attaching another element unbinds the previous one.
   * Returns the unbind.
   */
  attach(el: HTMLElement): () => void
  /** Selects the item and scrolls the viewport to it; focus stays where it is. */
  choose(id: string): void
  /** Runs the card action named `action` of item `id` as one undo step. */
  act(id: string, action: string): void
  destroy(): void
}

const ROW = '[data-ink-record]'
const ROW_ATTR = 'data-ink-record'

/** Elements inside a row that take their own clicks and keys. */
const CONTROLS = 'button, a[href], input, select, textarea, [contenteditable]'

const itemsText = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`

export function createRecordListController(
  source: RecordListSource
): RecordListController {
  let items = source.items.get()
  let selected = source.selected.get()
  let destroyed = false
  let el: HTMLElement | null = null
  /** The row holding the Tab stop while the user works in the list. */
  let rove: string | null = null
  /** The row to scroll to once the list shows: it was selected while the list was hidden. */
  let pendingReveal: string | null = null
  /** The repeat `say` puts back after clearing the live region. */
  let repeat: ReturnType<typeof setTimeout> | undefined

  const build = (): RecordListRow[] =>
    items.map((item) => ({
      item,
      card: source.card(item),
      selected: item.id === selected,
    }))
  const rows = writable<readonly RecordListRow[]>(build())
  const count = writable(items.length)
  const announcement = writable(source.announcement?.get() ?? '')

  const rowEls = (): HTMLElement[] =>
    el ? [...el.querySelectorAll<HTMLElement>(ROW)] : []
  const rowEl = (id: string): HTMLElement | undefined =>
    rowEls().find((row) => row.getAttribute(ROW_ATTR) === id)
  const idOf = (row: HTMLElement) => row.getAttribute(ROW_ATTR) ?? ''

  /** The id of the row focus is in (the row or a control in it), or null. */
  const focusedRow = (): string | null => {
    const active = el?.ownerDocument?.activeElement
    if (!active || !el?.contains(active)) return null
    const row = rowEls().find((r) => r === active || r.contains(active))
    return row ? idOf(row) : null
  }

  /**
   * Focus was in row `gone`, which `before` listed and the items no longer do: focus the next
   * row still listed, else the previous, else the list.
   */
  function rehome(before: readonly ListItem[], gone: string): void {
    if (!el) return
    const ids = before.map((x) => x.id)
    const i = ids.indexOf(gone)
    const after = [...ids.slice(i + 1), ...ids.slice(0, i).reverse()]
    const next = after.find((x) => items.some((item) => item.id === x))
    const target = (next !== undefined && rowEl(next)) || el
    rove = next ?? null
    syncTabIndex()
    target.focus({ preventScroll: true })
    if (target !== el) scrollWithin(target)
  }

  function syncTabIndex(): void {
    const all = rowEls()
    const has = (id: string | null) => id !== null && all.some((r) => idOf(r) === id)
    const stop = has(rove) ? rove : has(selected) ? selected : all[0] && idOf(all[0])
    for (const row of all) {
      // The attribute, not `tabIndex`: a row has -1 before it has any.
      const index = idOf(row) === stop ? '0' : '-1'
      if (row.getAttribute('tabindex') !== index) row.setAttribute('tabindex', index)
    }
  }

  /** Scrolls the nearest scrolling ancestor of `row` so it shows; never the page itself. */
  function scrollWithin(row: HTMLElement): void {
    const doc = row.ownerDocument
    const view = doc?.defaultView
    if (!view) return
    let scroller = row.parentElement
    while (scroller && scroller !== doc.body && scroller !== doc.documentElement) {
      const overflow = view.getComputedStyle(scroller).overflowY
      if (
        (overflow === 'auto' || overflow === 'scroll') &&
        scroller.scrollHeight > scroller.clientHeight
      )
        break
      scroller = scroller.parentElement
    }
    if (!scroller || scroller === doc.body || scroller === doc.documentElement) return
    const box = scroller.getBoundingClientRect()
    const r = row.getBoundingClientRect()
    if (r.top < box.top) scroller.scrollTop -= box.top - r.top
    else if (r.bottom > box.bottom)
      scroller.scrollTop += Math.min(r.bottom - box.bottom, r.top - box.top)
  }

  /**
   * Puts `text` in the live region. The same text again is cleared first and put back on the
   * next task, once a binding has rendered the empty region, so a screen reader hears it again.
   */
  function say(text: string): void {
    clearTimeout(repeat)
    repeat = undefined
    if (text === '' || text !== announcement.get()) return announcement.set(text)
    announcement.set('')
    repeat = setTimeout(() => {
      repeat = undefined
      if (!destroyed) announcement.set(text)
    }, 0)
  }

  /**
   * Scrolls `id`'s row into view in the list, once it is rendered. A hidden list (a closed
   * sidebar panel) keeps it for when it shows.
   */
  function revealRow(id: string): void {
    if (el?.clientHeight === 0) {
      pendingReveal = id
      return
    }
    pendingReveal = null
    const row = rowEl(id)
    if (row) return scrollWithin(row)
    // A renderer that updates after this (a framework's next tick) has it by the next frame.
    const view = el?.ownerDocument?.defaultView
    view?.requestAnimationFrame(() => {
      const later = selected === id ? rowEl(id) : undefined
      if (later) scrollWithin(later)
    })
  }

  function publish(): void {
    rows.set(build())
    syncTabIndex()
  }

  const stopItems = source.items.subscribe((next) => {
    const before = items
    // Read before the rows re-render: a removed row takes focus with it.
    const focused = focusedRow()
    items = next
    const n = next.length
    if (!source.announcement && n !== count.get() && !source.replaying())
      say(itemsText(n))
    count.set(n)
    publish()
    // Whatever removed the focused row (an action, undo, another list), focus stays in the list.
    if (focused !== null && !next.some((item) => item.id === focused))
      rehome(before, focused)
  })
  const stopSelected = source.selected.subscribe((next) => {
    selected = next
    publish()
    if (next !== null && el) revealRow(next)
  })
  const stopAnnouncement = source.announcement?.subscribe(say)

  function choose(id: string): void {
    if (destroyed) return
    const item = items.find((i) => i.id === id)
    if (!item) return
    rove = id
    source.select(id)
    source.reveal(item)
    syncTabIndex()
  }

  function act(id: string, action: string): void {
    if (destroyed) return
    const item = items.find((x) => x.id === id)
    const fn = item && source.card(item)?.actions[action]
    // When the action removes the row, the items' update moves focus on.
    if (item && fn) source.run(item, fn)
  }

  let unbind: (() => void) | null = null

  function attach(target: HTMLElement): () => void {
    unbind?.()
    if (destroyed) return () => undefined
    el = target
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
    const view = target.ownerDocument?.defaultView ?? null

    const rowOf = (node: EventTarget | null): HTMLElement | null => {
      const row =
        node && typeof (node as Element).closest === 'function'
          ? (node as Element).closest<HTMLElement>(ROW)
          : null
      return row && target.contains(row) ? row : null
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey)
        return
      if (e.key === 'Escape') {
        if (selected === null) return
        source.select(null)
        if (selected !== null) return
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.shiftKey) return
      const row = rowOf(e.target)
      if (!row) return
      if (e.key === 'Enter') {
        // Enter on a control in the row is the control's.
        if (e.target !== row) return
        e.preventDefault()
        choose(idOf(row))
        return
      }
      const all = rowEls()
      const i = all.indexOf(row)
      const last = all.length - 1
      const next =
        e.key === 'ArrowDown'
          ? Math.min(last, i + 1)
          : e.key === 'ArrowUp'
            ? Math.max(0, i - 1)
            : e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? last
                : -1
      if (next < 0) return
      e.preventDefault()
      const to = all[next]!
      rove = idOf(to)
      syncTabIndex()
      to.focus({ preventScroll: true })
      scrollWithin(to)
    }
    const onClick = (e: MouseEvent): void => {
      const row = rowOf(e.target)
      if (!row) return
      const control = (e.target as Element).closest(CONTROLS)
      if (control && row.contains(control)) return
      choose(idOf(row))
    }
    const onFocusIn = (e: FocusEvent): void => {
      const row = rowOf(e.target)
      if (!row) return
      rove = idOf(row)
      syncTabIndex()
    }

    // Rows added or removed by any renderer: keep the Tab stop on one of them.
    const mutations =
      view && 'MutationObserver' in view ? new view.MutationObserver(syncTabIndex) : null
    mutations?.observe(target, { childList: true, subtree: true })
    // A list that was hidden shows: scroll to the row selected meanwhile, if it still is.
    const resize =
      view && 'ResizeObserver' in view
        ? new view.ResizeObserver(() => {
            const id = pendingReveal
            if (id === null || target.clientHeight === 0) return
            pendingReveal = null
            if (selected === id) revealRow(id)
          })
        : null
    resize?.observe(target)
    target.addEventListener('keydown', onKeyDown)
    target.addEventListener('click', onClick)
    target.addEventListener('focusin', onFocusIn)
    syncTabIndex()
    if (selected !== null) revealRow(selected)

    const off = (): void => {
      if (unbind !== off) return
      unbind = null
      mutations?.disconnect()
      resize?.disconnect()
      pendingReveal = null
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('click', onClick)
      target.removeEventListener('focusin', onFocusIn)
      el = null
      rove = null
    }
    unbind = off
    return off
  }

  return {
    rows: readonly(rows),
    count: readonly(count),
    announcement: readonly(announcement),
    attach,
    choose,
    act,
    destroy() {
      if (destroyed) return
      unbind?.()
      destroyed = true
      clearTimeout(repeat)
      stopItems()
      stopSelected()
      stopAnnouncement?.()
    },
  }
}

/** A list as `createRecordList` and `createSearchResults` render it. */
export interface RenderedList {
  /** `div.ink-records`: the list, the empty text and the live region. */
  element: HTMLElement
  controller: RecordListController
  /** Re-checks whether the empty text shows. */
  refreshEmpty(): void
  destroy(): void
}

/**
 * Renders `source` as a list of cards: `div.ink-records` holding `ul.ink-record-list` with one
 * `li.ink-record` per row, the empty text and a polite live region. Rows are kept by id, so a
 * row that stays keeps its element, and focus, through other rows' changes.
 *
 * @internal Shared by `createRecordList` and `createSearchResults`.
 */
export function renderRecordList(
  source: RecordListSource,
  /** Whether the empty text shows when there are no rows. Default: always. */
  emptyShown: () => boolean = () => true
): RenderedList {
  const controller = createRecordListController(source)
  const list = h('ul', { class: 'ink-record-list', role: 'list' })
  const empty = h('p', { class: 'ink-record-list-empty' }, 'Nothing here yet.')
  const live = h('div', {
    class: 'ink-visually-hidden',
    'aria-live': 'polite',
    'data-ink-record-status': '',
  })
  const element = h(
    'div',
    { class: 'ink-records', 'data-ink-records': '', tabindex: '-1' },
    list,
    empty,
    live
  )

  interface Row {
    li: HTMLLIElement
    card: HTMLDivElement
    item: ListItem | null
  }
  const mounted = new Map<string, Row>()

  /** Fills `row`'s card from `spec`, keeping focus on the same action. */
  function fill(row: Row, id: string, spec: CardSpec | null): void {
    const buttons = () => [...row.card.querySelectorAll<HTMLButtonElement>('button')]
    const focused = buttons().indexOf(document.activeElement as HTMLButtonElement)
    row.card.className = spec ? cardClass(spec) : 'ink-card'
    row.card.replaceChildren(
      ...(spec ? cardParts(spec, (label) => controller.act(id, label)) : [])
    )
    if (focused >= 0) (buttons()[focused] ?? row.li).focus({ preventScroll: true })
  }

  function refreshEmpty(): void {
    const none = controller.rows.get().length === 0
    list.hidden = none
    empty.hidden = !none || !emptyShown()
  }

  function render(rows: readonly RecordListRow[]): void {
    const keep = new Set(rows.map((r) => r.item.id))
    for (const [id, row] of mounted)
      if (!keep.has(id)) {
        row.li.remove()
        mounted.delete(id)
      }
    let previous: Element | null = null
    for (const { item, card, selected } of rows) {
      let row = mounted.get(item.id)
      if (!row) {
        const div = h('div', { class: 'ink-card' })
        row = {
          li: h('li', { class: 'ink-record', [ROW_ATTR]: item.id }, div),
          card: div,
          item: null,
        }
        mounted.set(item.id, row)
      }
      if (row.item !== item) {
        row.item = item
        fill(row, item.id, card)
      }
      if (selected) row.li.setAttribute('aria-current', 'true')
      else row.li.removeAttribute('aria-current')
      row.li.toggleAttribute('data-selected', selected)
      const at: Element | null = previous
        ? previous.nextElementSibling
        : list.firstElementChild
      if (at !== row.li) {
        if (previous) previous.after(row.li)
        else list.prepend(row.li)
      }
      previous = row.li
    }
    refreshEmpty()
  }

  render(controller.rows.get())
  const stopRows = controller.rows.subscribe(render)
  live.textContent = controller.announcement.get()
  const stopLive = controller.announcement.subscribe((text) => {
    live.textContent = text
  })
  const detach = controller.attach(element)

  return {
    element,
    controller,
    refreshEmpty,
    destroy() {
      detach()
      stopRows()
      stopLive()
      controller.destroy()
    },
  }
}

/**
 * The records a plugin keeps under `records` (`<plugin>.<name>`) as a list of cards, the same
 * cards its marks open, with their actions. Selecting a card selects the record's mark and
 * scrolls the viewer to it; activating a mark selects its card. Give it a height (it fills its
 * parent's) and place it anywhere, a sidebar panel for instance. It stops when the viewer is
 * destroyed.
 */
export function createRecordList(
  viewer: Viewer,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the host's record type
  opts: { records: string } & RecordsSourceOptions<any>
): HTMLElement {
  const { records: key, ...rest } = opts
  const source = recordsSource<RecordBase & { page: number }>(
    { pluginHost: pluginHostOf(viewer), viewport: viewer.viewport },
    key,
    rest
  )
  const rendered = renderRecordList(source)
  onViewerDestroy(viewer, () => rendered.destroy())
  return rendered.element
}
