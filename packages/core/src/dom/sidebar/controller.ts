/*
 * The sidebar's state, ARIA and keys, for createSidebar and for the bindings' components, which
 * render their own markup and spread what this gives them. It needs no document or viewer.
 *
 * Rail and tabs follow the WAI-ARIA tabs pattern with manual activation: arrow keys move focus,
 * Enter or Space (the native button's click) opens. Stack follows the accordion pattern: every
 * header is a Tab stop with `aria-expanded`.
 */
import { resolveLabel, type Label } from '../../messages'
import { readonly, writable, type Readable } from '../../model/readable'
import { ENGLISH, type MessageState } from '../messages-state'

import { joinSidebarGroup, type SidebarGroupMembership } from './group'
import { MIN_DOCUMENT_WIDTH, type SidebarPlacement, type SidebarSlot } from './placement'

import type { InkStorage } from '../../model/storage'
import type { IconNode } from '@inkbar/icons'

export type SidebarLayout = 'rail' | 'tabs' | 'stack'
export type SidebarSide = 'left' | 'right'

export interface SidebarPanelInfo {
  id: string
  /** Its name; a function is read again on every render and every change of words. */
  label: Label
  icon?: IconNode
  /** Hidden when empty or 0. */
  badge?: string | number
}

/** rail/tabs: the open id or null; stack: the expanded ids. */
export type SidebarOpen = string | null | readonly string[]

export interface SidebarControllerOptions {
  /** Default `'rail'`. */
  layout?: SidebarLayout
  /** Default `'left'`. */
  side?: SidebarSide
  panels: readonly SidebarPanelInfo[]
  /** Controlled when given: `toggle` only reports through `onOpenChange`. */
  open?: SidebarOpen
  onOpenChange?(open: SidebarOpen): void
  /**
   * Default true. False hides the whole sidebar (the root gets `hidden`) and keeps its open
   * panels, their content and scroll, for when it shows again. Your code decides: a results
   * sidebar shown only while there are results, for instance.
   */
  visible?: boolean
  /**
   * True while a binding's panels are still registering, one by one, before it has mounted.
   * Meanwhile a controlled `open` id not in `panels` yet is kept rather than taken for a
   * removed panel, and `rootAttrs()` reports the open state expected once they are all in.
   * Set it back to false (through `update`) once the panels are in: an id still missing then
   * falls back as a removed one does.
   */
  pending?: boolean
  /**
   * Makes the ids `<idPrefix>-trigger-<id>` and `<idPrefix>-panel-<id>`, the same on the server
   * and the client. Without it they come from a counter.
   */
  idPrefix?: string
  /** Where the width is saved, under `sidebar.<name>.width`. Without it the width lasts the controller's life. */
  storage?: InkStorage
  /** The key's middle part. Default: the side. Give two sidebars on one side different names. */
  name?: string
  /** Default 320, in CSS px. */
  defaultWidth?: number
  /** Default 240. */
  minWidth?: number
  /** Default 480. */
  maxWidth?: number
  /** Controlled when given: drags and keys only report through `onWidthChange`, and storage is not read or written. */
  width?: number
  onWidthChange?(width: number): void
  /**
   * The narrowest the document may get beside the sidebars in this sidebar's container, in CSS
   * px. Default 480, which also replaces a negative or non-finite value. Read once, when the
   * sidebar is created.
   */
  minDocumentWidth?: number
  /**
   * The resize handle's accessible name. Default `messages.sidebar.resizeLeft` or `resizeRight`
   * ("Resize left sidebar", "Resize right sidebar").
   */
  handleLabel?: Label
  /**
   * The words for the default labels; English when omitted. Pass the viewer's `messages`: on
   * every change the state is published again, so labels (and label functions) are read again.
   * Read once, when the controller is created.
   */
  messages?: Readable<MessageState>
}

export interface SidebarState {
  layout: SidebarLayout
  side: SidebarSide
  panels: readonly SidebarPanelInfo[]
  /** The open panels' ids, in panel order: at most one for rail and tabs. */
  open: readonly string[]
  visible: boolean
  /** The wanted width: saved, dragged or default. `rootStyle()` gives the shown one. */
  width: number
  /** True while the handle is dragged. */
  resizing: boolean
  /** True while a rail's open panel floats over the document, which has no room beside it. */
  floating: boolean
}

