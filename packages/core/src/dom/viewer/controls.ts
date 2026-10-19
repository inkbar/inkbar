/*
 * Toolbar controls for createViewer, with the classes and data attributes of the bindings'
 * components so `@inkbar/theme` styles them. Each control follows a viewer: it is disabled
 * while no document is ready and picks up the new viewport after every engine rebuild. A
 * control lives as long as its viewer.
 *
 * Buttons show an icon from `@inkbar/icons`; replace their children with your own and the
 * accessible name stays. Put controls in a `createToolbar()` bar, and put the bar where it
 * belongs: `viewer.element.prepend(bar)` above the document, `append` below it.
 */
import {
  ChevronLeft,
  ChevronRight,
  Highlighter,
  ICON_ATTRIBUTES,
  MessageSquare,
  Redo2,
  Square,
  SquareDashedMousePointer,
  TextCursor,
  Undo2,
  ZoomIn,
  ZoomOut,
  type IconNode,
} from '@inkbar/icons'

import { TOOL_LABELS, ZOOM_LEVELS } from '../ui'

import { h } from './dom'

import type { InkDocument } from '../../model/document'
import type { Readable } from '../../model/readable'
import type { ToolController, ToolId } from '../tools'
import type { Viewport } from '../viewport'
import type { Viewer } from './create-viewer'

type Control = HTMLButtonElement | HTMLSelectElement | HTMLInputElement

/**
 * Runs `connect` for every value `source` takes while it is set, undoing the previous run's
 * subscriptions first, and disables `control` while it is `null`.
 */
function follow<T>(
  source: Readable<T | null>,
  control: Control,
  connect: (value: T, watch: <V>(r: Readable<V>, fn: (value: V) => void) => void) => void,
  reset?: () => void
): void {
  let stops: (() => void)[] = []
  const watch = <V>(r: Readable<V>, fn: (value: V) => void): void => {
    fn(r.get())
    stops.push(r.subscribe(fn))
  }
  const run = (value: T | null): void => {
    for (const s of stops) s()
    stops = []
    control.disabled = value === null
    if (value === null) reset?.()
    else connect(value, watch)
  }
  run(source.get())
  source.subscribe(run)
}

const SVG = 'http://www.w3.org/2000/svg'

const TOOL_ICONS: Readonly<Partial<Record<ToolId, IconNode>>> = {
  'select-text': TextCursor,
  select: SquareDashedMousePointer,
  highlight: Highlighter,
  'redact-area': Square,
  note: MessageSquare,
}

/**
 * An `<svg>` drawing `icon` from `@inkbar/icons`, hidden from assistive technology: the
 * control it sits in carries the name. The theme sizes it with `--ink-icon-size`.
 */
export function createIcon(icon: IconNode): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  const attrs = {
    ...ICON_ATTRIBUTES,
    width: '18',
    height: '18',
    class: 'ink-icon',
    'aria-hidden': 'true',
  }
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v)
  for (const [tag, shape] of icon) {
    const child = document.createElementNS(SVG, tag)
    for (const [k, v] of Object.entries(shape)) child.setAttribute(k, v)
    svg.append(child)
  }
  return svg
}

function button(
  label: string,
  attrs: Record<string, string>,
  icon: IconNode | undefined
): HTMLButtonElement {
  const b = h('button', { type: 'button', ...attrs, 'aria-label': label, title: label })
  if (icon) b.append(createIcon(icon))
  return b
}

/**
 * A toolbar following the WAI-ARIA toolbar pattern: its buttons share one Tab stop, with
 * arrow keys, Home and End to move between them. Fields and selects are Tab stops of their
 * own and keep their keys. Buttons added later join in.
 */
export function createToolbar(opts: { label?: string } = {}): HTMLElement {
  const bar = h('div', {
    class: 'ink-toolbar',
    'data-ink-toolbar': '',
    role: 'toolbar',
    'aria-label': opts.label ?? 'Document tools',
    'aria-orientation': 'horizontal',
  })
  rovingTabindex(bar)
  return bar
}

/** A divider between groups of controls in a horizontal toolbar. Not focusable. */
export function createToolbarSeparator(): HTMLDivElement {
  return h('div', {
    role: 'separator',
    'aria-orientation': 'vertical',
    class: 'ink-toolbar-separator',
    'data-ink-toolbar-separator': '',
  })
}

