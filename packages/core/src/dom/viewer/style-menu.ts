/*
 * The line style menu for createViewer: the same markup, classes and data attributes as the
 * bindings' `InkLineStyleMenu`, so `@inkbar/theme` styles both. The trigger follows the
 * viewer's tool style (disabled while nothing supports line style, `data-mixed` when the
 * selection disagrees); the panel is created on open and removed on close.
 */
import { Check, Minus } from '@inkbar/icons'

import { focusInitialMenuItem, handleMenuKeys } from '../menu-keys'
import { lineStyleMenuModel, type LineStyleMenuModel } from '../ui'

import { createIcon } from './controls'
import { h } from './dom'

import type { Viewer } from './create-viewer'
import type { ToolStyle } from '../../model/annotations/tool-style'

const GAP = 4
const MARGIN = 8

/** A button that opens the line style menu: weight, solid or dashed, and arrowheads. */
export function createLineStyleMenu(viewer: Viewer): HTMLButtonElement {
  const trigger = h('button', {
    type: 'button',
    class: 'ink-menu-trigger ink-line-style-menu',
    'data-ink-line-style-menu': '',
    'data-state': 'closed',
    'aria-label': 'Line style',
    title: 'Line style',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  })
  trigger.append(createIcon(Minus))
  trigger.disabled = true

  let style: ToolStyle | null = null
  let stops: (() => void)[] = []
  let panel: HTMLElement | null = null
  let closePanel: (() => void) | null = null

  const model = (): LineStyleMenuModel =>
    lineStyleMenuModel(style?.current.get() ?? {}, style?.supported.get() ?? new Set())

  function refresh(): void {
    const m = model()
    trigger.disabled = !m.enabled
    if (m.mixed) trigger.setAttribute('data-mixed', '')
    else trigger.removeAttribute('data-mixed')
    if (panel) paint(panel, m)
  }

  /** Builds the panel's sections on the first call; later calls update them in place. */
  function paint(root: HTMLElement, m: LineStyleMenuModel): void {
    const menu = root.querySelector<HTMLElement>('[role="menu"]')!
    if (menu.childElementCount === 0) {
      for (const section of m.sections) {
        const group = h(
          'div',
          { role: 'group', class: 'ink-menu-group', 'aria-label': section.label },
          h('div', { class: 'ink-menu-label', 'aria-hidden': 'true' }, section.label)
        )
        for (const item of section.items) {
          const b = h(
            'button',
            {
              type: 'button',
              role: 'menuitemradio',
              class: 'ink-select-item ink-menu-item',
              'data-ink-select-item': '',
              tabindex: '-1',
              'data-key': item.key,
            },
            item.label
          )
          b.addEventListener('click', () => {
            const found = model()
              .sections.flatMap((s) => s.items)
              .find((i) => i.key === item.key && i.label === item.label)
            if (found) style?.set(found.patch)
          })
          group.append(b)
        }
        menu.append(group)
      }
    }
    m.sections.forEach((section, i) => {
      const group = menu.children[i] as HTMLElement
      group.toggleAttribute('data-disabled', section.disabled)
      if (section.disabled) group.setAttribute('aria-disabled', 'true')
      else group.removeAttribute('aria-disabled')
      section.items.forEach((item, j) => {
        const b = group.children[j + 1] as HTMLButtonElement
        b.disabled = section.disabled
        b.setAttribute('aria-checked', String(item.checked))
        b.dataset.state = item.checked ? 'checked' : 'unchecked'
        const mark = b.querySelector('.ink-select-indicator')
        if (item.checked && !mark) {
          const span = h('span', { class: 'ink-select-indicator' })
          span.append(createIcon(Check))
          b.append(span)
        } else if (!item.checked) mark?.remove()
      })
    })
  }

  function place(): void {
    if (!panel) return
    const r = trigger.getBoundingClientRect()
    const { innerWidth: vw, innerHeight: vh } = window
    const w = panel.offsetWidth
    const ht = panel.offsetHeight
    let top = r.bottom + GAP
    if (top + ht > vh - MARGIN && r.top - GAP - ht >= MARGIN) top = r.top - GAP - ht
    top = Math.max(MARGIN, Math.min(top, vh - ht - MARGIN))
    panel.style.position = 'fixed'
    panel.style.left = `${Math.max(MARGIN, Math.min(r.left, vw - w - MARGIN))}px`
    panel.style.top = `${top}px`
  }

  function open(): void {
    if (panel || trigger.disabled) return
    const menu = h('div', {
      role: 'menu',
      'aria-label': 'Line style',
    })
    panel = h(
      'div',
      {
        class: 'ink-select-content ink-menu-content',
        'data-ink-select-content': '',
        'data-ink-menu': 'line-style',
        role: 'dialog',
        'aria-label': 'Line style',
      },
      menu
    )
    panel.style.visibility = 'hidden'
    document.body.append(panel)
    paint(panel, model())
    place()
    panel.style.visibility = ''
    trigger.setAttribute('aria-expanded', 'true')
    trigger.dataset.state = 'open'
    focusInitialMenuItem(menu)

    const current = panel
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(true)
      } else if (current.contains(e.target as Node)) handleMenuKeys(e, menu)
    }
    const onPress = (e: PointerEvent): void => {
      const t = e.target as Node
      if (current.contains(t) || trigger.contains(t)) return
      close(false)
    }
    const onFocus = (e: FocusEvent): void => {
      const t = e.target as Node
      if (!current.contains(t) && !trigger.contains(t)) close(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPress, true)
    document.addEventListener('focusin', onFocus)
    window.addEventListener('resize', place)
    document.addEventListener('scroll', place, true)
    closePanel = () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPress, true)
      document.removeEventListener('focusin', onFocus)
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', place, true)
      current.remove()
    }
  }

  function close(restoreFocus: boolean): void {
    if (!panel) return
    closePanel?.()
    closePanel = null
    panel = null
    trigger.setAttribute('aria-expanded', 'false')
    trigger.dataset.state = 'closed'
    if (restoreFocus) trigger.focus()
  }

  trigger.addEventListener('click', () => (panel ? close(true) : open()))
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && !panel && !trigger.disabled) {
      e.preventDefault()
      open()
    }
  })

  const follow = (engine: { toolStyle: ToolStyle } | null): void => {
    for (const stop of stops) stop()
    stops = []
    style = engine?.toolStyle ?? null
    if (style)
      stops = [style.current.subscribe(refresh), style.supported.subscribe(refresh)]
    // The panel's old style is gone with the old document.
    if (!style) close(false)
    refresh()
  }
  follow(viewer.engine.get())
  viewer.engine.subscribe(follow)
  return trigger
}
