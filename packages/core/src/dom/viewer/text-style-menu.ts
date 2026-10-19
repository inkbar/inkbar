/*
 * The text style menu for createViewer: the same markup, classes and data attributes as the
 * bindings' `InkTextStyleMenu`, so `@inkbar/theme` styles both. The trigger follows the
 * viewer's tool style (disabled while nothing supports text style, `data-mixed` when the
 * selection disagrees); the panel is created on open and removed on close. It holds a font
 * select, the text colour menu, a size input with a stepper, bold/italic/underline toggles
 * and an alignment radio group.
 */
import {
  ALargeSmall,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Minus,
  Plus,
  Underline,
} from '@inkbar/icons'

import { handleRadioKeys } from '../menu-keys'
import { FONT_FAMILIES, textStyleMenuModel, type TextStyleMenuModel } from '../ui'

import { createColorMenu } from './color-menu'
import { createIcon } from './controls'
import { h } from './dom'
import { createMenu } from './menu'

import type { Viewer } from './create-viewer'
import type { ToolStyle } from '../../model/annotations/tool-style'

const TOGGLE_ICONS = { bold: Bold, italic: Italic, underline: Underline }
const ALIGN_ICONS = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  justify: AlignJustify,
}

function iconButton(label: string, icon: Parameters<typeof createIcon>[0]) {
  const b = h('button', {
    type: 'button',
    class: 'ink-text-style-button',
    'aria-label': label,
    title: label,
  })
  const svg = createIcon(icon)
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  b.append(svg)
  return b
}