export interface SidebarController {
  readonly state: Readable<SidebarState>
  /**
   * Takes new options. `open` given makes the sidebar controlled. When the panels no longer
   * hold an open one, rail and tabs open the first remaining and stack drops it; the new value
   * goes to `onOpenChange`, controlled or not. `width` given makes the width controlled.
   */
  update(opts: Partial<SidebarControllerOptions>): void
  /** What activating `id`'s trigger does: rail opens or closes, tabs switch, stack expands or collapses. */
  toggle(id: string): void
  isOpen(id: string): boolean
  /**
   * `data-ink-sidebar`, `data-layout`, `data-side` and `data-state` (`open` while any panel is,
   * and while pending and uncontrolled, as the first panel will open) for the root,
   * `data-overlay` while the panel floats, and `hidden` while it is not `visible`.
   */
  rootAttrs(): Record<string, string>
  /**
   * `--ink-sidebar-width` for the root: the shown width in px, which is the chosen width unless a
   * tabs or stack sidebar narrows to leave the document room.
   */
  rootStyle(): Record<string, string>
  /** The id of the element holding the panels, which the handle's `aria-controls` names. */
  panelsAttrs(): Record<string, string>
  /** The separator's attributes; includes `hidden` while no panel is open or the sidebar is hidden. */
  handleAttrs(): Record<string, string>
  /**
   * Pointer drag, keys and double-click on the handle. Also joins the sidebars sharing the root's
   * parent, which decide together which float or narrow as the parent resizes. Returns the unbind.
   */
  bindHandle(el: HTMLElement): () => void
  /** Back to `defaultWidth`; removes the saved key. */
  resetWidth(): void
  /** ARIA for the element holding the triggers: a tablist for rail and tabs. */
  tablistAttrs(): Record<string, string>
  /** ARIA for the rail button / tab / stack header of `id`. */
  triggerAttrs(id: string): Record<string, string>
  /**
   * ARIA for `id`'s panel, including `hidden` when closed, and its sidebar's `data-layout`: the
   * theme shows the panel's title (`.ink-sidebar-panel-title`) in the rail only.
   */
  panelAttrs(id: string): Record<string, string>
  /**
   * Roving tabindex, arrow keys, Home and End, and clicks over `[data-ink-sidebar-trigger]`
   * inside `el`, looked up at event time so re-rendered triggers keep working. Returns the
   * function that unbinds.
   */
  bindTriggers(el: HTMLElement): () => void
  destroy(): void
}

/** A panel's name now: its label, a function's read. */
export function sidebarLabel(panel: Pick<SidebarPanelInfo, 'label'>): string {
  return resolveLabel(panel.label)
}

/** The text a badge shows, or null when it is hidden (empty or 0). */
export function sidebarBadge(badge: string | number | undefined): string | null {
  if (badge === undefined || badge === null) return null
  const text = String(badge).trim()
  return text === '' || text === '0' ? null : text
}

/** The sidebar's widths in CSS px, unless the host gives its own. */
export const SIDEBAR_WIDTH = { default: 320, min: 240, max: 480 } as const

/** The rail's width when the root's `--ink-sidebar-rail-width` gives none in px. */
const RAIL_WIDTH = 48

/** How far an arrow key moves the handle. */
const KEY_STEP = 16

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as PromiseLike<unknown> | null)?.then === 'function'

/** Calls `fn` on storage so that neither a throw nor a rejection escapes. */
function quietly<T>(fn: () => T | Promise<T>, then?: (value: T) => void): void {
  try {
    const result = fn()
    if (isThenable(result))
      result.then(
        (value) => then?.(value),
        () => {}
      )
    else then?.(result)
  } catch {
    // A blocked or broken store: the width holds in memory.
  }
}

const TRIGGER = '[data-ink-sidebar-trigger]'

/** How far a press may travel, in CSS px, and still be a tap that closes a floating panel. */
const TAP_SLOP = 10

/** Menus, popovers and dialogs, wherever they are portalled: a press or key in one never closes a panel. */
const inOverlay = (el: Element): boolean =>
  el.closest("[data-ink-popover], [role='dialog'], [role='menu']") !== null

let count = 0
/** Each controller's key in its group. */
let slotCount = 0
/** Stamps each opening, so the group knows which sidebar opened last. */
let openCount = 0

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/** Whether a binding's new panels show the same as the current ones. */
function samePanels(
  a: readonly SidebarPanelInfo[],
  b: readonly SidebarPanelInfo[]
): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => {
      const q = b[i]!
      return (
        p.id === q.id && p.label === q.label && p.icon === q.icon && p.badge === q.badge
      )
    })
  )
}

const destroyHooks = new WeakMap<SidebarController, (() => void)[]>()

/** @internal Runs `fn` when `controller` is destroyed. */
export function onSidebarDestroy(controller: SidebarController, fn: () => void): void {
  destroyHooks.get(controller)?.push(fn)
}

