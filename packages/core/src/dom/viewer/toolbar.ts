/*
 * The default toolbar: tools, zoom and page, with the classes and data attributes of the
 * bindings' DefaultToolbar so the theme styles it. It follows the WAI-ARIA toolbar pattern:
 * one Tab stop, arrow keys between controls (host-added ones included), Home and End.
 *
 * The element outlives any one document, so a host can add controls once: `bind` points the
 * controls at a document's viewport and tool controller (again after every engine rebuild),
 * and `unbind` disables them while nothing is open.
 */
import { TOOL_LABELS, ZOOM_LEVELS } from '../ui'

import { h } from './dom'
import { icon, type IconName } from './icons'

import type { InkDocument } from '../../model/document'
import type { Readable } from '../../model/readable'
import type { ToolController, ToolId } from '../tools'
import type { Viewport } from '../viewport'

const TOOLS: [ToolId, IconName][] = [
  ['view', 'hand'],
  ['select', 'mouse-pointer-2'],
  ['highlight', 'highlighter'],
  ['redact-area', 'square'],
  ['note', 'message-square'],
]

export interface DefaultToolbar {
  readonly element: HTMLElement
  /** Drives `viewport` and `tools` for `doc`. Call again after every rebuild. */
  bind(doc: InkDocument, viewport: Viewport, tools: ToolController): void
  /** No document: the controls are disabled. */
  unbind(): void
  destroy(): void
}

/** A toolbar button with an icon; the label is its accessible name and tooltip. */
function iconButton(
  label: string,
  attrs: Record<string, string>,
  name: IconName,
  onClick: () => void
): HTMLButtonElement {
  const b = h('button', { type: 'button', ...attrs, 'aria-label': label, title: label })
  b.append(icon(name))
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

export function createToolbar(): DefaultToolbar {
  let stops: (() => void)[] = []
  let bound: { doc: InkDocument; viewport: Viewport; tools: ToolController } | null = null
  const watch = <T>(r: Readable<T>, fn: (value: T) => void): void => {
    fn(r.get())
    stops.push(r.subscribe(fn))
  }

  const toolButtons = TOOLS.map(([id, name]) =>
    iconButton(
      TOOL_LABELS[id],
      { class: 'ink-tool-button', 'data-ink-tool-button': '', 'data-tool': id },
      name,
      () => bound?.tools.set(id)
    )
  )
  const showTool = (active: ToolId | null): void => {
    for (const b of toolButtons) {
      const on = b.dataset.tool === active
      b.dataset.state = on ? 'on' : 'off'
      b.setAttribute('aria-pressed', String(on))
    }
  }

  const zoomOut = iconButton(
    'Zoom out',
    { class: 'ink-zoom-out', 'data-ink-zoom-out': '' },
    'zoom-out',
    () => bound?.viewport.zoomBy(0.8)
  )
  const zoomIn = iconButton(
    'Zoom in',
    { class: 'ink-zoom-in', 'data-ink-zoom-in': '' },
    'zoom-in',
    () => bound?.viewport.zoomBy(1.25)
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
    if (v === 'fit-width' || v === 'fit-page') bound?.viewport.setZoom(v)
    else if (v !== 'custom') bound?.viewport.setZoom(Number(v))
  })

  // 1-based in the input, 0-based in the viewport. Out of range resets to the current page.
  const pageInput = h('input', {
    class: 'ink-page-input',
    'data-ink-page-input': '',
    type: 'number',
    inputmode: 'numeric',
    'aria-label': 'Page',
    min: '1',
  })
  const commitPage = (): void => {
    if (!bound) return
    const { viewport } = bound
    const n = Number(pageInput.value)
    const current = viewport.currentPage.get()
    if (Number.isInteger(n) && n >= 1 && n <= bound.doc.pages.length) {
      if (n - 1 !== current) viewport.scrollToPage(n - 1)
    } else pageInput.value = String(current + 1)
  }
  // `change` fires on blur after typing and on each arrow-key or spinner step.
  pageInput.addEventListener('change', commitPage)
  pageInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented) return
    e.preventDefault()
    commitPage()
  })
  const pageCount = h('span', {
    class: 'ink-page-count',
    'data-ink-page-count': '',
    'aria-live': 'polite',
  })

  const controls = [...toolButtons, zoomOut, zoomSelect, zoomIn, pageInput]
  const element = h(
    'div',
    {
      class: 'ink-toolbar ink-default-toolbar',
      'data-ink-toolbar': '',
      'data-ink-default-toolbar': '',
      role: 'toolbar',
      'aria-label': 'Document tools',
      'aria-orientation': 'horizontal',
    },
    group('tools', 'Tools', ...toolButtons),
    group('zoom', 'Zoom', zoomOut, zoomSelect, zoomIn),
    group('page', 'Page', pageInput, pageCount)
  )
  const roving = rovingTabindex(element)

  function stop(): void {
    for (const s of stops) s()
    stops = []
    bound = null
  }

  function unbind(): void {
    stop()
    for (const c of controls) c.disabled = true
    showTool(null)
    custom.remove()
    zoomSelect.value = 'fit-width'
    pageInput.value = ''
    pageCount.textContent = ''
    roving.sync()
  }

  unbind()

  return {
    element,
    bind(doc, viewport, tools) {
      // Not `unbind`: disabling the focused control would drop focus during a rebuild.
      stop()
      bound = { doc, viewport, tools }
      for (const c of controls) c.disabled = false
      watch(tools.active, showTool)
      watch(viewport.zoom, (z) => {
        const level =
          typeof z === 'number'
            ? ZOOM_LEVELS.find((l) => Math.abs(l - z) < 0.001)
            : undefined
        if (typeof z === 'number' && level === undefined) {
          custom.textContent = `${Math.round(z * 100)}%`
          zoomSelect.append(custom)
          zoomSelect.value = 'custom'
        } else {
          custom.remove()
          zoomSelect.value = typeof z === 'number' ? String(level) : z
        }
      })
      const count = doc.pages.length
      pageInput.max = String(count)
      pageCount.textContent = `of ${count}`
      watch(viewport.currentPage, (p) => {
        pageInput.value = String(p + 1)
      })
      roving.sync()
    },
    unbind,
    destroy() {
      stop()
      roving.destroy()
      element.remove()
    },
  }
}