/** Undoes the last change to the document's annotations; disabled when there is none. */
export function createUndo(viewer: Viewer): HTMLButtonElement {
  return historyButton(viewer, 'undo')
}

/** Redoes the last undone change; disabled when there is none. */
export function createRedo(viewer: Viewer): HTMLButtonElement {
  return historyButton(viewer, 'redo')
}

function historyButton(viewer: Viewer, action: 'undo' | 'redo'): HTMLButtonElement {
  const label = action === 'undo' ? 'Undo' : 'Redo'
  const b = button(
    label,
    { class: `ink-${action}`, [`data-ink-${action}`]: '' },
    action === 'undo' ? Undo2 : Redo2
  )
  b.addEventListener('click', () => viewer.document.get()?.history[action]())
  follow<InkDocument>(viewer.document, b, (doc, watch) =>
    watch(action === 'undo' ? doc.history.canUndo : doc.history.canRedo, (can) => {
      b.disabled = !can
    })
  )
  return b
}

/**
 * Sets the tool; pressed while it is the active one. A host tool's button has no icon (append
 * your own) and is named by `label`, else by the tool id.
 */
export function createToolButton(
  viewer: Viewer,
  tool: ToolId,
  opts: { label?: string } = {}
): HTMLButtonElement {
  const label = opts.label ?? TOOL_LABELS[tool] ?? tool
  const b = button(
    label,
    { class: 'ink-tool-button', 'data-ink-tool-button': '', 'data-tool': tool },
    TOOL_ICONS[tool]
  )
  const show = (active: ToolId | null): void => {
    const on = active === tool
    b.dataset.state = on ? 'on' : 'off'
    b.setAttribute('aria-pressed', String(on))
  }
  b.addEventListener('click', () => viewer.tools.get()?.set(tool))
  follow<ToolController>(
    viewer.tools,
    b,
    (tools, watch) => watch(tools.active, show),
    () => show(null)
  )
  return b
}

export function createZoomIn(viewer: Viewer): HTMLButtonElement {
  const b = button('Zoom in', { class: 'ink-zoom-in', 'data-ink-zoom-in': '' }, ZoomIn)
  b.addEventListener('click', () => viewer.viewport.get()?.zoomBy(1.25))
  follow(viewer.viewport, b, () => undefined)
  return b
}

export function createZoomOut(viewer: Viewer): HTMLButtonElement {
  const b = button(
    'Zoom out',
    { class: 'ink-zoom-out', 'data-ink-zoom-out': '' },
    ZoomOut
  )
  b.addEventListener('click', () => viewer.viewport.get()?.zoomBy(0.8))
  follow(viewer.viewport, b, () => undefined)
  return b
}

/** Fit width, fit page and the zoom levels; a zoom between levels gets an option of its own. */
export function createZoomSelect(viewer: Viewer): HTMLSelectElement {
  const custom = h('option', { value: 'custom' })
  const select = h(
    'select',
    { class: 'ink-zoom-select', 'data-ink-zoom-select': '', 'aria-label': 'Zoom' },
    h('option', { value: 'fit-width' }, 'Fit width'),
    h('option', { value: 'fit-page' }, 'Fit page'),
    ...ZOOM_LEVELS.map((l) =>
      h('option', { value: String(l) }, `${Math.round(l * 100)}%`)
    )
  )
  select.addEventListener('change', () => {
    const v = select.value
    const viewport = viewer.viewport.get()
    if (v === 'fit-width' || v === 'fit-page') viewport?.setZoom(v)
    else if (v !== 'custom') viewport?.setZoom(Number(v))
  })
  follow<Viewport>(
    viewer.viewport,
    select,
    (viewport, watch) =>
      watch(viewport.zoom, (z) => {
        const level =
          typeof z === 'number'
            ? ZOOM_LEVELS.find((l) => Math.abs(l - z) < 0.001)
            : undefined
        if (typeof z === 'number' && level === undefined) {
          custom.textContent = `${Math.round(z * 100)}%`
          // In order among the levels.
          const after = [...select.options].find(
            (o) => o !== custom && Number(o.value) > z
          )
          select.insertBefore(custom, after ?? null)
          select.value = 'custom'
        } else {
          custom.remove()
          select.value = typeof z === 'number' ? String(level) : z
        }
      }),
    () => {
      custom.remove()
      select.value = 'fit-width'
    }
  )
  return select
}