export function createSidebarController(
  opts: SidebarControllerOptions
): SidebarController {
  const prefix = opts.idPrefix ?? `ink-sb-${++count}`
  let layout: SidebarLayout = opts.layout ?? 'rail'
  let side: SidebarSide = opts.side ?? 'left'
  let panels: readonly SidebarPanelInfo[] = opts.panels
  let controlled = opts.open !== undefined
  let pending = opts.pending ?? false
  let visible = opts.visible ?? true
  /** The options that last gave `onOpenChange`, called as a method of them. */
  let handler: Pick<SidebarControllerOptions, 'onOpenChange'> = opts
  /** Likewise for `onWidthChange`. */
  let widthHandler: Pick<SidebarControllerOptions, 'onWidthChange'> = opts
  const storage = opts.storage
  const name = opts.name
  let defaultWidth = opts.defaultWidth ?? SIDEBAR_WIDTH.default
  let minWidth = opts.minWidth ?? SIDEBAR_WIDTH.min
  let maxWidth = opts.maxWidth ?? SIDEBAR_WIDTH.max
  let widthControlled = opts.width !== undefined
  let width = opts.width ?? defaultWidth
  let resizing = false
  const minDocument =
    opts.minDocumentWidth !== undefined &&
    Number.isFinite(opts.minDocumentWidth) &&
    opts.minDocumentWidth >= 0
      ? opts.minDocumentWidth
      : MIN_DOCUMENT_WIDTH
  let handleLabel = opts.handleLabel
  const messages = opts.messages ?? ENGLISH
  const key = ++slotCount
  /** When a panel last opened with none open before. */
  let openedAt = 0
  let floating = false
  /** The width the group placed, until the sidebar leaves it. */
  let placedShown: number | undefined
  /** Whether the first placement has had its chance to close a panel with no room. */
  let startChecked = false
  /** The sidebar's group, and the container it is for, while the handle is bound. */
  let membership: SidebarGroupMembership | undefined
  let groupParent: HTMLElement | null = null
  /** The sidebar's root while the handle is bound: the floating panel's rail trigger is in it. */
  let groupRoot: HTMLElement | null = null
  /** Unbinds the listeners that close a floating panel, while they are bound. */
  let stopDismiss: (() => void) | undefined
  /** Unbinds the listeners that swallow what follows a closing tap. */
  let stopAfterClose: (() => void) | undefined
  /** The slot as the group last saw it. */
  let lastSlot = ''
  /** Reads the rail's width from the root, once the handle is bound. */
  let railWidth = (): number => RAIL_WIDTH
  /** Set by a drag, key or reset: a late answer from storage no longer applies. */
  let touched = false
  /** The trigger that holds the Tab stop in rail and tabs, once one has had focus. */
  let current: string | null = null
  let destroyed = false

  const has = (id: string): boolean => panels.some((p) => p.id === id)
  const inOrder = (ids: Iterable<string>): string[] => {
    const set = new Set(ids)
    return panels.filter((p) => set.has(p.id)).map((p) => p.id)
  }
  const idsOf = (value: SidebarOpen): string[] =>
    value === null ? [] : typeof value === 'string' ? [value] : [...value]
  const toValue = (ids: readonly string[]): SidebarOpen =>
    layout === 'stack' ? [...ids] : (ids[0] ?? null)
  /**
   * The ids `value` opens among the current panels. Stack keeps those that exist, in panel
   * order. Rail and tabs keep the first that exists; when none does, the first panel opens, as
   * there was an open one to replace. While pending, a controlled id not registered yet is kept:
   * after the registered ones in stack, as the one open in rail and tabs.
   */
  const resolve = (value: SidebarOpen): string[] => {
    const ids = idsOf(value)
    const waiting = pending && controlled
    if (layout === 'stack') {
      const known = inOrder(ids)
      return waiting ? [...new Set([...known, ...ids.filter((id) => !has(id))])] : known
    }
    if (waiting && ids.length > 0) return [ids.find(has) ?? ids[0]!]
    const first = ids.find(has) ?? (ids.length > 0 ? panels[0]?.id : undefined)
    return first === undefined ? [] : [first]
  }

  const store = writable<SidebarState>({
    layout,
    side,
    panels,
    open: resolve(opts.open !== undefined ? opts.open : (panels[0]?.id ?? null)),
    visible,
    width,
    resizing,
    floating,
  })
  if (store.get().open.length > 0) openedAt = ++openCount

  const clampWidth = (w: number): number => Math.min(Math.max(w, minWidth), maxWidth)
  const shown = (): number => placedShown ?? clampWidth(width)

  const slot = (): SidebarSlot => ({
    key,
    layout,
    visible,
    open: store.get().open.length > 0,
    want: clampWidth(width),
    min: minWidth,
    rail: layout === 'rail' ? railWidth() : 0,
    resizing,
    openedAt,
    minDocument,
  })
  /** What the group places by, but the rail, which is read from CSS. */
  const signature = (): string =>
    [
      layout,
      visible,
      store.get().open.length > 0,
      clampWidth(width),
      minWidth,
      resizing,
      openedAt,
    ].join()
  /** Tells the group when this sidebar changed in a way that can move the others. */
  const tellGroup = (): void => {
    if (!membership) return
    const next = signature()
    if (next === lastSlot) return
    lastSlot = next
    membership.changed()
  }

  function publish(open: readonly string[] = store.get().open): void {
    if (store.get().open.length === 0 && open.length > 0) openedAt = ++openCount
    store.set({ layout, side, panels, open, visible, width, resizing, floating })
    tellGroup()
    syncDismiss()
  }

  /**
   * Closes a floating panel the way a drawer closes: on a tap on the pages or on Escape. The
   * closing press is swallowed, so no tool, link or field sees it; a drag, a scroll or a second
   * pointer leaves the panel open.
   */
  function syncDismiss(): void {
    const parent = groupParent
    const root = groupRoot
    const wanted =
      !destroyed &&
      layout === 'rail' &&
      floating &&
      visible &&
      store.get().open.length > 0 &&
      parent !== null &&
      root !== null
    if (!wanted) {
      stopDismiss?.()
      return
    }
    // A root outside a document, as in node tests, has nothing to listen to.
    const doc = root.ownerDocument as Document | null | undefined
    if (stopDismiss || !doc) return
    /** The press that may close: its pointer and where it started. */
    let press: { pointer: number; x: number; y: number } | null = null
    /** The pointers down on the pages: with more than one, it is a gesture. */
    const down = new Set<number>()
    const counts = (target: EventTarget | null): target is Element =>
      target instanceof Element &&
      parent.contains(target) &&
      target.closest('[data-ink-sidebar]') === null &&
      !inOverlay(target)
    const onDown = (e: PointerEvent): void => {
      if (!counts(e.target)) return
      e.stopPropagation()
      if (e.pointerType !== 'touch') e.preventDefault()
      // A primary pointer starts afresh: one whose end the browser lost no longer counts.
      if (e.isPrimary) down.clear()
      down.add(e.pointerId)
      // A second pointer makes a gesture, a pinch most likely: no press in it closes.
      press =
        down.size === 1 && e.button === 0
          ? { pointer: e.pointerId, x: e.clientX, y: e.clientY }
          : null
    }
    const onMove = (e: PointerEvent): void => {
      if (!press || e.pointerId !== press.pointer) return
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP) press = null
    }
    const onUp = (e: PointerEvent): void => {
      down.delete(e.pointerId)
      if (!press || e.pointerId !== press.pointer) return
      const near = Math.hypot(e.clientX - press.x, e.clientY - press.y) <= TAP_SLOP
      press = null
      if (near) close(e.target)
    }
    const onCancel = (e: PointerEvent): void => {
      down.delete(e.pointerId)
      if (press && e.pointerId === press.pointer) press = null
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
      const active = doc.activeElement
      // Only Escape from nowhere in particular, or from within the sidebars and pages, closes.
      if (active && active !== doc.body && !parent.contains(active)) return
      if (active && inOverlay(active)) return
      close(null)
    }
    // The find bar takes precedence: when it takes focus to open, the floating panel closes. A
    // host may place the bar outside the sidebars' row, so any in the same viewer counts.
    const scope = root.closest('[data-ink-root]') ?? parent
    const onFocusIn = (e: FocusEvent): void => {
      const target = e.target
      if (!(target instanceof Element) || !scope.contains(target)) return
      if (target.closest('[data-ink-find-bar]') === null) return
      if (target.closest('[data-ink-sidebar]') !== null) return
      close(null)
    }
    /** Reports the close, and moves focus to the rail trigger when it was nowhere in particular. */
    const close = (target: EventTarget | null): void => {
      const id = store.get().open[0]
      if (id === undefined) return
      const active = doc.activeElement
      const refocus = !active || active === doc.body || root.contains(active)
      if (target) swallowAfterClose(doc, target)
      if (!controlled) publish([])
      handler.onOpenChange?.(toValue([]))
      if (refocus)
        root.querySelector<HTMLElement>(`[id="${CSS.escape(triggerId(id))}"]`)?.focus()
    }
    const capture = { capture: true }
    doc.addEventListener('pointerdown', onDown, capture)
    doc.addEventListener('pointermove', onMove, capture)
    doc.addEventListener('pointerup', onUp, capture)
    doc.addEventListener('pointercancel', onCancel, capture)
    // Bubbling: an editor or a menu that handles Escape first prevents its default.
    doc.addEventListener('keydown', onKey)
    doc.addEventListener('focusin', onFocusIn)
    stopDismiss = () => {
      doc.removeEventListener('focusin', onFocusIn)
      stopDismiss = undefined
      doc.removeEventListener('pointerdown', onDown, capture)
      doc.removeEventListener('pointermove', onMove, capture)
      doc.removeEventListener('pointerup', onUp, capture)
      doc.removeEventListener('pointercancel', onCancel, capture)
      doc.removeEventListener('keydown', onKey)
    }
  }

  /**
   * Swallows the click that follows a closing tap on `target`, and the compatibility mousedown
   * a touch tap still gets, which would focus a field. Both go at the next press.
   */
  function swallowAfterClose(doc: Document, target: EventTarget): void {
    stopAfterClose?.()
    const node = target instanceof Node ? target : null
    const ours = (e: Event): boolean =>
      node !== null &&
      e.target instanceof Node &&
      (e.target === node || e.target.contains(node))
    const swallow = (e: Event): void => {
      if (!ours(e)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.type === 'click') stopAfterClose?.()
    }
    const onNextPress = (): void => stopAfterClose?.()
    const capture = { capture: true }
    doc.addEventListener('mousedown', swallow, capture)
    doc.addEventListener('click', swallow, capture)
    // Registered after this press's own listeners have run, so it ends at the next one.
    doc.addEventListener('pointerdown', onNextPress, capture)
    stopAfterClose = () => {
      stopAfterClose = undefined
      doc.removeEventListener('mousedown', swallow, capture)
      doc.removeEventListener('click', swallow, capture)
      doc.removeEventListener('pointerdown', onNextPress, capture)
    }
  }

  /** Where the group puts the sidebar. */
  function place(placement: SidebarPlacement, first: boolean): void {
    if (destroyed) return
    const check = first && !startChecked
    startChecked = true
    // No room at the first measurement: an uncontrolled sidebar starts closed rather than over
    // the pages. Closing changes the slot, so the group places it again.
    if (check && placement.floating && !controlled && store.get().open.length > 0) {
      publish([])
      handler.onOpenChange?.(toValue([]))
      return
    }
    if (placement.floating === floating && placement.shown === placedShown) return
    floating = placement.floating
    placedShown = placement.shown
    publish()
  }

  const widthKey = (): string => `sidebar.${name ?? side}.width`

  // A sync store answers before this returns; an async one applies unless the user moved first.
  if (!widthControlled && storage)
    quietly(
      () => storage.get(widthKey()),
      (saved) => {
        if (
          destroyed ||
          touched ||
          widthControlled ||
          typeof saved !== 'number' ||
          !Number.isFinite(saved) ||
          saved <= 0 ||
          saved === width
        )
          return
        width = saved
        publish()
      }
    )

  /** A width the user chose: kept and reported when uncontrolled, only reported when controlled. */
  function chooseWidth(next: number, save: boolean): void {
    touched = true
    if (!widthControlled) {
      if (next !== width) {
        width = next
        publish()
      }
      if (save && storage) quietly(() => storage.set(widthKey(), next))
    }
    widthHandler.onWidthChange?.(next)
  }

  function resetWidth(): void {
    if (destroyed) return
    chooseWidth(defaultWidth, false)
    if (!widthControlled && storage) quietly(() => storage.remove(widthKey()))
  }

  const isOpen = (id: string): boolean => store.get().open.includes(id)

  // New words: the same state again, so renderers read the labels afresh.
  const stopMessages = messages.subscribe(() => {
    if (!destroyed) store.set({ ...store.get() })
  })

  function update(next: Partial<SidebarControllerOptions>): void {
    if (destroyed) return
    const before = store.get()
    const wasPending = pending
    if (next.pending !== undefined) pending = next.pending
    if (next.layout !== undefined) layout = next.layout
    if (next.side !== undefined) side = next.side
    if (next.visible !== undefined) visible = next.visible
    if (next.panels !== undefined && !samePanels(next.panels, panels))
      panels = next.panels
    if ('onOpenChange' in next) handler = next
    if (next.open !== undefined) controlled = true
    if ('onWidthChange' in next) widthHandler = next
    const shownBefore = shown()
    const widthBefore = width
    const minBefore = minWidth
    const maxBefore = maxWidth
    const labelBefore = handleLabel
    if (next.handleLabel !== undefined) handleLabel = next.handleLabel
    if (next.defaultWidth !== undefined) defaultWidth = next.defaultWidth
    if (next.minWidth !== undefined) minWidth = next.minWidth
    if (next.maxWidth !== undefined) maxWidth = next.maxWidth
    if (next.width !== undefined) {
      widthControlled = true
      width = next.width
    }
    // The handle's label, aria-valuemin and aria-valuemax count as well as the width shown.
    const widthChanged =
      width !== widthBefore ||
      shown() !== shownBefore ||
      minWidth !== minBefore ||
      maxWidth !== maxBefore ||
      handleLabel !== labelBefore
    // What the host asked for, else what was open. Uncontrolled, the first panel to arrive in
    // an empty sidebar opens, as it would have had it been there from the start.
    const arrived =
      !controlled && before.panels.length === 0 && before.open.length === 0
        ? panels[0]?.id
        : undefined
    const asked =
      next.open !== undefined
        ? idsOf(next.open)
        : arrived !== undefined
          ? [arrived]
          : before.open
    let open = resolve(asked)
    // Tabs collapse only through a controlled `open`: uncontrolled, with nothing open (a closed
    // rail switched to tabs), the first panel opens rather than the whole sidebar hiding.
    if (!controlled && layout === 'tabs' && open.length === 0 && panels[0] !== undefined)
      open = [panels[0].id]
    // A binding calls this on every render: publish only what changed. The root's state
    // depends on `pending` too.
    if (
      pending !== wasPending ||
      layout !== before.layout ||
      side !== before.side ||
      visible !== before.visible ||
      panels !== before.panels ||
      widthChanged ||
      !sameIds(open, before.open)
    )
      publish(open)
    // Whatever differs from that (a panel gone, stack to rail) is ours to report.
    const same =
      open.length === new Set(asked).size && open.every((id) => asked.includes(id))
    if (!same) handler.onOpenChange?.(toValue(open))
  }

  function toggle(id: string): void {
    if (destroyed || !has(id)) return
    current = id
    const open = store.get().open
    let next: string[]
    if (layout === 'stack')
      next = open.includes(id) ? open.filter((o) => o !== id) : inOrder([...open, id])
    else if (layout === 'tabs') {
      if (open.includes(id)) return
      next = [id]
    } else next = open.includes(id) ? [] : [id]
    if (!controlled) publish(next)
    handler.onOpenChange?.(toValue(next))
  }

  const triggerId = (id: string): string => `${prefix}-trigger-${id}`
  const panelId = (id: string): string => `${prefix}-panel-${id}`

  /** The rail or tabs trigger in the Tab order. */
  const tabStop = (): string | null => {
    if (current !== null && has(current)) return current
    return store.get().open[0] ?? panels[0]?.id ?? null
  }

  function triggerAttrs(id: string): Record<string, string> {
    const panel = panels.find((p) => p.id === id)
    const label = panel ? sidebarLabel(panel) : id
    const badge = sidebarBadge(panel?.badge)
    const open = isOpen(id)
    const attrs: Record<string, string> = {
      type: 'button',
      id: triggerId(id),
      'aria-controls': panelId(id),
      'aria-label':
        badge === null ? label : messages.get().messages.sidebar.tab({ label, badge }),
      'data-ink-sidebar-trigger': id,
      'data-state': open ? 'open' : 'closed',
    }
    if (layout === 'stack') attrs['aria-expanded'] = String(open)
    else {
      attrs.role = 'tab'
      attrs['aria-selected'] = String(open)
      attrs.tabindex = tabStop() === id ? '0' : '-1'
    }
    // The rail shows icons only: the tooltip carries the label.
    if (layout === 'rail') attrs.title = label
    return attrs
  }

  function panelAttrs(id: string): Record<string, string> {
    const attrs: Record<string, string> = {
      id: panelId(id),
      role: layout === 'stack' ? 'region' : 'tabpanel',
      'aria-labelledby': triggerId(id),
      'data-ink-sidebar-panel': id,
      'data-layout': layout,
    }
    if (!isOpen(id)) attrs.hidden = ''
    return attrs
  }

  function tablistAttrs(): Record<string, string> {
    if (layout === 'stack') return {}
    return {
      role: 'tablist',
      'aria-orientation': layout === 'rail' ? 'vertical' : 'horizontal',
    }
  }

  const bindings = new Set<() => void>()

  function bindTriggers(el: HTMLElement): () => void {
    // A sidebar nested in a panel has triggers of its own: only this one's ids count.
    const ours = (t: Element): t is HTMLElement =>
      t instanceof HTMLElement &&
      t.dataset.inkSidebarTrigger !== undefined &&
      t.id === triggerId(t.dataset.inkSidebarTrigger)
    const all = (): HTMLElement[] =>
      [...el.querySelectorAll<HTMLElement>(TRIGGER)].filter(ours)
    const triggers = (): HTMLElement[] =>
      all().filter((t) => !(t as HTMLButtonElement).disabled)
    const triggerOf = (target: EventTarget | null): HTMLElement | null => {
      const t = target instanceof Element ? target.closest<HTMLElement>(TRIGGER) : null
      return t && el.contains(t) && ours(t) ? t : null
    }
    const sync = (): void => {
      const stop = layout === 'stack' ? null : tabStop()
      for (const t of all()) {
        const index = stop === null || t.dataset.inkSidebarTrigger === stop ? 0 : -1
        if (t.tabIndex !== index) t.tabIndex = index
      }
    }
    const onFocusIn = (e: FocusEvent): void => {
      const t = triggerOf(e.target)
      if (!t) return
      current = t.dataset.inkSidebarTrigger ?? null
      sync()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const t = triggerOf(e.target)
      if (!t) return
      const list = triggers()
      const i = list.indexOf(t)
      if (i < 0) return
      const [back, forward] =
        layout === 'tabs' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
      const last = list.length - 1
      const next =
        e.key === forward
          ? i === last
            ? 0
            : i + 1
          : e.key === back
            ? i === 0
              ? last
              : i - 1
            : e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? last
                : -1
      if (next < 0) return
      e.preventDefault()
      list[next]!.focus()
    }
    // Enter and Space reach here as the native button's click.
    const onClick = (e: MouseEvent): void => {
      const t = triggerOf(e.target)
      const id = t?.dataset.inkSidebarTrigger
      if (id === undefined || (t as HTMLButtonElement).disabled) return
      toggle(id)
    }
    // A framework may replace the triggers at any time: new ones get the right tabindex.
    // Only added nodes and changed trigger attributes matter; content churn returns early.
    const touchesOurs = (records: MutationRecord[]): boolean =>
      records.some((r) =>
        r.type === 'attributes'
          ? ours(r.target as Element)
          : [...r.addedNodes].some(
              (node) =>
                node instanceof Element &&
                (ours(node) || [...node.querySelectorAll(TRIGGER)].some(ours))
            )
      )
    const observer = new MutationObserver((records) => {
      if (touchesOurs(records)) sync()
    })
    observer.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-ink-sidebar-trigger', 'id'],
    })
    const stopState = store.subscribe(sync)
    el.addEventListener('focusin', onFocusIn)
    el.addEventListener('keydown', onKeyDown)
    el.addEventListener('click', onClick)
    sync()
    const unbind = (): void => {
      if (!bindings.delete(unbind)) return
      observer.disconnect()
      stopState()
      el.removeEventListener('focusin', onFocusIn)
      el.removeEventListener('keydown', onKeyDown)
      el.removeEventListener('click', onClick)
    }
    bindings.add(unbind)
    return unbind
  }

  const panelsId = `${prefix}-panels`

  function handleAttrs(): Record<string, string> {
    const attrs: Record<string, string> = {
      'data-ink-sidebar-handle': '',
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-label':
        handleLabel !== undefined
          ? resolveLabel(handleLabel)
          : side === 'left'
            ? messages.get().messages.sidebar.resizeLeft
            : messages.get().messages.sidebar.resizeRight,
      'aria-valuemin': String(Math.round(minWidth)),
      'aria-valuemax': String(Math.round(maxWidth)),
      'aria-valuenow': String(Math.round(shown())),
      tabindex: '0',
    }
    // The stack has no panels element to name.
    if (layout !== 'stack') attrs['aria-controls'] = panelsId
    if (!visible || store.get().open.length === 0) attrs.hidden = ''
    return attrs
  }

  function bindHandle(el: HTMLElement): () => void {
    /**
     * The drag under way: its pointer, where it started, the width then, the last one chosen and
     * whether it has chosen any.
     */
    let drag: {
      pointer: number
      x: number
      width: number
      last: number
      moved: boolean
    } | null = null
    // Toward the document is wider: right for a left sidebar, left for a right one.
    const wider = (): number => (side === 'left' ? 1 : -1)
    const setResizing = (on: boolean): void => {
      if (resizing === on) return
      resizing = on
      publish()
    }
    const onPointerDown = (e: PointerEvent): void => {
      if (destroyed || drag) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.preventDefault()
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        // A pointer the browser no longer tracks: the drag still follows its events here.
      }
      // From the chosen width, not the shown one: a narrowed sidebar must not save its narrowing.
      const from = clampWidth(width)
      drag = {
        pointer: e.pointerId,
        x: e.clientX,
        width: from,
        last: from,
        moved: false,
      }
      setResizing(true)
    }
    /** Ends the drag; saves only when it moved, so a press or a double-click writes nothing. */
    const endDrag = (): void => {
      if (!drag) return
      const { moved } = drag
      drag = null
      setResizing(false)
      if (moved && !widthControlled && storage)
        quietly(() => storage.set(widthKey(), width))
    }
    const onPointerMove = (e: PointerEvent): void => {
      if (!drag || e.pointerId !== drag.pointer) return
      // The button came up where no pointerup reached us.
      if (e.pointerType === 'mouse' && e.buttons === 0) return endDrag()
      const next = clampWidth(drag.width + (e.clientX - drag.x) * wider())
      if (next === drag.last) return
      drag.last = next
      drag.moved = true
      chooseWidth(next, false)
    }
    // pointerup, pointercancel, and lostpointercapture when the capture goes without either.
    const onPointerEnd = (e: PointerEvent): void => {
      if (drag && e.pointerId === drag.pointer) endDrag()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const now = clampWidth(width)
      let next: number | null
      if (e.key === 'ArrowRight') next = clampWidth(now + KEY_STEP * wider())
      else if (e.key === 'ArrowLeft') next = clampWidth(now - KEY_STEP * wider())
      else if (e.key === 'Home') next = minWidth
      else if (e.key === 'End') next = maxWidth
      else if (e.key === 'Enter') next = null
      else return
      e.preventDefault()
      if (next === null) resetWidth()
      else chooseWidth(next, true)
    }
    const onDoubleClick = (): void => resetWidth()

    // The group is the root's parent's. createSidebar binds before the host places the root, so
    // the root is watched: it gets a size once placed, and loses it once removed.
    const root = el.closest<HTMLElement>('[data-ink-sidebar]') ?? el.parentElement
    let ours: SidebarGroupMembership | undefined
    const leave = (): void => {
      if (!ours) return
      ours.leave()
      stopAfterClose?.()
      if (membership === ours) {
        membership = undefined
        groupParent = null
        groupRoot = null
        syncDismiss()
      }
      ours = undefined
      if (floating || placedShown !== undefined) {
        floating = false
        placedShown = undefined
        if (!destroyed) publish()
      }
    }
    const join = (): void => {
      const parent = root?.parentElement ?? null
      if (ours && parent === groupParent) return
      leave()
      if (!parent || destroyed) return
      groupParent = parent
      groupRoot = root
      lastSlot = signature()
      ours = membership = joinSidebarGroup(parent, { slot, place })
      // Placing on joining may have closed the panel before the group could hear of it.
      tellGroup()
    }
    if (root)
      railWidth = () => {
        try {
          const value = getComputedStyle(root)
            .getPropertyValue('--ink-sidebar-rail-width')
            .trim()
          const px = value.endsWith('px') ? parseFloat(value) : NaN
          return Number.isFinite(px) && px >= 0 ? px : RAIL_WIDTH
        } catch {
          return RAIL_WIDTH
        }
      }
    let observer: ResizeObserver | undefined
    if (root && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (!destroyed) join()
      })
      observer.observe(root)
    }
    join()

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerEnd)
    el.addEventListener('pointercancel', onPointerEnd)
    el.addEventListener('lostpointercapture', onPointerEnd)
    el.addEventListener('keydown', onKeyDown)
    el.addEventListener('dblclick', onDoubleClick)
    const unbind = (): void => {
      if (!bindings.delete(unbind)) return
      observer?.disconnect()
      leave()
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerEnd)
      el.removeEventListener('pointercancel', onPointerEnd)
      el.removeEventListener('lostpointercapture', onPointerEnd)
      el.removeEventListener('keydown', onKeyDown)
      el.removeEventListener('dblclick', onDoubleClick)
      if (drag) {
        drag = null
        if (!destroyed) setResizing(false)
      }
    }
    bindings.add(unbind)
    return unbind
  }

  const controller: SidebarController = {
    state: readonly(store),
    update,
    toggle,
    isOpen,
    rootAttrs: () => ({
      'data-ink-sidebar': '',
      'data-layout': layout,
      'data-side': side,
      'data-state':
        store.get().open.length > 0 || (pending && !controlled) ? 'open' : 'closed',
      ...(resizing && { 'data-resizing': '' }),
      ...(floating && { 'data-overlay': '' }),
      ...(!visible && { hidden: '' }),
    }),
    rootStyle: () => ({ '--ink-sidebar-width': `${shown()}px` }),
    panelsAttrs: () => ({ id: panelsId }),
    handleAttrs,
    bindHandle,
    resetWidth,
    tablistAttrs,
    triggerAttrs,
    panelAttrs,
    bindTriggers,
    destroy() {
      if (destroyed) return
      destroyed = true
      stopMessages()
      for (const unbind of [...bindings]) unbind()
      stopDismiss?.()
      stopAfterClose?.()
      for (const fn of destroyHooks.get(controller) ?? []) fn()
      destroyHooks.delete(controller)
    },
  }
  destroyHooks.set(controller, [])
  return controller
}
