/*
 * The sidebar's state, ARIA and keys, for createSidebar and for the bindings' components, which
 * render their own markup and spread what this gives them. It needs no document or viewer.
 *
 * Rail and tabs follow the WAI-ARIA tabs pattern with manual activation: arrow keys move focus,
 * Enter or Space (the native button's click) opens. Stack follows the accordion pattern: every
 * header is a Tab stop with `aria-expanded`.
 */
import { readonly, writable, type Readable } from '../../model/readable'

import type { IconNode } from '@inkbar/icons'

export type SidebarLayout = 'rail' | 'tabs' | 'stack'
export type SidebarSide = 'left' | 'right'

export interface SidebarPanelInfo {
  id: string
  label: string
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
}

export interface SidebarState {
  layout: SidebarLayout
  side: SidebarSide
  panels: readonly SidebarPanelInfo[]
  /** The open panels' ids, in panel order: at most one for rail and tabs. */
  open: readonly string[]
  visible: boolean
}

export interface SidebarController {
  readonly state: Readable<SidebarState>
  /**
   * Takes new options. `open` given makes the sidebar controlled. When the panels no longer
   * hold an open one, rail and tabs open the first remaining and stack drops it; the new value
   * goes to `onOpenChange`, controlled or not.
   */
  update(opts: Partial<SidebarControllerOptions>): void
  /** What activating `id`'s trigger does: rail opens or closes, tabs switch, stack expands or collapses. */
  toggle(id: string): void
  isOpen(id: string): boolean
  /**
   * `data-ink-sidebar`, `data-layout`, `data-side` and `data-state` (`open` while any panel is,
   * and while pending and uncontrolled, as the first panel will open) for the root, and
   * `hidden` while it is not `visible`.
   */
  rootAttrs(): Record<string, string>
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

/** The text a badge shows, or null when it is hidden (empty or 0). */
export function sidebarBadge(badge: string | number | undefined): string | null {
  if (badge === undefined || badge === null) return null
  const text = String(badge).trim()
  return text === '' || text === '0' ? null : text
}

const TRIGGER = '[data-ink-sidebar-trigger]'

let count = 0

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
  })

  const publish = (open: readonly string[]): void =>
    store.set({ layout, side, panels, open, visible })

  const isOpen = (id: string): boolean => store.get().open.includes(id)

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
    const label = panel?.label ?? id
    const badge = sidebarBadge(panel?.badge)
    const open = isOpen(id)
    const attrs: Record<string, string> = {
      type: 'button',
      id: triggerId(id),
      'aria-controls': panelId(id),
      'aria-label': badge === null ? label : `${label}, ${badge}`,
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
      ...(!visible && { hidden: '' }),
    }),
    tablistAttrs,
    triggerAttrs,
    panelAttrs,
    bindTriggers,
    destroy() {
      if (destroyed) return
      destroyed = true
      for (const unbind of [...bindings]) unbind()
      for (const fn of destroyHooks.get(controller) ?? []) fn()
      destroyHooks.delete(controller)
    },
  }
  destroyHooks.set(controller, [])
  return controller
}
