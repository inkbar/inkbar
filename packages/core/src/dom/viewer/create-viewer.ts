/*
 * A viewer without a framework: opens a document, mounts the engine and renders the note
 * thread popover, with the bindings' markup so `@inkbar/theme` styles it unchanged.
 * Toolbars are the host's, built from the controls in ./controls.
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
import {
  createMemorySignatureStore,
  createSignatureLibrary,
} from '../../model/signatures'
import { createPluginHost, type PluginHost } from '../plugins/host'
import { createFocusReturn } from '../popover-focus'
import {
  createSearchController,
  viewerSearchOf,
  type SearchController,
  type ViewerSearch,
} from '../search/controller'
import { handleFindKey, pageSelectionText } from '../search/find-key'
import { createToolOptions } from '../tools'
import { mountViewer, type MountViewerOptions, type ViewerEngine } from '../viewer-engine'

import { h } from './dom'
import { createThreadPopover } from './thread-popover'

import type { PluginHistory } from '../../model/annotations/history'
import type { DocumentSource } from '../../model/source'
import type { PdfAssets } from '../../pdfjs/types'
import type { Command, InkPlugin } from '../plugins/define'
import type { Tool, ToolController } from '../tools'
import type { Viewport } from '../viewport'

/**
 * The engine options, less what the viewer owns: the container, the document, the tool style
 * (bound to one document's store, so each engine makes its own), and the tool options and
 * signature library (one for the viewer's life).
 */
export interface CreateViewerOptions extends Omit<
  MountViewerOptions,
  | 'container'
  | 'document'
  | 'toolStyle'
  | 'toolHistory'
  | 'toolOptions'
  | 'signatureLibrary'
  | 'plugins'
  | 'search'
> {
  source: DocumentSource
  assets: PdfAssets
  /** User password for encrypted files. `open` can pass its own for one load. */
  password?: string
  /** Default: read from the theme's CSS variables on the viewer root. */
  defaults?: AnnotationDefaults
  history?: OpenOptions['history']
  /**
   * Plugins, set up once for the viewer's life. Their tools join the viewer's tools, their
   * decoration and page layers apply to every document, and their commands are placed with
   * `createCommandButton`.
   */
  plugins?: readonly InkPlugin[]
  /** The thread popover for notes and text markup. Default true. */
  threads?: boolean
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
  /**
   * The current viewport and tool controller; `null` while no document is ready. Both change
   * when the engine rebuilds, so read them here rather than holding on to `engine.viewport`.
   */
  readonly viewport: Readable<Viewport | null>
  readonly tools: Readable<ToolController | null>
  /**
   * The activated annotation's id: the one last clicked, or activated with Enter or Space.
   * The note thread opens from it, and an app can anchor its own popover (`createPopover`) to
   * it. `null` when none is, and again once that annotation is removed or the document closes.
   */
  readonly activated: Readable<string | null>
  /**
   * Activates annotation `id`, or clears the activation with `null` (closing the thread
   * popover). Unlike a click, it does not select the annotation or call `onActivate`. An id
   * not in the open document's annotations is ignored.
   */
  setActivated(id: string | null): void
  /** The plugins' commands by namespaced id (`sandbox.suggest`); place one with `createCommandButton`. */
  readonly commands: { get(id: string): Command | undefined }
  /**
   * The search state and its actions, shared by the find bar, the toolbar button and plugins.
   * `open()` runs the search and draws the highlights even when no find bar is mounted.
   */
  readonly search: ViewerSearch
  /**
   * Opens another document in place; the previous one is destroyed. Latest call wins.
   * `password` is used for this load only; without it, the constructor's `password` applies.
   */
  open(source: DocumentSource, opts?: { password?: string }): void
  destroy(): void
}

const noop = () => undefined
const passThrough: PluginHistory = {
  batch: (fn) => fn(),
  track: () => noop,
  react: () => noop,
}

