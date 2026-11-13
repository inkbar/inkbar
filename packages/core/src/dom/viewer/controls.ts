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
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  ICON_ATTRIBUTES,
  Printer,
  Search,
  Redo2,
  SquareDashedMousePointer,
  TextCursor,
  Undo2,
  ZoomIn,
  ZoomOut,
  type IconNode,
} from '@inkbar/icons'

import { resolveLabel, type InkMessages, type Label } from '../../messages'
import { keepHistoryFocus } from '../history-keys'
import { ENGLISH, type MessageState } from '../messages-state'
import { unknownCommand } from '../plugins/commands'
import { unknownTool } from '../tools/unknown'
import { toolName, ZOOM_LEVELS } from '../ui'

import {
  hostCommandIdsOf,
  messagesOf,
  onMessages,
  toolsOf,
  onViewerDestroy,
} from './create-viewer'
import { h } from './dom'

import type { InkDocument } from '../../model/document'
import type { Readable } from '../../model/readable'
import type { DownloadOptions } from '../file-actions'
import type { ToolController, ToolId } from '../tools'
import type { Viewport } from '../viewport'
import type { Viewer } from './create-viewer'

type Control = HTMLButtonElement | HTMLSelectElement | HTMLInputElement

/**
 * Runs `connect` for every value `source` takes while it is set, undoing the previous run's
 * subscriptions first, and disables `control` while it is `null`. Returns the function that
 * stops following.
 */
function follow<T>(
  source: Readable<T | null>,
  control: Control,
  connect: (value: T, watch: <V>(r: Readable<V>, fn: (value: V) => void) => void) => void,
  reset?: () => void
): () => void {
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
  const stopSource = source.subscribe(run)
  return () => {
    stopSource()
    for (const s of stops) s()
    stops = []
  }
}

const SVG = 'http://www.w3.org/2000/svg'

/** Icons of the two core select tools. Every other tool carries its own `icon`. */
const TOOL_ICONS: Readonly<Partial<Record<ToolId, IconNode>>> = {
  'select-text': TextCursor,
  select: SquareDashedMousePointer,
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

/** @internal A labelled icon button, as the toolbar controls make them. */
export function button(
  label: string,
  attrs: Record<string, string>,
  icon: IconNode | undefined
): HTMLButtonElement {
  const b = h('button', { type: 'button', ...attrs, 'aria-label': label, title: label })
  if (icon) b.append(createIcon(icon))
  return b
}

/** @internal Names `b` for assistive technology and its tooltip. */
export function nameButton(b: HTMLElement, label: string): void {
  if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label)
  if (b.title !== label) b.title = label
}

/**
 * A button named from the viewer's words, now and after every `setMessages`.
 */
function wordButton(
  viewer: Viewer,
  name: (m: InkMessages) => string,
  attrs: Record<string, string>,
  icon: IconNode | undefined
): HTMLButtonElement {
  const b = button(name(messagesOf(viewer).get().messages), attrs, icon)
  onMessages(viewer, (m) => nameButton(b, name(m)))
  return b
}

/**
 * Opens the viewer's find bar; pressed while it is open. Pressing it again focuses the field.
 * The bar itself is `createFindBar`.
 */
export function createSearchButton(viewer: Viewer): HTMLButtonElement {
  const b = wordButton(
    viewer,
    (m) => m.toolbar.find,
    { class: 'ink-search-button', 'data-ink-search-button': '', 'aria-pressed': 'false' },
    Search
  )
  b.addEventListener('click', () => {
    viewer.search.open()
    const field = viewer.element.querySelector<HTMLInputElement>(
      '[data-ink-find-bar] input'
    )
    field?.focus()
    field?.select()
  })
  const show = (s: { open: boolean }): void => {
    b.dataset.state = s.open ? 'on' : 'off'
    b.setAttribute('aria-pressed', String(s.open))
  }
  show(viewer.search.state.get())
  onViewerDestroy(viewer, viewer.search.state.subscribe(show))
  onViewerDestroy(
    viewer,
    follow(viewer.document, b, () => undefined)
  )
  return b
}