/** A button that opens the text style menu: font, size, colour, emphasis and alignment. */
export function createTextStyleMenu(viewer: Viewer): HTMLButtonElement {
  const trigger = h('button', {
    type: 'button',
    class: 'ink-menu-trigger ink-text-style-menu',
    'data-ink-text-style-menu': '',
    'data-state': 'closed',
    'aria-label': 'Text style',
    title: 'Text style',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
  })
  trigger.append(createIcon(ALargeSmall))
  trigger.disabled = true

  let style: ToolStyle | null = null
  let stops: (() => void)[] = []

  const model = (): TextStyleMenuModel =>
    textStyleMenuModel(
      style?.current.get() ?? {},
      style?.supported.get() ?? new Set(),
      viewer.engine.get()?.fonts ?? FONT_FAMILIES
    )

  // One text colour menu for the life of the control; each panel adopts its trigger.
  const colour = createColorMenu(viewer, { property: 'textColor' })

  let select: HTMLSelectElement | null = null
  let input: HTMLInputElement | null = null
  /** True while the size holds text the user has typed and not yet committed. */
  let drafting = false

  function commitSize(): void {
    if (!drafting || !input) return
    drafting = false
    if (input.value.trim() !== '') {
      const patch = model().size.commit(Number(input.value))
      if (patch) style?.set(patch)
    }
    input.value = model().size.value === null ? '' : String(model().size.value)
  }
  function nudge(direction: 1 | -1): void {
    drafting = false
    const patch = model().size.nudge(direction)
    if (patch) style?.set(patch)
  }

  function build(root: HTMLElement, m: TextStyleMenuModel): void {
    select = h('select', { class: 'ink-text-style-font', 'aria-label': m.font.label })
    select.addEventListener('change', () => style?.set(model().font.patch(select!.value)))

    input = h('input', {
      type: 'number',
      class: 'ink-text-style-input',
      'aria-label': m.size.label,
      min: String(m.size.min),
      max: String(m.size.max),
      step: String(m.size.step),
    })
    input.addEventListener('input', () => (drafting = true))
    input.addEventListener('blur', commitSize)
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      commitSize()
    })
    const less = iconButton('Decrease font size', Minus)
    const more = iconButton('Increase font size', Plus)
    less.addEventListener('click', () => nudge(-1))
    more.addEventListener('click', () => nudge(1))
    const size = h(
      'div',
      { class: 'ink-text-style-size', role: 'group', 'aria-label': 'Size' },
      less,
      input,
      more
    )

    const emphasis = h('div', {
      class: 'ink-text-style-row',
      role: 'group',
      'aria-label': 'Emphasis',
    })
    for (const t of m.toggles) {
      const b = iconButton(t.label, TOGGLE_ICONS[t.key])
      b.dataset.key = t.key
      b.addEventListener('click', () => {
        const found = model().toggles.find((x) => x.key === t.key)
        if (found) style?.set(found.patch)
      })
      emphasis.append(b)
    }

    const align = h('div', {
      class: 'ink-text-style-row',
      role: 'radiogroup',
      'aria-label': m.align.label,
    })
    align.addEventListener('keydown', (e) => handleRadioKeys(e, align))
    for (const c of m.align.choices) {
      const b = iconButton(c.label, ALIGN_ICONS[c.key])
      b.setAttribute('role', 'radio')
      b.dataset.key = c.key
      b.addEventListener('click', () => {
        const found = model().align.choices.find((x) => x.key === c.key)
        if (found) style?.set(found.patch)
      })
      align.append(b)
    }

    root.append(
      select,
      h('div', { class: 'ink-text-style-row' }, colour, size),
      emphasis,
      align
    )
  }

  function paint(root: HTMLElement, m: TextStyleMenuModel): void {
    if (root.childElementCount === 0) build(root, m)
    const sel = select!
    const options = m.font.value === '' ? ['', ...m.font.options] : m.font.options
    if (
      sel.options.length !== options.length ||
      options.some((o, i) => sel.options[i]!.value !== o)
    ) {
      sel.replaceChildren(
        ...options.map((o) => {
          const opt = h('option', { value: o }, o === '' ? 'Mixed' : o)
          if (o === '') {
            opt.disabled = true
            opt.hidden = true
          }
          return opt
        })
      )
    }
    sel.value = m.font.value
    if (!drafting) input!.value = m.size.value === null ? '' : String(m.size.value)
    root
      .querySelectorAll<HTMLElement>('[role="group"][aria-label="Emphasis"] button')
      .forEach((b) => {
        const t = m.toggles.find((x) => x.key === b.dataset.key)!
        b.setAttribute('aria-pressed', String(t.pressed))
        b.dataset.state = t.pressed === true ? 'on' : 'off'
        if (t.pressed === 'mixed') b.setAttribute('data-mixed', '')
        else b.removeAttribute('data-mixed')
      })
    root.querySelectorAll<HTMLElement>('[role="radio"]').forEach((b) => {
      const c = m.align.choices.find((x) => x.key === b.dataset.key)!
      b.setAttribute('aria-checked', String(c.checked))
      b.dataset.state = c.checked ? 'on' : 'off'
      b.tabIndex = c.tabStop ? 0 : -1
    })
  }

  function refresh(): void {
    const m = model()
    trigger.disabled = !m.enabled
    if (m.mixed) trigger.setAttribute('data-mixed', '')
    else trigger.removeAttribute('data-mixed')
    menu.refresh()
  }

  const menu = createMenu(trigger, {
    label: 'Text style',
    role: 'dialog',
    attrs: {
      'data-ink-menu': 'text-style',
      class: 'ink-select-content ink-menu-content ink-text-style-content',
    },
    owns: (t) =>
      t instanceof Element && t.closest('[data-ink-menu="color-textColor"]') !== null,
    render: (root) => paint(root, model()),
  })

  const follow = (engine: { toolStyle: ToolStyle } | null): void => {
    for (const stop of stops) stop()
    stops = []
    style = engine?.toolStyle ?? null
    if (style)
      stops = [style.current.subscribe(refresh), style.supported.subscribe(refresh)]
    // The panel's old style is gone with the old document.
    if (!style) menu.close()
    refresh()
  }
  follow(viewer.engine.get())
  viewer.engine.subscribe(follow)
  return trigger
}
