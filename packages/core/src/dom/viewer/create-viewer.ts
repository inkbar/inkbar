/*
 * A complete viewer without a framework: opens a document, mounts the engine and renders a
 * default toolbar, note thread and suggestion card around it, with the bindings' markup so
 * `@inkbar/theme` styles it unchanged. Each piece of UI can be left out.
 */
import {
  cssVariableDefaults,
  type AnnotationDefaults,
} from '../../model/annotations/defaults'
import {
  openDocument,
  type InkDocument,
  type InkStatus,
  type OpenOptions,
} from '../../model/document'
import { InkError, isInkError } from '../../model/errors'
import { readonly, writable, type Readable } from '../../model/readable'
import { createFocusReturn } from '../popover-focus'
import { mountViewer, type MountViewerOptions, type ViewerEngine } from '../viewer-engine'

import { h } from './dom'
import { createNotePopover } from './note-popover'
import { createSuggestionCard } from './suggestion-card'
import { createToolbar } from './toolbar'

import type { DocumentSource } from '../../model/source'
import type { PdfAssets } from '../../pdfjs/types'

export interface CreateViewerOptions extends Omit<
  MountViewerOptions,
  'container' | 'document'
> {
  source: DocumentSource
  assets: PdfAssets
  password?: string
  /** Default: read from the theme's CSS variables on the viewer root. */
  defaults?: AnnotationDefaults
  history?: OpenOptions['history']
  /** Default toolbar: tools, zoom, page. `false` leaves it out. */
  toolbar?: boolean
  /** Note thread popover. Default true. */
  notes?: boolean
  /** Suggested-redaction card. Default true. */
  suggestions?: boolean
  onReady?(this: void, doc: InkDocument): void
  onError?(this: void, error: InkError): void
}

export interface Viewer {
  /** The root element (`[data-ink-root]`) the viewer rendered into the host element. */
  readonly element: HTMLElement
  readonly status: Readable<InkStatus>
  readonly document: Readable<InkDocument | null>
  /** Set while a document is ready; `null` otherwise. */
  readonly engine: Readable<ViewerEngine | null>
  /** The toolbar element, for adding controls. `null` when `toolbar: false`. */
  readonly toolbar: HTMLElement | null
  /** Opens another document in place; the previous one is destroyed. Latest call wins. */
  open(source: DocumentSource): void
  destroy(): void
}