/**
 * A toolbar following the WAI-ARIA toolbar pattern: its buttons share one Tab stop, with
 * arrow keys, Home and End to move between them. Fields and selects are Tab stops of their
 * own and keep their keys. Buttons added later join in.
 *
 * `label` names it; without one it is `messages.toolbar.label` ("Document tools"). Pass the
 * viewer's `messages` to follow `setMessages`: a function `label` is read again then too.
 */
export function createToolbar(
  opts: { label?: Label; messages?: Readable<MessageState> } = {}
): HTMLElement {
  const messages = opts.messages ?? ENGLISH
  const name = (m: InkMessages): string => resolveLabel(opts.label) || m.toolbar.label
  const bar = h('div', {
    class: 'ink-toolbar',
    'data-ink-toolbar': '',
    role: 'toolbar',
    'aria-label': name(messages.get().messages),
    'aria-orientation': 'horizontal',
  })
  // Lives as long as the store: a viewer's goes with the viewer.
  messages.subscribe(({ messages: m }) => bar.setAttribute('aria-label', name(m)))
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

/**
 * Saves the document's file (`viewer.download()`); disabled until a document is ready. Today
 * that is the file as it was opened, without this session's annotations.
 */
export function createDownloadButton(
  viewer: Viewer,
  opts: DownloadOptions = {}
): HTMLButtonElement {
  return fileButton(viewer, 'download', () => viewer.download(opts))
}

/**
 * Prints the document's file (`viewer.print()`); disabled until a document is ready. Today
 * that is the file as it was opened, without this session's annotations.
 */
export function createPrintButton(viewer: Viewer): HTMLButtonElement {
  return fileButton(viewer, 'print', () => viewer.print())
}

function fileButton(
  viewer: Viewer,
  action: 'download' | 'print',
  run: () => Promise<void>
): HTMLButtonElement {
  const b = wordButton(
    viewer,
    (m) => m.toolbar[action],
    { class: `ink-${action}`, [`data-ink-${action}`]: '' },
    action === 'download' ? Download : Printer
  )
  b.addEventListener('click', () => void run().catch(() => undefined))
  follow<InkDocument>(viewer.document, b, (doc, watch) =>
    watch(doc.status, (s) => {
      b.disabled = s.state !== 'ready'
    })
  )
  return b
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
  const b = wordButton(
    viewer,
    (m) => m.toolbar[action],
    { class: `ink-${action}`, [`data-ink-${action}`]: '' },
    action === 'undo' ? Undo2 : Redo2
  )
  b.addEventListener('click', () => viewer.document.get()?.history[action]())
  // Undoing the last step disables the focused button: focus goes back to the document.
  keepHistoryFocus(b, () =>
    viewer.element.querySelector<HTMLElement>('[data-ink-scroll]')
  )
  follow<InkDocument>(viewer.document, b, (doc, watch) =>
    watch(action === 'undo' ? doc.history.canUndo : doc.history.canRedo, (can) => {
      b.disabled = !can
    })
  )
  return b
}

/**
 * Returns to where the view was before the last jump (`viewer.back()`): a link, an outline
 * item or a form button that went to a page. Disabled while there is nowhere to go back to.
 */
export function createBack(viewer: Viewer): HTMLButtonElement {
  return navigationButton(viewer, 'back')
}

/** Goes forward again after `createBack` (`viewer.forward()`); disabled until Back is used. */
export function createForward(viewer: Viewer): HTMLButtonElement {
  return navigationButton(viewer, 'forward')
}

function navigationButton(viewer: Viewer, action: 'back' | 'forward'): HTMLButtonElement {
  const back = action === 'back'
  const b = wordButton(
    viewer,
    (m) => m.toolbar[action],
    { class: `ink-${action}`, [`data-ink-${action}`]: '' },
    back ? ArrowLeft : ArrowRight
  )
  b.addEventListener('click', () => viewer[action]())
  // The last step back disables the focused button: focus goes back to the document.
  keepHistoryFocus(b, () =>
    viewer.element.querySelector<HTMLElement>('[data-ink-scroll]')
  )
  const can = back ? viewer.canGoBack : viewer.canGoForward
  const show = (on: boolean): void => {
    b.disabled = !on
  }
  show(can.get())
  onViewerDestroy(viewer, can.subscribe(show))
  return b
}

/**
 * True for `select-text` and `select`, which every viewer registers, and for any other tool id
 * the viewer was given.
 */
export function registeredTool(viewer: Viewer, id: ToolId): boolean {
  return toolsOf(viewer).some((t) => t.id === id)
}

/** The error for a control whose tool is not registered, logged once as the control is made. */
export function logUnknownTool(viewer: Viewer, id: ToolId): void {
  console.error(
    unknownTool(
      id,
      toolsOf(viewer).map((t) => t.id)
    )
  )
}

/**
 * Sets the tool; pressed while it is the active one. A creation, host or plugin tool's button
 * takes the tool's own `label` and `icon`; `opts.label` wins. Without either, a built-in tool
 * is named from the viewer's `messages.tools`, and any other by its id. For an id no tool registered it logs `InkError('UnknownTool')` to the console and
 * returns the same markup disabled, `aria-hidden` and unnamed.
 */
export function createToolButton(
  viewer: Viewer,
  tool: ToolId,
  opts: { label?: string } = {}
): HTMLButtonElement {
  if (!registeredTool(viewer, tool)) {
    logUnknownTool(viewer, tool)
    const pending = h('button', {
      type: 'button',
      class: 'ink-tool-button',
      'data-ink-tool-button': '',
      'data-tool': tool,
      'aria-hidden': 'true',
    })
    pending.disabled = true
    return pending
  }
  const own = toolsOf(viewer).find((t) => t.id === tool)
  const messages = messagesOf(viewer)
  const name = (): string => opts.label ?? toolName(tool, own, messages.get().messages)
  const b = button(
    name(),
    { class: 'ink-tool-button', 'data-ink-tool-button': '', 'data-tool': tool },
    TOOL_ICONS[tool] ?? own?.icon
  )
  // New words, or a host's label function reading its own language again.
  onMessages(viewer, () => nameButton(b, name()))
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

/**
 * A plugin command as a button with its status text beside it. The button is named by the
 * command's label and disabled while the command is, except while it runs: then it keeps focus,
 * with `aria-busy` and `aria-disabled`, and a press does nothing. The status is a live region. A command without an icon shows its label as the button's text. For an id no
 * plugin registered it logs `InkError('UnknownCommand')` to the console and returns the same
 * markup disabled, `aria-hidden` and unnamed.
 */
export function createCommandButton(viewer: Viewer, id: string): HTMLElement {
  const command = viewer.commands.get(id)
  const status = h('span', { class: 'ink-command-status', role: 'status' })
  if (!command) {
    console.error(unknownCommand(id, hostCommandIdsOf(viewer)))
    const pending = h('button', {
      type: 'button',
      'data-command': id,
      'aria-hidden': 'true',
    })
    pending.disabled = true
    return h('div', { class: 'ink-command' }, pending, status)
  }
  const b = button(command.label, { 'data-command': id }, command.icon)
  if (!command.icon) b.textContent = command.label
  b.addEventListener('click', () => void command.run())
  // Enabled follows the command (a ready document by default). A busy command is disabled too,
  // but its button stays enabled so focus stays on it; `run` does nothing meanwhile.
  const sync = () => {
    const busy = command.busy.get()
    b.disabled = !command.enabled.get() && !busy
    b.setAttribute('aria-busy', String(busy))
    if (busy) b.setAttribute('aria-disabled', 'true')
    else b.removeAttribute('aria-disabled')
  }
  command.enabled.subscribe(sync)
  command.busy.subscribe(sync)
  sync()
  command.status.subscribe((text) => {
    status.textContent = text
  })
  status.textContent = command.status.get()
  return h('div', { class: 'ink-command' }, b, status)
}

export function createZoomIn(viewer: Viewer): HTMLButtonElement {
  const b = wordButton(
    viewer,
    (m) => m.toolbar.zoomIn,
    { class: 'ink-zoom-in', 'data-ink-zoom-in': '' },
    ZoomIn
  )
  b.addEventListener('click', () => viewer.viewport.get()?.zoomBy(1.25))
  onViewerDestroy(
    viewer,
    follow(viewer.viewport, b, () => undefined)
  )
  return b
}

export function createZoomOut(viewer: Viewer): HTMLButtonElement {
  const b = wordButton(
    viewer,
    (m) => m.toolbar.zoomOut,
    { class: 'ink-zoom-out', 'data-ink-zoom-out': '' },
    ZoomOut
  )
  b.addEventListener('click', () => viewer.viewport.get()?.zoomBy(0.8))
  onViewerDestroy(
    viewer,
    follow(viewer.viewport, b, () => undefined)
  )
  return b
}

/** Fit width, fit page and the zoom levels; a zoom between levels gets an option of its own. */
export function createZoomSelect(viewer: Viewer): HTMLSelectElement {
  const words = (): InkMessages => messagesOf(viewer).get().messages
  const percent = (zoom: number, m = words()): string =>
    m.toolbar.zoomPercent({ percent: Math.round(zoom * 100) })
  const custom = h('option', { value: 'custom' })
  /** The zoom the custom option shows, while it shows. */
  let customZoom: number | null = null
  const fitWidth = h('option', { value: 'fit-width' }, words().toolbar.fitWidth)
  const fitPage = h('option', { value: 'fit-page' }, words().toolbar.fitPage)
  const levels = ZOOM_LEVELS.map((l) => h('option', { value: String(l) }, percent(l)))
  const select = h(
    'select',
    {
      class: 'ink-select ink-zoom-select',
      'data-ink-zoom-select': '',
      'aria-label': words().toolbar.zoom,
    },
    fitWidth,
    fitPage,
    ...levels
  )
  // Options are relabelled, not replaced, so the chosen one stays chosen.
  onMessages(viewer, (m) => {
    select.setAttribute('aria-label', m.toolbar.zoom)
    fitWidth.textContent = m.toolbar.fitWidth
    fitPage.textContent = m.toolbar.fitPage
    levels.forEach((o, i) => (o.textContent = percent(ZOOM_LEVELS[i]!, m)))
    if (customZoom !== null) custom.textContent = percent(customZoom, m)
  })
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
          customZoom = z
          custom.textContent = percent(z)
          // In order among the levels.
          const after = [...select.options].find(
            (o) => o !== custom && Number(o.value) > z
          )
          select.insertBefore(custom, after ?? null)
          select.value = 'custom'
        } else {
          customZoom = null
          custom.remove()
          select.value = typeof z === 'number' ? String(level) : z
        }
      }),
    () => {
      customZoom = null
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
    'aria-label': messagesOf(viewer).get().messages.toolbar.page,
    min: '1',
  })
  onMessages(viewer, (m) => input.setAttribute('aria-label', m.toolbar.page))
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
    span.textContent =
      doc && viewer.viewport.get()
        ? messagesOf(viewer).get().messages.toolbar.pageOf({ total: doc.pages.length })
        : ''
  }
  show()
  viewer.viewport.subscribe(show)
  onMessages(viewer, show)
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
      ? wordButton(
          viewer,
          (m) => m.toolbar.previousPage,
          { class: 'ink-prev-page', 'data-ink-prev-page': '' },
          ChevronLeft
        )
      : wordButton(
          viewer,
          (m) => m.toolbar.nextPage,
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
