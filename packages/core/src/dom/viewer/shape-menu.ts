/*
 * The shape menu for createViewer: a split button with the same markup, classes and data
 * attributes as the bindings' `InkShapeMenu`, so `@inkbar/theme` styles both. The main button
 * activates the shape tool with the current kind and draws that kind's icon; the chevron
 * opens a two-column grid of kinds. Choosing one switches to the shape tool with that kind.
 */
import { ChevronDown } from '@inkbar/icons'

import { SHAPE_ICONS } from '../shape-icons'
import { SHAPE_KINDS, type ShapeKind, type ToolController } from '../tools'
import { SHAPE_COLUMNS, shapeMenuModel, type ShapeMenuModel } from '../ui'

import { createIcon } from './controls'
import { h } from './dom'
import { createMenu } from './menu'

import type { Viewer } from './create-viewer'

/** A split button: the main part draws with the current shape kind, the chevron picks the kind. */
export function createShapeMenu(viewer: Viewer): HTMLElement {
  const main = h('button', {
    type: 'button',
    class: 'ink-tool-button ink-shape-button',
    'data-ink-tool-button': '',
    'data-ink-shape-button': '',
    'data-tool': 'shape',
    'data-state': 'off',
    'aria-pressed': 'false',
  })
  const trigger = h('button', {
    type: 'button',
    class: 'ink-menu-trigger ink-shape-menu-trigger',
    'data-ink-shape-menu-trigger': '',
    'data-state': 'closed',
    'aria-label': 'Choose shape',
    title: 'Choose shape',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  })
  trigger.append(createIcon(ChevronDown))
  const root = h(
    'div',
    {
      class: 'ink-split-button ink-shape-menu',
      'data-ink-shape-menu': '',
      role: 'group',
      'aria-label': 'Shape',
    },
    main,
    trigger
  )
  main.disabled = true
  trigger.disabled = true

  let tools: ToolController | null = null
  let stops: (() => void)[] = []
  let shownKind: ShapeKind | null = null

  const model = (): ShapeMenuModel =>
    shapeMenuModel(tools?.options('shape').get() ?? {}, SHAPE_KINDS)

  function refresh(): void {
    const m = model()
    main.disabled = trigger.disabled = tools === null
    main.setAttribute('aria-label', m.label)
    main.title = m.label
    main.dataset.kind = m.kind
    if (shownKind !== m.kind) {
      main.replaceChildren(createIcon(SHAPE_ICONS[m.kind]))
      shownKind = m.kind
    }
    const on = tools?.active.get() === 'shape'
    main.dataset.state = on ? 'on' : 'off'
    main.setAttribute('aria-pressed', String(on))
    menu.refresh()
  }

  function paint(panel: HTMLElement, m: ShapeMenuModel): void {
    if (panel.childElementCount === 0) {
      const grid = h('div', {
        role: 'group',
        'aria-label': 'Shapes',
        class: 'ink-shape-grid',
        'data-ink-menu-columns': String(SHAPE_COLUMNS),
      })
      for (const item of m.items) {
        const b = h(
          'button',
          {
            type: 'button',
            role: 'menuitemradio',
            class: 'ink-select-item ink-menu-item ink-shape-item',
            'data-ink-select-item': '',
            'data-key': item.kind,
            tabindex: '-1',
          },
          item.label
        )
        b.prepend(createIcon(SHAPE_ICONS[item.kind]))
        b.addEventListener('click', () => {
          tools?.set('shape', { kind: item.kind })
          menu.close(true)
        })
        grid.append(b)
      }
      panel.append(grid)
    }
    const cells = panel.querySelectorAll<HTMLElement>('.ink-shape-item')
    m.items.forEach((item, i) => {
      cells[i]!.setAttribute('aria-checked', String(item.checked))
      cells[i]!.dataset.state = item.checked ? 'checked' : 'unchecked'
    })
  }

  const menu = createMenu(trigger, {
    label: 'Shapes',
    attrs: { 'data-ink-menu': 'shape' },
    render: (panel) => paint(panel, model()),
  })

  main.addEventListener('click', () => tools?.set('shape'))

  const follow = (next: ToolController | null): void => {
    for (const stop of stops) stop()
    stops = []
    tools = next
    if (tools)
      stops = [tools.active.subscribe(refresh), tools.options('shape').subscribe(refresh)]
    if (!tools) menu.close()
    refresh()
  }
  follow(viewer.tools.get())
  viewer.tools.subscribe(follow)
  return root
}