export function createViewer(el: HTMLElement, opts: CreateViewerOptions): Viewer {
  const {
    source: initial,
    assets,
    password,
    defaults,
    history,
    toolbar: withToolbar = true,
    notes: withNotes = true,
    suggestions: withSuggestions = true,
    onReady,
    onError,
    onActivate,
    onBuild,
    onPageMount,
    onPageUnmount,
    onPageError,
    ...view
  } = opts
  const status = writable<InkStatus>({ state: 'idle' })
  const current = writable<InkDocument | null>(null)
  const engine = writable<ViewerEngine | null>(null)
  /** The activated annotation: the note thread and the suggestion card open from it. */
  const activated = writable<string | null>(null)

  const root = h('div', { 'data-ink-root': '', 'data-state': 'idle' })
  const scroll = h('div', {
    class: 'ink-scroll',
    'data-ink-scroll': '',
    tabindex: '0',
    role: 'document',
    'aria-label': 'Document',
  })
  const viewportRoot = h(
    'div',
    { class: 'ink-viewport-root', 'data-ink-viewport-root': '', 'data-state': 'idle' },
    scroll
  )
  const toolbar = withToolbar ? createToolbar() : null
  if (toolbar) root.append(toolbar.element)
  root.append(viewportRoot)
  el.append(root)

  const focusReturn = createFocusReturn({
    root: () => root,
    activated: () => activated.get(),
  })

  let statusEl: HTMLElement | null = null
  function renderStatus(s: InkStatus): void {
    root.dataset.state = s.state
    viewportRoot.dataset.state = s.state
    statusEl?.remove()
    statusEl = null
    if (s.state === 'loading') {
      statusEl = h(
        'div',
        { class: 'ink-status', role: 'status', 'aria-live': 'polite' },
        'Loading document…'
      )
    } else if (s.state === 'error') {
      // The engine's message is not written for readers: it stays on the code's tooltip.
      statusEl = h(
        'div',
        { class: 'ink-status ink-error', role: 'alert' },
        h('p', { class: 'ink-error-title' }, 'This document could not be opened.'),
        h(
          'p',
          {},
          h('code', { class: 'ink-error-code', title: s.error.message }, s.error.code)
        )
      )
    }
    if (statusEl) viewportRoot.prepend(statusEl)
  }
  function setStatus(s: InkStatus): void {
    renderStatus(s)
    status.set(s)
  }

  /** Mounts the engine and the popovers for a ready document; returns their teardown. */
  function start(doc: InkDocument): () => void {
    const store = doc.annotations
    const popovers = [
      withNotes ? createNotePopover({ root, store, activated, focusReturn }) : null,
      withSuggestions
        ? createSuggestionCard({ root, store, activated, focusReturn })
        : null,
    ]
    // An activated annotation that has gone (removed, undone) is no longer activated, so it
    // does not reopen its popover if it comes back.
    const stopList = store.list.subscribe(() => {
      const id = activated.get()
      if (id !== null && !store.get(id)) activated.set(null)
    })
    const hosts = new Map<number, HTMLElement>()
    const errors = new Map<number, HTMLElement>()
    const clearError = (page: number): void => {
      errors.get(page)?.remove()
      errors.delete(page)
    }
    const mounted = mountViewer({
      ...view,
      container: scroll,
      document: doc,
      onActivate: (id) => {
        activated.set(id)
        onActivate?.(id)
      },
      onBuild: (viewport, tools) => {
        toolbar?.bind(doc, viewport, tools)
        onBuild?.(viewport, tools)
      },
      onPageMount: (page, mount, host) => {
        hosts.set(page, host)
        onPageMount?.(page, mount, host)
      },
      // A failed page that unmounts reports no recovery: its error goes with it.
      onPageUnmount: (page) => {
        hosts.delete(page)
        clearError(page)
        onPageUnmount?.(page)
      },
      onPageError: (page, error) => {
        clearError(page)
        const host = hosts.get(page)
        if (error && host) {
          const shown = h(
            'div',
            { class: 'ink-page-error', 'data-ink-page-error': '', role: 'alert' },
            h('p', {}, `Page ${page + 1} could not be shown.`),
            h('code', { class: 'ink-error-code' }, error.code)
          )
          host.append(shown)
          errors.set(page, shown)
        }
        onPageError?.(page, error)
      },
    })
    engine.set(mounted)
    return () => {
      stopList()
      for (const p of popovers) p?.destroy()
      activated.set(null)
      engine.set(null)
      mounted.destroy()
      toolbar?.unbind()
    }
  }

  let loads = 0
  let destroyed = false
  let stop: () => void = () => undefined

  /** Tears down the open document, if any, and destroys it. */
  function close(): void {
    stop()
    stop = () => undefined
    const doc = current.get()
    current.set(null)
    doc?.destroy()
  }

  function open(source: DocumentSource): void {
    if (destroyed) return
    const load = ++loads
    close()
    setStatus({ state: 'loading' })
    // The theme's colour variables are read from the root, which is in the page by now.
    openDocument(source, {
      assets,
      password,
      defaults: defaults ?? cssVariableDefaults(root),
      history,
    }).then(
      (doc) => {
        // A later `open` or `destroy` superseded this load.
        if (load !== loads) {
          doc.destroy()
          return
        }
        current.set(doc)
        const s = doc.status.get()
        if (s.state === 'error') {
          setStatus(s)
          onError?.(s.error)
          return
        }
        // The status leaves the layout before the engine measures the scroll element, and the
        // engine is set before anyone hears `ready`.
        renderStatus({ state: 'ready' })
        stop = start(doc)
        status.set({ state: 'ready' })
        onReady?.(doc)
      },
      (cause: unknown) => {
        // Only a programmer error (missing assets) rejects; it gets the error state too.
        if (load !== loads) return
        const error = isInkError(cause)
          ? cause
          : new InkError(
              'InvalidPdf',
              cause instanceof Error ? cause.message : String(cause),
              {},
              cause
            )
        setStatus({ state: 'error', error })
        onError?.(error)
      }
    )
  }

  open(initial)

  return {
    element: root,
    status: readonly(status),
    document: readonly(current),
    engine: readonly(engine),
    toolbar: toolbar?.element ?? null,
    open,
    destroy() {
      if (destroyed) return
      destroyed = true
      loads++
      close()
      toolbar?.destroy()
      root.remove()
    },
  }
}
