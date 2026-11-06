/*
 * The sidebar without a framework: the rail, tabs or stack headers built on a sidebar
 * controller, with each panel's content element inside its panel. Content elements are moved,
 * never recreated, so their state survives switching panels and layouts. It needs no viewer:
 * put it beside the viewer with your own layout (flex, grid). `controller.destroy()` stops it.
 */
import { createIcon } from '../viewer/controls'
import { h } from '../viewer/dom'

import {
  createSidebarController,
  onSidebarDestroy,
  sidebarBadge,
  type SidebarController,
  type SidebarControllerOptions,
  type SidebarPanelInfo,
  type SidebarState,
} from './controller'

/** The attribute names each element was last given, so ones dropped since are removed. */
const given = new WeakMap<Element, string[]>()

function setAttrs(el: Element, attrs: Record<string, string>): void {
  for (const name of given.get(el) ?? []) if (!(name in attrs)) el.removeAttribute(name)
  for (const [name, value] of Object.entries(attrs))
    if (el.getAttribute(name) !== value) el.setAttribute(name, value)
  given.set(el, Object.keys(attrs))
}

/**
 * A sidebar of `opts.panels` in `opts.layout` (`'rail'` by default) on `opts.side`, showing
 * `opts.content[id]` in each panel. Returns the root element and its controller, which opens
 * panels from code (`toggle`, `update({ open })`) and takes new panels or a new layout.
 */
export function createSidebar(
  opts: SidebarControllerOptions & { content: Record<string, HTMLElement> }
): { element: HTMLElement; controller: SidebarController } {
  const { content, ...options } = opts
  const controller = createSidebarController(options)
  const root = h('div', { class: 'ink-sidebar' })

  let shape = ''
  const triggers = new Map<string, HTMLButtonElement>()
  const panels = new Map<string, HTMLElement>()
  let list: HTMLElement | null = null

  function makeTrigger(p: SidebarPanelInfo, cls: string | null): HTMLButtonElement {
    const b = h('button', cls ? { class: cls } : {})
    if (p.icon) b.append(createIcon(p.icon))
    if (!p.icon || controller.state.get().layout !== 'rail')
      b.append(h('span', { class: 'ink-sidebar-label' }, p.label))
    b.append(h('span', { class: 'ink-sidebar-badge', 'aria-hidden': 'true' }))
    return b
  }

  /** A panel: its title, shown in the rail, over a body holding its content. */
  function makePanel(p: SidebarPanelInfo): HTMLElement {
    const panel =
      panels.get(p.id) ??
      h(
        'div',
        { class: 'ink-sidebar-panel' },
        // The rail button names the panel for assistive technology; this repeats it on screen.
        h('div', { class: 'ink-sidebar-panel-title', 'aria-hidden': 'true' }, p.label),
        h('div', { class: 'ink-sidebar-panel-body' })
      )
    const body = panel.lastElementChild!
    const own = content[p.id]
    if (own && own.parentElement !== body) body.append(own)
    return panel
  }

  /** Rebuilds the structure for a new layout or new panels, moving the content along. */
  function build(s: SidebarState): void {
    const active = root.ownerDocument.activeElement
    const focused =
      active instanceof HTMLElement && root.contains(active)
        ? [...triggers].find(([, t]) => t === active)?.[0]
        : undefined
    triggers.clear()
    // Panels that stay keep their element, and their content with it.
    const built = s.panels.map((p) => [p, makePanel(p)] as const)
    panels.clear()
    for (const [p, panel] of built) panels.set(p.id, panel)
    if (s.layout === 'stack') {
      list = null
      root.replaceChildren(
        ...built.map(([p, panel]) => {
          const header = makeTrigger(p, 'ink-sidebar-header')
          triggers.set(p.id, header)
          return h('div', { class: 'ink-sidebar-section' }, header, panel)
        })
      )
    } else {
      list = h('div', {
        class: s.layout === 'rail' ? 'ink-sidebar-rail' : 'ink-sidebar-tabs',
      })
      for (const [p] of built) {
        const t = makeTrigger(p, null)
        triggers.set(p.id, t)
        list.append(t)
      }
      root.replaceChildren(
        list,
        h('div', { class: 'ink-sidebar-panels' }, ...built.map(([, panel]) => panel))
      )
    }
    paint(s)
    if (focused !== undefined) triggers.get(focused)?.focus()
  }

  /** Attributes, labels and badges, in place: the focused trigger keeps focus. */
  function paint(s: SidebarState): void {
    // Classes are set once when built, so a host's own classes stay.
    setAttrs(root, controller.rootAttrs())
    if (list) setAttrs(list, controller.tablistAttrs())
    for (const p of s.panels) {
      const t = triggers.get(p.id)
      const panel = panels.get(p.id)
      if (t) {
        setAttrs(t, controller.triggerAttrs(p.id))
        const label = t.querySelector('.ink-sidebar-label')
        if (label && label.textContent !== p.label) label.textContent = p.label
        const badge = t.querySelector<HTMLElement>('.ink-sidebar-badge')!
        const text = sidebarBadge(p.badge)
        badge.textContent = text ?? ''
        badge.hidden = text === null
      }
      if (panel) {
        setAttrs(panel, controller.panelAttrs(p.id))
        const title = panel.firstElementChild!
        if (title.textContent !== p.label) title.textContent = p.label
      }
    }
  }

  function show(s: SidebarState): void {
    const next = JSON.stringify([
      s.layout,
      s.panels.map((p) => [p.id, p.label, p.icon ?? null]),
    ])
    if (next !== shape) {
      shape = next
      build(s)
    } else paint(s)
  }

  show(controller.state.get())
  const stopState = controller.state.subscribe(show)
  const unbind = controller.bindTriggers(root)
  onSidebarDestroy(controller, () => {
    stopState()
    unbind()
  })
  return { element: root, controller }
}
