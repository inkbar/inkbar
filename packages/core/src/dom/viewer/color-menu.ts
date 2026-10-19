/*
 * The colour menus for createViewer: the same markup, classes and data attributes as the
 * bindings' `InkColorMenu`, so `@inkbar/theme` styles both. The trigger shows the current
 * colour as a swatch and follows the viewer's tool style (disabled while nothing supports the
 * property); the panel is created on open and removed on close.
 */
import { Check } from '@inkbar/icons'

import {
  COLOR_COLUMNS,
  colorMenuModel,
  type ColorMenuModel,
  type ColorProperty,
} from '../ui'

import { createIcon } from './controls'
import { h } from './dom'
import { createMenu } from './menu'

import type { Viewer } from './create-viewer'
import type { ToolStyle } from '../../model/annotations/tool-style'

export interface ColorMenuOptions {
  property: ColorProperty
  /** Accessible name; defaults to "Border colour", "Fill colour" or "Text colour". */
  label?: string
}

/** Sets a swatch element's kind and colour from the model's trigger. */
function paintSwatch(swatch: HTMLElement, model: ColorMenuModel): void {
  const t = model.trigger
  swatch.dataset.kind = t.kind
  if (t.kind === 'color') {
    swatch.dataset.color = t.color
    swatch.style.setProperty('--ink-swatch', t.color)
  } else {
    delete swatch.dataset.color
    swatch.style.removeProperty('--ink-swatch')
  }
}

function checkmark(): HTMLElement {
  const span = h('span', { class: 'ink-select-indicator' })
  span.append(createIcon(Check))
  return span
}

/** A button that opens a colour menu for one colour property of the selection or tool. */
export function createColorMenu(
  viewer: Viewer,
  opts: ColorMenuOptions
): HTMLButtonElement {
  const { property } = opts
  const name = opts.label ?? colorMenuModel(property, {}, new Set()).label
  const trigger = h('button', {
    type: 'button',
    class: 'ink-menu-trigger ink-color-menu',
    'data-ink-color-menu': property,
    'data-state': 'closed',
    'aria-label': name,
    title: name,
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  })
  const swatch = h('span', {
    class: 'ink-swatch',
    'data-ink-swatch': '',
    'data-property': property,
    'aria-hidden': 'true',
  })
  trigger.append(swatch)
  trigger.disabled = true

  let style: ToolStyle | null = null
  let stops: (() => void)[] = []

  const model = (): ColorMenuModel =>
    colorMenuModel(
      property,
      style?.current.get() ?? {},
      style?.supported.get() ?? new Set()
    )

  function refresh(): void {
    const m = model()
    trigger.disabled = !m.enabled
    if (m.mixed) trigger.setAttribute('data-mixed', '')
    else trigger.removeAttribute('data-mixed')
    paintSwatch(swatch, m)
    menu.refresh()
  }

  function paint(root: HTMLElement, m: ColorMenuModel): void {
    if (root.childElementCount === 0) {
      if (m.noFill) {
        const b = h(
          'button',
          {
            type: 'button',
            role: 'menuitemradio',
            class: 'ink-select-item ink-menu-item',
            'data-ink-select-item': '',
            'data-key': 'no-fill',
            tabindex: '-1',
          },
          'No fill'
        )
        b.addEventListener('click', () => {
          const found = model().noFill
          if (found) style?.set(found.patch)
        })
        root.append(b)
      }
      const grid = h('div', {
        role: 'group',
        'aria-label': 'Colours',
        class: 'ink-color-grid',
        'data-ink-menu-columns': String(COLOR_COLUMNS),
      })
      for (const sw of m.swatches) {
        const b = h('button', {
          type: 'button',
          role: 'menuitemradio',
          class: 'ink-swatch-item',
          'aria-label': sw.label,
          'data-key': sw.key,
          tabindex: '-1',
        })
        b.style.setProperty('--ink-swatch', sw.color)
        b.addEventListener('click', () => {
          const found = model().swatches.find((s) => s.key === sw.key)
          if (found) style?.set(found.patch)
        })
        grid.append(b)
      }
      root.append(grid)
      const input = h('input', {
        type: 'color',
        class: 'ink-color-input',
        'aria-label': 'Custom colour',
        tabindex: '-1',
      })
      input.addEventListener('change', () => style?.set(model().custom(input.value)))
      const custom = h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          class: 'ink-select-item ink-menu-item',
          'data-ink-select-item': '',
          'data-key': 'custom',
          tabindex: '-1',
        },
        'Custom…'
      )
      custom.addEventListener('click', () => input.click())
      root.append(custom, input)
    }
    const noFill = root.querySelector<HTMLElement>('[data-key="no-fill"]')
    if (noFill && m.noFill) mark(noFill, m.noFill.checked, true)
    const cells = root.querySelectorAll<HTMLElement>('.ink-swatch-item')
    m.swatches.forEach((sw, i) => mark(cells[i]!, sw.checked, false))
    const input = root.querySelector<HTMLInputElement>('input[type="color"]')!
    input.value = m.customValue.toLowerCase()
  }

  /** Reflects checked state on an item; `withMark` adds the check icon (labelled items). */
  function mark(el: HTMLElement, checked: boolean, withMark: boolean): void {
    el.setAttribute('aria-checked', String(checked))
    el.dataset.state = checked ? 'checked' : 'unchecked'
    if (!withMark) return
    const existing = el.querySelector('.ink-select-indicator')
    if (checked && !existing) el.append(checkmark())
    else if (!checked) existing?.remove()
  }

  const menu = createMenu(trigger, {
    label: opts.label ?? model().label,
    attrs: { 'data-ink-menu': `color-${property}` },
    render: (root) => paint(root, model()),
  })

  const follow = (engine: { toolStyle: ToolStyle } | null): void => {
    for (const stop of stops) stop()
    stops = []
    style = engine?.toolStyle ?? null
    if (style)
      stops = [style.current.subscribe(refresh), style.supported.subscribe(refresh)]
    if (!style) menu.close()
    refresh()
  }
  follow(viewer.engine.get())
  viewer.engine.subscribe(follow)
  return trigger
}
