/*
 * The toolbar, by hand: tools, zoom, page, then Undo, Redo and Suggest redactions. It uses
 * the classes and data attributes of the bindings' DefaultToolbar, so the theme styles it.
 */
import { isInkError, type InkDocument, type Readable } from '@inkbar/core'
import {
  TOOL_LABELS,
  ZOOM_LEVELS,
  type ToolController,
  type ToolId,
  type Viewport,
} from '@inkbar/core/dom'
import {
  createElement,
  Hand,
  Highlighter,
  MessageSquare,
  MousePointer2,
  Square,
  ZoomIn,
  ZoomOut,
  type IconNode,
} from 'lucide'

import { suggestionCount, suggestRedactions } from '../shared/suggest'

import { button, h } from './dom'

const TOOLS: [ToolId, IconNode][] = [
  ['view', Hand],
  ['select', MousePointer2],
  ['highlight', Highlighter],
  ['redact-area', Square],
  ['note', MessageSquare],
]

function icon(node: IconNode): SVGElement {
  return createElement(node, { width: 18, height: 18, 'aria-hidden': 'true' })
}

/** A toolbar button with an icon; the label is its accessible name and tooltip. */
function iconButton(
  label: string,
  attrs: Record<string, string>,
  node: IconNode,
  onClick: () => void
): HTMLButtonElement {
  const b = h('button', { type: 'button', ...attrs, 'aria-label': label, title: label })
  b.append(icon(node))
  b.addEventListener('click', onClick)
  return b
}

const group = (name: string, label: string, ...children: Node[]): HTMLElement =>
  h(
    'div',
    {
      class: 'ink-toolbar-group',
      'data-ink-toolbar-group': name,
      role: 'group',
      'aria-label': label,
    },
    ...children
  )

/** Puts the toolbar first in `slot`. */
export function createToolbar(
  slot: HTMLElement,
  {
    doc,
    viewport,
    tools,
  }: { doc: InkDocument; viewport: Viewport; tools: ToolController }
): { destroy(): void } {
  const stops: (() => void)[] = []
  const watch = <T>(r: Readable<T>, fn: (value: T) => void): void => {
    fn(r.get())
    stops.push(r.subscribe(fn))
  }

  const toolButtons = TOOLS.map(([id, node]) =>
    iconButton(
      TOOL_LABELS[id],
      { class: 'ink-tool-button', 'data-ink-tool-button': '', 'data-tool': id },
      node,
      () => tools.set(id)
    )
  )
  watch(tools.active, (active) => {
    for (const b of toolButtons) {
      const on = b.dataset.tool === active
      b.dataset.state = on ? 'on' : 'off'
      b.setAttribute('aria-pressed', String(on))
    }
  })

  const zoomOut = iconButton(
    'Zoom out',
    { class: 'ink-zoom-out', 'data-ink-zoom-out': '' },
    ZoomOut,
    () => viewport.zoomBy(0.8)
  )
  const zoomIn = iconButton(
    'Zoom in',
    { class: 'ink-zoom-in', 'data-ink-zoom-in': '' },
    ZoomIn,
    () => viewport.zoomBy(1.25)
  )

  // A zoom that is not one of the levels (the buttons multiply) gets an option of its own.
  const custom = h('option', { value: 'custom' })
  const zoomSelect = h(
    'select',
    { class: 'ink-zoom-select', 'data-ink-zoom-select': '', 'aria-label': 'Zoom' },
    h('option', { value: 'fit-width' }, 'Fit width'),
    h('option', { value: 'fit-page' }, 'Fit page'),
    ...ZOOM_LEVELS.map((l) =>
      h('option', { value: String(l) }, `${Math.round(l * 100)}%`)
    )
  )
  zoomSelect.addEventListener('change', () => {
    const v = zoomSelect.value
    if (v === 'fit-width' || v === 'fit-page') viewport.setZoom(v)
    else if (v !== 'custom') viewport.setZoom(Number(v))
  })
  watch(viewport.zoom, (z) => {
    const level =
      typeof z === 'number' ? ZOOM_LEVELS.find((l) => Math.abs(l - z) < 0.001) : undefined
    if (typeof z === 'number' && level === undefined) {
      custom.textContent = `${Math.round(z * 100)}%`
      zoomSelect.append(custom)
      zoomSelect.value = 'custom'
    } else {
      custom.remove()
      zoomSelect.value = typeof z === 'number' ? String(level) : z
    }
  })

  // 1-based in the input, 0-based in the viewport. Out of range resets to the current page.
  const count = doc.pages.length
  const pageInput = h('input', {
    class: 'ink-page-input',
    'data-ink-page-input': '',
    type: 'number',
    inputmode: 'numeric',
    'aria-label': 'Page',
    min: '1',
    max: String(count),
  })
  pageInput.addEventListener('change', () => {
    const n = Number(pageInput.value)
    if (Number.isInteger(n) && n >= 1 && n <= count) viewport.scrollToPage(n - 1)
    else pageInput.value = String(viewport.currentPage.get() + 1)
  })
  watch(viewport.currentPage, (p) => {
    pageInput.value = String(p + 1)
  })
  const pageCount = h(
    'span',
    { class: 'ink-page-count', 'data-ink-page-count': '', 'aria-live': 'polite' },
    `of ${count}`
  )

  const undo = button('Undo', () => doc.history.undo())
  const redo = button('Redo', () => doc.history.redo())
  const suggest = h('button', { type: 'button' }, 'Suggest redactions')
  const result = h('span', { class: 'demo-result', role: 'status' })
  watch(doc.history.canUndo, (can) => {
    undo.disabled = !can
  })
  watch(doc.history.canRedo, (can) => {
    redo.disabled = !can
  })
  suggest.addEventListener('click', () => {
    suggest.disabled = true
    void suggestRedactions(doc, doc.annotations.list.get())
      .then((found) => {
        doc.history.batch(() => {
          for (const input of found) doc.annotations.add(input)
        })
        result.textContent = suggestionCount(found.length)
      })
      .catch((e: unknown) => {
        // Opening another file mid-run destroys the document; that is not a failure.
        if (!(isInkError(e) && e.code === 'DocumentDestroyed'))
          result.textContent = 'Could not check this document.'
      })
      .finally(() => {
        suggest.disabled = false
      })
  })

  const bar = h(
    'div',
    {
      class: 'ink-toolbar ink-default-toolbar',
      'data-ink-toolbar': '',
      'data-ink-default-toolbar': '',
      role: 'group',
      'aria-label': 'Document tools',
    },
    group('tools', 'Tools', ...toolButtons),
    group('zoom', 'Zoom', zoomOut, zoomSelect, zoomIn),
    group('page', 'Page', pageInput, pageCount),
    h(
      'div',
      { class: 'demo-actions', role: 'group', 'aria-label': 'Edit' },
      undo,
      redo,
      suggest,
      result
    )
  )
  slot.prepend(bar)

  return {
    destroy() {
      for (const stop of stops) stop()
      bar.remove()
    },
  }
}
