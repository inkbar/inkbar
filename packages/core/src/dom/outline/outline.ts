import { ChevronRight } from '@inkbar/icons'

import { resolveLabel, type InkMessages, type Label } from '../../messages'
import { createIcon } from '../viewer/controls'
import {
  messagesOf,
  navigationOf,
  onViewerDestroy,
  type Viewer,
} from '../viewer/create-viewer'
import { h } from '../viewer/dom'

import { createOutlineController } from './controller'

import type { OutlineItem } from '../../model/outline'

export interface OutlineOptions {
  /**
   * Shown when the document has no outline. Default: the viewer's `outline.empty` ("This
   * document has no outline"). A function is read again on every change of words.
   */
  emptyText?: Label | undefined
}

/**
 * The open document's outline as a tree. Give it a height (it fills its parent's) and place it
 * anywhere, a sidebar panel for instance. Clicking an item, or Enter on it, follows it and can be
 * gone back from; its chevron expands and collapses it. The item the reader has reached is
 * marked and kept in view. It stops when the viewer is destroyed.
 */
export function createOutline(viewer: Viewer, opts: OutlineOptions = {}): HTMLElement {
  const controller = createOutlineController({
    document: viewer.document,
    viewport: viewer.viewport,
    navigation: navigationOf(viewer),
  })
  const messages = messagesOf(viewer)
  const emptyText = (m: InkMessages): string =>
    opts.emptyText === undefined
      ? m.outline.empty
      : resolveLabel(opts.emptyText, m.outline.empty)
  const tree = h('ul', {
    class: 'ink-outline-tree',
    ...controller.treeAttrs(messages.get().messages),
  })
  const empty = h('p', { class: 'ink-outline-empty' }, emptyText(messages.get().messages))
  const root = h('div', { class: 'ink-outline', 'data-ink-outline': '' }, tree, empty)

  /** Each item's element and, for items with children, its group. */
  const rows = new Map<string, { row: HTMLElement; group: HTMLElement | null }>()

  // The markup `itemAttrs` documents: each item holds its row and its children's group.
  function build(list: readonly OutlineItem[], into: HTMLElement): void {
    for (const item of list) {
      const parent = item.children.length > 0
      const row = h(
        'li',
        { class: 'ink-outline-item', 'data-ink-outline-item': item.id },
        h(
          'div',
          { class: 'ink-outline-row', ...controller.rowAttrs(item.id) },
          parent
            ? h(
                'span',
                { class: 'ink-outline-toggle', 'aria-hidden': 'true' },
                createIcon(ChevronRight)
              )
            : h('span', { class: 'ink-outline-spacer', 'aria-hidden': 'true' }),
          h(
            'span',
            { class: 'ink-outline-title', ...controller.titleAttrs(item.id) },
            item.title
          )
        )
      )
      if (item.bold) row.setAttribute('data-bold', '')
      if (item.italic) row.setAttribute('data-italic', '')
      row.style.setProperty('--ink-outline-level', String(item.id.split('.').length - 1))
      let group: HTMLElement | null = null
      if (parent) {
        group = h('ul', { class: 'ink-outline-group', role: 'group' })
        build(item.children, group)
        row.append(group)
      }
      rows.set(item.id, { row, group })
      into.append(row)
    }
  }

  /** Brings every item's attributes and its group's visibility up to date. */
  function sync(): void {
    const open = controller.expanded.get()
    for (const [id, { row, group }] of rows) {
      for (const [name, value] of Object.entries(controller.itemAttrs(id))) {
        if (value === undefined) row.removeAttribute(name)
        else if (row.getAttribute(name) !== value) row.setAttribute(name, value)
      }
      if (group) group.hidden = !open.has(id)
    }
  }

  /** The empty text shows once a document is read and has no outline. */
  function status(): void {
    const loading = controller.loading.get()
    const none = controller.items.get().length === 0
    tree.hidden = none
    empty.hidden = loading || !none
    if (loading) root.setAttribute('aria-busy', 'true')
    else root.removeAttribute('aria-busy')
  }

  function render(): void {
    rows.clear()
    tree.replaceChildren()
    build(controller.items.get(), tree)
    sync()
    status()
  }

  /**
   * The item whose row holds `target`. Only rows take clicks, as in the bindings: a click on a
   * group's padding or the item around its row belongs to no item, not to the parent.
   */
  const itemOf = (target: EventTarget | null): string | null => {
    const row =
      target instanceof Element
        ? target
            .closest<HTMLElement>('.ink-outline-row')
            ?.closest<HTMLElement>('[data-ink-outline-item]')
        : null
    return row && root.contains(row) ? (row.dataset.inkOutlineItem ?? null) : null
  }

  tree.addEventListener('click', (e) => {
    const id = itemOf(e.target)
    if (id === null) return
    if ((e.target as Element).closest('.ink-outline-toggle')) controller.toggle(id)
    else controller.activate(id)
  })
  tree.addEventListener('keydown', (e) => controller.onKeydown(e))

  render()
  const stops = [
    controller.items.subscribe(render),
    controller.loading.subscribe(status),
    controller.expanded.subscribe(sync),
    controller.current.subscribe(sync),
    controller.focused.subscribe(sync),
    messages.subscribe(({ messages: m }) => {
      tree.setAttribute('aria-label', m.outline.label)
      empty.textContent = emptyText(m)
    }),
  ]
  const unbind = controller.bindScroll(root)
  onViewerDestroy(viewer, () => {
    unbind()
    stops.forEach((stop) => stop())
    controller.destroy()
  })
  return root
}