const FOCUSABLE = 'button, select, input, textarea, a[href], [tabindex]'

/**
 * One Tab stop across every enabled control in `bar`: the current one has `tabindex="0"`, the
 * rest `-1`. ArrowLeft and ArrowRight move and wrap, Home and End go to the ends. ArrowUp and
 * ArrowDown are left to the control (the zoom select and the page input step with them).
 */
function rovingTabindex(bar: HTMLElement): { sync(): void; destroy(): void } {
  let current: HTMLElement | null = null
  const items = (): HTMLElement[] =>
    [...bar.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !(el as HTMLButtonElement).disabled && !el.closest('[hidden]')
    )
  const sync = (): void => {
    const list = items()
    if (!current || !list.includes(current)) current = list[0] ?? null
    for (const el of bar.querySelectorAll<HTMLElement>(FOCUSABLE))
      el.tabIndex = el === current ? 0 : -1
  }
  const onFocusIn = (e: FocusEvent): void => {
    const target = e.target as HTMLElement
    if (!items().includes(target)) return
    current = target
    sync()
  }
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    const list = items()
    const i = list.indexOf(e.target as HTMLElement)
    if (i < 0) return
    const last = list.length - 1
    const next =
      e.key === 'ArrowRight'
        ? i === last
          ? 0
          : i + 1
        : e.key === 'ArrowLeft'
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
  // Host-added controls, and controls a host enables or disables, join the rotation.
  const observer = new MutationObserver(sync)
  observer.observe(bar, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'hidden'],
  })
  bar.addEventListener('focusin', onFocusIn)
  bar.addEventListener('keydown', onKeyDown)
  sync()
  return {
    sync,
    destroy() {
      observer.disconnect()
      bar.removeEventListener('focusin', onFocusIn)
      bar.removeEventListener('keydown', onKeyDown)
    },
  }
}