export function createViewer(el: HTMLElement, opts: CreateViewerOptions): Viewer {
  const {
    source: initial,
    assets,
    password,
    defaults,
    history,
    plugins,
    threads: withThreads = true,
    onReady,
    onError,
    onActivate,
    onBuild,
    onPageMount,
    onPageUnmount,
    onPageError,
    // Not options (see the type), but a caller without types could still pass them.
    toolStyle: _toolStyle,
    toolOptions: _toolOptions,
    signatureLibrary: _signatureLibrary,
    signatures: signatureStore,
    search: _search,
    ...view
  } = opts as CreateViewerOptions &
    Pick<MountViewerOptions, 'toolStyle' | 'toolOptions' | 'signatureLibrary' | 'search'>
  /** One library for the viewer's life, so templates and the menu outlive each document. */
  const signatures = createSignatureLibrary(
    signatureStore ?? createMemorySignatureStore()
  )
  /** Tool options persist for the viewer's life; the tool style is per document. */
  const toolOptions = createToolOptions()
  const status = writable<InkStatus>({ state: 'idle' })
  const current = writable<InkDocument | null>(null)
  const engine = writable<ViewerEngine | null>(null)
  const viewport = writable<Viewport | null>(null)
  const tools = writable<ToolController | null>(null)
  /** The activated annotation: the note thread opens from it. */
  const activated = writable<string | null>(null)

  const rootEl = writable<HTMLElement | null>(null)
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
  root.append(viewportRoot)
  el.append(root)
  rootEl.set(scroll)

  /** One controller for the viewer's life: the host, the engine and the find bar share it. */
  const search = createSearchController({
    document: readonly(current),
    viewport: () => viewport.get(),
  })
  /** What callers get: the actions, not the bar registration. */
  const viewerSearch: ViewerSearch = viewerSearchOf(search)
  root.addEventListener('keydown', (e) => {
    handleFindKey(e, search, () => pageSelectionText(root))
  })

  /**
   * One host for the viewer's life. It reads the history when a document opens, and `current`
   * is set before it notifies, so that is the new document's. With no document open, a
   * command's `batch` just runs its function.
   */
  const host: PluginHost = createPluginHost({
    plugins: plugins ?? [],
    document: readonly(current),
    history: () => current.get()?.history ?? passThrough,
    activated: readonly(activated),
    setActivated: (id) => {
      if (id === null || current.get()?.annotations.get(id)) activated.set(id)
    },
    root: readonly(rootEl),
    decorate: () => view.decorateAnnotation,
    viewport: () => viewport.get(),
    search: viewerSearch,
  })

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

  /** Mounts the engine and the thread popover for a ready document; returns their teardown. */
  function start(doc: InkDocument): () => void {
    const store = doc.annotations
    const threads = withThreads
      ? createThreadPopover({ root, store, activated, focusReturn })
      : null
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
      plugins: host,
      search,
      container: scroll,
      document: doc,
      toolOptions,
      signatureLibrary: signatures,
      onActivate: (id) => {
        activated.set(id)
        onActivate?.(id)
      },
      onBuild: (vp, tc) => {
        // Tools first: a viewport subscriber may read the tools.
        tools.set(tc)
        viewport.set(vp)
        onBuild?.(vp, tc)
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
      threads?.destroy()
      activated.set(null)
      engine.set(null)
      mounted.destroy()
      viewport.set(null)
      tools.set(null)
    }
  }

  let loads = 0
  let destroyed = false
  const destroyers: (() => void)[] = []
  let stop: () => void = () => undefined

  /** Tears down the open document, if any, and destroys it. */
  function close(): void {
    stop()
    stop = () => undefined
    const doc = current.get()
    current.set(null)
    doc?.destroy()
  }

  function open(source: DocumentSource, openOpts?: { password?: string }): void {
    if (destroyed) return
    const load = ++loads
    close()
    setStatus({ state: 'loading' })
    // The theme's colour variables are read from the root, which is in the page by now.
    openDocument(source, {
      assets,
      password: openOpts?.password ?? password,
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
        // A status subscriber may have opened another document already.
        if (load === loads) onReady?.(doc)
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

  const viewer: Viewer = {
    element: root,
    status: readonly(status),
    document: readonly(current),
    engine: readonly(engine),
    viewport: readonly(viewport),
    tools: readonly(tools),
    activated: readonly(activated),
    setActivated: (id) => {
      if (id === null || current.get()?.annotations.get(id)) activated.set(id)
    },
    commands: { get: (id) => host.command(id) },
    search: viewerSearch,
    open,
    destroy() {
      if (destroyed) return
      destroyed = true
      loads++
      close()
      for (const fn of destroyers) fn()
      search.destroy()
      host.destroy()
      root.remove()
    },
  }
  toolsByViewer.set(viewer, [...(view.tools ?? []), ...host.tools])
  commandIdsByViewer.set(viewer, () => [...host.commands.keys()])
  internals.set(viewer, { search, destroyers })
  return viewer
}

const toolsByViewer = new WeakMap<Viewer, readonly Tool[]>()

/** The host tools a viewer was given (its own and its plugins'), for the controls' labels and icons. */
export function hostToolsOf(viewer: Viewer): readonly Tool[] {
  return toolsByViewer.get(viewer) ?? []
}

const commandIdsByViewer = new WeakMap<Viewer, () => string[]>()

/** The ids of the commands a viewer's plugins registered, for the error on an unknown one. */
export function hostCommandIdsOf(viewer: Viewer): string[] {
  return commandIdsByViewer.get(viewer)?.() ?? []
}

const internals = new WeakMap<
  Viewer,
  { search: SearchController; destroyers: (() => void)[] }
>()

/** @internal The viewer's search controller, which the find bar registers with. */
export function searchControllerOf(viewer: Viewer): SearchController {
  const found = internals.get(viewer)
  if (!found) throw new Error('Not a viewer made by createViewer')
  return found.search
}

/** @internal Runs `fn` when the viewer is destroyed, for what a control set up on it. */
export function onViewerDestroy(viewer: Viewer, fn: () => void): void {
  internals.get(viewer)?.destroyers.push(fn)
}