/**
 * The current page, 1-based. Enter or leaving the field goes to the page typed; a number out
 * of range puts the current page back.
 */
export function createPageInput(viewer: Viewer): HTMLInputElement {
  const input = h('input', {
    class: 'ink-page-input',
    'data-ink-page-input': '',
    type: 'number',
    inputmode: 'numeric',
    'aria-label': 'Page',
    min: '1',
  })
  const commit = (): void => {
    const viewport = viewer.viewport.get()
    const doc = viewer.document.get()
    if (!viewport || !doc) return
    const n = Number(input.value)
    const current = viewport.currentPage.get()
    if (Number.isInteger(n) && n >= 1 && n <= doc.pages.length) {
      if (n - 1 !== current) viewport.scrollToPage(n - 1)
    } else input.value = String(current + 1)
  }
  // `change` fires on blur after typing and on each arrow-key or spinner step.
  input.addEventListener('change', commit)
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented) return
    e.preventDefault()
    commit()
  })
  follow<Viewport>(
    viewer.viewport,
    input,
    (viewport, watch) => {
      input.max = String(viewer.document.get()?.pages.length ?? 1)
      watch(viewport.currentPage, (p) => (input.value = String(p + 1)))
    },
    () => (input.value = '')
  )
  return input
}

/** "of 12": the page count, announced when it changes. */
export function createPageCount(viewer: Viewer): HTMLSpanElement {
  const span = h('span', {
    class: 'ink-page-count',
    'data-ink-page-count': '',
    'aria-live': 'polite',
  })
  const show = (): void => {
    const doc = viewer.document.get()
    span.textContent = doc && viewer.viewport.get() ? `of ${doc.pages.length}` : ''
  }
  show()
  viewer.viewport.subscribe(show)
  return span
}

/** Disabled on the first page. */
export function createPrevPage(viewer: Viewer): HTMLButtonElement {
  return pageButton(viewer, -1)
}

/** Disabled on the last page. */
export function createNextPage(viewer: Viewer): HTMLButtonElement {
  return pageButton(viewer, 1)
}

function pageButton(viewer: Viewer, step: -1 | 1): HTMLButtonElement {
  const b =
    step < 0
      ? button(
          'Previous page',
          { class: 'ink-prev-page', 'data-ink-prev-page': '' },
          ChevronLeft
        )
      : button(
          'Next page',
          { class: 'ink-next-page', 'data-ink-next-page': '' },
          ChevronRight
        )
  b.addEventListener('click', () => {
    const viewport = viewer.viewport.get()
    viewport?.scrollToPage(viewport.currentPage.get() + step)
  })
  follow<Viewport>(viewer.viewport, b, (viewport, watch) => {
    const last = (viewer.document.get()?.pages.length ?? 1) - 1
    watch(viewport.currentPage, (p) => {
      b.disabled = step < 0 ? p <= 0 : p >= last
    })
  })
  return b
}

/** Roving items, as in the bindings' Radix toolbar: buttons only. */
const ITEMS = 'button'

/**
 * One Tab stop across the enabled buttons in `bar`: the current one has `tabindex="0"`, the
 * rest `-1`. ArrowLeft and ArrowRight move between them and wrap, Home and End go to the ends.
 * Inputs, selects and textareas, built in or added by the host, keep their own tabindex (a
 * Tab stop of their own by default) and their own arrow, Home and End keys.
 */
function rovingTabindex(bar: HTMLElement): { sync(): void; destroy(): void } {
  let current: HTMLElement | null = null
  const items = (): HTMLElement[] =>
    [...bar.querySelectorAll<HTMLButtonElement>(ITEMS)].filter(
      (el) => !el.disabled && !el.closest('[hidden]')
    )
  const sync = (): void => {
    const list = items()
    if (!current || !list.includes(current)) current = list[0] ?? null
    for (const el of bar.querySelectorAll<HTMLElement>(ITEMS))
      el.tabIndex = el === current ? 0 : -1
    // Fields are left alone: they are Tab stops by default, and a host's tabindex on one stays.
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
  // Host-added buttons, and buttons a host enables or disables, join the rotation.
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
