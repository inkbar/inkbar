/*
 * The highlight menu for createViewer: a split button with the same markup, classes and data
 * attributes as the bindings' `InkHighlightMenu`, so `@inkbar/theme` styles both. The main
 * button activates the highlight tool with the current markup kind and draws that kind's icon;
 * the chevron opens a menu of kinds plus the markup colour. Choosing a kind switches to the
 * highlight tool with that kind. The colour is a nested colour menu scoped to the `markup`
 * style group, so it works whatever tool is active.
 */
import { ChevronDown } from '@inkbar/icons'

import { writable } from '../../model/readable'
import { MARKUP_ICONS } from '../markup-icons'
import { MARKUP_KINDS, type MarkupKind, type ToolController } from '../tools'
import { highlightMenuModel, type HighlightMenuModel } from '../ui'

import { createColorMenu } from './color-menu'
import { createIcon } from './controls'
import { h } from './dom'
import { createMenu } from './menu'

import type { Viewer } from './create-viewer'

/** The nested colour menu's accessible name. */
const COLOUR_LABEL = 'Highlight colour'

/** A split button: the main part marks text with the current kind, the chevron picks it. */
export function createHighlightMenu(viewer: Viewer): HTMLElement {
  const main = h('button', {
    type: 'button',
    class: 'ink-tool-button ink-highlight-button',
    'data-ink-tool-button': '',
    'data-ink-highlight-button': '',
    'data-tool': 'highlight',
    'data-state': 'off',
    'aria-pressed': 'false',
  })
  const trigger = h('button', {
    type: 'button',
    class: 'ink-menu-trigger ink-highlight-menu-trigger',
    'data-ink-highlight-menu-trigger': '',
    'data-state': 'closed',
    'aria-label': 'Choose highlight',
    title: 'Choose highlight',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  })
  trigger.append(createIcon(ChevronDown))
  const root = h(
    'div',
    {
      class: 'ink-split-button ink-highlight-menu',
      'data-ink-highlight-menu': '',
      role: 'group',
      'aria-label': 'Highlight',
    },
    main,
    trigger
  )
  main.disabled = true
  trigger.disabled = true

  /** The colour the chosen kind gets while the markup style leaves it unset. */
  const defaultColour = writable<string | undefined>(undefined)
  // One colour menu for the life of the control; each panel adopts its trigger.
  const colour = createColorMenu(viewer, {
    property: 'border',
    group: 'markup',
    label: COLOUR_LABEL,
    fallback: defaultColour,
  })
  colour.setAttribute('role', 'menuitem')
  colour.tabIndex = -1

  let tools: ToolController | null = null
  let stops: (() => void)[] = []
  let shownKind: MarkupKind | null = null

  const model = (): HighlightMenuModel =>
    highlightMenuModel(tools?.options('highlight').get() ?? {}, MARKUP_KINDS)

  function refresh(): void {
    const m = model()
    main.disabled = trigger.disabled = tools === null
    main.setAttribute('aria-label', m.label)
    main.title = m.label
    main.dataset.kind = m.kind
    if (shownKind !== m.kind) {
      main.replaceChildren(createIcon(MARKUP_ICONS[m.kind]))
      shownKind = m.kind
    }
    const on = tools?.active.get() === 'highlight'
    main.dataset.state = on ? 'on' : 'off'
    main.setAttribute('aria-pressed', String(on))
    defaultColour.set(viewer.document.get()?.annotations.defaults.color(m.kind))
    menu.refresh()
  }

  function paint(panel: HTMLElement, m: HighlightMenuModel): void {
    if (panel.childElementCount === 0) {
      const kinds = h('div', {
        role: 'group',
        'aria-label': 'Kinds',
        class: 'ink-highlight-kinds',
      })
      for (const item of m.items) {
        const b = h(
          'button',
          {
            type: 'button',
            role: 'menuitemradio',
            class: 'ink-select-item ink-menu-item ink-highlight-item',
            'data-ink-select-item': '',
            'data-key': item.kind,
            tabindex: '-1',
          },
          item.label
        )
        b.prepend(createIcon(MARKUP_ICONS[item.kind]))
        b.addEventListener('click', () => {
          tools?.set('highlight', { kind: item.kind })
          menu.close(true)
        })
        kinds.append(b)
      }
      const colourRow = h(
        'div',
        { role: 'group', 'aria-label': 'Colour', class: 'ink-highlight-colour' },
        h(
          'span',
          { class: 'ink-highlight-colour-label', 'aria-hidden': 'true' },
          'Colour'
        ),
        colour
      )
      panel.append(
        kinds,
        h('div', { role: 'separator', class: 'ink-select-separator' }),
        colourRow
      )
    }
    const cells = panel.querySelectorAll<HTMLElement>('.ink-highlight-item')
    m.items.forEach((item, i) => {
      cells[i]!.setAttribute('aria-checked', String(item.checked))
      cells[i]!.dataset.state = item.checked ? 'checked' : 'unchecked'
    })
  }

  const menu = createMenu(trigger, {
    label: 'Highlights',
    anchor: root,
    attrs: { 'data-ink-menu': 'highlight' },
    owns: (t) =>
      t instanceof Element && t.closest('[data-ink-menu="color-border"]') !== null,
    render: (panel) => paint(panel, model()),
  })

  main.addEventListener('click', () => tools?.set('highlight'))

  const follow = (next: ToolController | null): void => {
    for (const stop of stops) stop()
    stops = []
    tools = next
    if (tools)
      stops = [
        tools.active.subscribe(refresh),
        tools.options('highlight').subscribe(refresh),
        viewer.document.subscribe(refresh),
      ]
    if (!tools) menu.close()
    refresh()
  }
  follow(viewer.tools.get())
  viewer.tools.subscribe(follow)
  return root
}
