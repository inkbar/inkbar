/*
 * A viewer without a framework: opens a document, mounts the engine and renders the note
 * thread popover, the signature menu a signature field opens and the message box a form script
 * shows, with the bindings' markup so `@inkbar/theme` styles them unchanged.
 * Toolbars are the host's, built from the controls in ./controls.
 */
import { isValidLocale } from '../../messages'
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
  createSignatureLibrary,
  createStorageSignatureStore,
} from '../../model/signatures'
import { createMemoryStorage } from '../../model/storage'
import {
  attachFileKeys,
  downloadDocument,
  printDocument,
  type DownloadOptions,
} from '../file-actions'
import { attachHistoryKeys } from '../history-keys'
import { createMessageState, type MessageState } from '../messages-state'
import { createPasswordPrompt, lockedStatus } from '../password-prompt'
import { createPluginHost, type HostRecords, type PluginHost } from '../plugins/host'
import { createFocusReturn } from '../popover-focus'
import {
  createSearchController,
  viewerSearchOf,
  type SearchController,
  type ViewerSearch,
} from '../search/controller'
import { handleFindKey, pageSelectionText } from '../search/find-key'
import { createToolOptions, withHostTools } from '../tools'
import { mountViewer, type MountViewerOptions, type ViewerEngine } from '../viewer-engine'

import { h } from './dom'
import { createFormAlert } from './form-alert'
import { createPasswordDialog } from './password-dialog'
import { createSignFieldMenu, type SignFieldMenu } from './signature-menu'
import { createThreadPopover } from './thread-popover'

import type { InkMessages, InkMessagesInput } from '../../messages'
import type { PluginHistory } from '../../model/annotations/history'
import type { LinkTarget } from '../../model/destination'
import type { FormController } from '../../model/form/controller'
import type { FieldsMode } from '../../model/form/types'
import type { RecordBase } from '../../model/records'
import type { DocumentSource } from '../../model/source'
import type { PdfAssets } from '../../pdfjs/types'
import type { Navigation } from '../navigation'
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
  | 'onSignField'
  | 'onFormAlert'
  | '_messageState'
> {
  source: DocumentSource
  assets: PdfAssets
  /** User password for encrypted files. `open` can pass its own for one load. */
  password?: string
  /**
   * Ask the reader for the password of a locked file. Default true. False: a locked file is
   * an `error`, as before.
   */
  passwordPrompt?: boolean
  /** Default: read from the theme's CSS variables on the viewer root. */
  defaults?: AnnotationDefaults
  history?: OpenOptions['history']
  /**
   * Form field values; defaults to uncontrolled, starting from the PDF's. Controlled:
   * `{ mode: 'controlled', initial, onChange }`, where `onChange` hears every commit with the
   * full map and the host pushes back with `viewer.form.get()?.setControlledValue(next)`.
   * `initial` applies to every document the viewer opens; push your values once the new one is ready.
   */
  fields?: FieldsMode
  /**
   * The annotation list; defaults to uncontrolled. Controlled: `{ mode: 'controlled', initial,
   * onChange }`, where the host owns the session annotations and `onChange` hears every
   * proposed list. Nothing shows until the host pushes it back with
   * `viewer.document.get()?.annotations.setControlledValue(next)`. Embedded annotations stay in
   * the file and never pass through `onChange`. `initial` applies to every document the viewer
   * opens, including after `viewer.open()`. A host that keeps its own list pushes it with
   * `viewer.document.get()?.annotations.setControlledValue(list)` once the new document is
   * ready (in `onReady`). Undo and redo history is inert in controlled
   * mode: the host owns the list, so it owns undo too.
   */
  annotations?: OpenOptions['annotations']
  /**
   * Plugins, set up once for the viewer's life. Their tools join the viewer's tools, their
   * decoration and page layers apply to every document, and their commands are placed with
   * `createCommandButton`.
   */
  plugins?: readonly InkPlugin[]
  /** The thread popover for notes and text markup. Default true. */
  threads?: boolean
  onReady?(this: void, doc: InkDocument): void
  /** The document failed to open, a form script failed, or signing a field was refused. */
  onError?(this: void, error: InkError): void
}

export interface Viewer {
  /** The root element (`[data-ink-root]`) the viewer rendered into the host element. */
  readonly element: HTMLElement
  readonly status: Readable<InkStatus>
  readonly document: Readable<InkDocument | null>
  /** The open document's form (`document.form`) while it is ready; `null` otherwise. */
  readonly form: Readable<FormController | null>
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
  /**
   * Turns the form field tint on or off (the `formHighlight` option) for the open document,
   * in place, and for the documents opened after it.
   */
  setFormHighlight(on: boolean): void
  /**
   * Replaces the `messages` option: English with `messages` over it, for the open document and
   * the ones opened after it. Every label the viewer shows changes in place: nothing remounts,
   * the scroll position stays, and an open menu, popover or dialog stays open. Calling it
   * with the same object relabels too, which re-reads a host's label functions.
   */
  setMessages(messages: InkMessagesInput | undefined): void
  /**
   * Replaces the `locale` option, in place as `setMessages` does: dates follow it, and the
   * root's `lang` is set to it (removed when it is not a valid language tag). Undefined falls
   * back to the `lang` of the messages passed, if any.
   */
  setLocale(locale: string | undefined): void
  /**
   * The viewer's words and locale, for the life of the viewer. Pass it as `messages` to the
   * pieces made without a viewer (`createToolbar`, `createSidebar`, `createPasswordDialog`…)
   * so they follow `setMessages` and `setLocale` too.
   */
  readonly messages: Readable<MessageState>
  /**
   * Whether `back()` has somewhere to go: a link, outline item or form button jumped since the
   * document opened. False while no document is ready.
   */
  readonly canGoBack: Readable<boolean>
  /** Whether `forward()` has somewhere to go. False while no document is ready. */
  readonly canGoForward: Readable<boolean>
  /** Returns to where the view was before the last jump. History starts over with each document. */
  back(): void
  /** Goes to where the last `back()` left from. */
  forward(): void
  /**
   * Follows a link target as a click on the link would: a destination or Named page action
   * scrolls (zoom unchanged) and can be gone back from; a URL reaches `onAction` as
   * `open-url` and is never opened by the viewer. Does nothing while no document is ready.
   */
  follow(target: LinkTarget): Promise<void>
  /** The plugins' commands by namespaced id (`sandbox.suggest`); place one with `createCommandButton`. */
  readonly commands: { get(id: string): Command | undefined }
  /**
   * The search state and its actions, shared by the find bar, the toolbar button and plugins.
   * `open()` runs the search and draws the highlights even when no find bar is mounted.
   */
  readonly search: ViewerSearch
  /**
   * The records a plugin keeps under `key` (`<plugin>.<name>`), following the open document;
   * the same handle on each call. An unknown key gives an empty handle and logs a warning once.
   */
  records<T extends RecordBase>(key: string): HostRecords<T>
  /**
   * Opens another document in place; the previous one is destroyed. Latest call wins.
   * `password` is used for this load only; without it, the constructor's `password` applies.
   */
  open(source: DocumentSource, opts?: { password?: string }): void
  /**
   * Saves the open document's file through the browser's download, under its `fileName` or
   * `opts.filename`. Today that is the file as it was opened, without this session's
   * annotations. Does nothing while no document is open.
   */
  download(opts?: DownloadOptions): Promise<void>
  /**
   * Prints the open document's file with the browser's own PDF viewer; on iOS the PDF opens
   * in a new tab instead. As with `download`, today that is the file as it was opened. Does
   * nothing while no document is open.
   */
  print(): Promise<void>
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
    passwordPrompt = true,
    defaults,
    history,
    fields,
    annotations,
    plugins,
    threads: withThreads = true,
    onReady,
    onError,
    onActivate,
    onBuild,
    onPageMount,
    onPageUnmount,
    onPageError,
    formHighlight: initialHighlight,
    messages: initialMessages,
    locale: initialLocale,
    // Not options (see the type), but a caller without types could still pass them.
    toolStyle: _toolStyle,
    toolOptions: _toolOptions,
    signatureLibrary: _signatureLibrary,
    onSignField: _onSignField,
    onFormAlert: _onFormAlert,
    storage = createMemoryStorage(),
    search: _search,
    _messageState: _ownMessages,
    ...view
  } = opts as CreateViewerOptions &
    Pick<
      MountViewerOptions,
      | 'toolStyle'
      | 'toolOptions'
      | 'signatureLibrary'
      | 'search'
      | 'onSignField'
      | 'onFormAlert'
      | '_messageState'
    >
  /** The words and locale for the viewer's life: every document's engine shares them. */
  const messages = createMessageState(initialMessages, initialLocale)
  const words = () => messages.get().messages
  /** One library for the viewer's life, so templates and the menu outlive each document. */
  const signatures = createSignatureLibrary(createStorageSignatureStore(storage), {
    removeFailed: () => words().signature.removeFailed,
  })
  /** Tool options persist for the viewer's life; the tool style is per document. */
  const toolOptions = createToolOptions()
  const status = writable<InkStatus>({ state: 'idle' })
  const current = writable<InkDocument | null>(null)
  const form = writable<FormController | null>(null)
  const engine = writable<ViewerEngine | null>(null)
  const viewport = writable<Viewport | null>(null)
  const tools = writable<ToolController | null>(null)
  /** The open document's history, and whether it can move, following each engine. */
  const navigation = writable<Navigation | null>(null)
  const canGoBack = writable(false)
  const canGoForward = writable(false)
  /** The activated annotation: the note thread opens from it. */
  const activated = writable<string | null>(null)
  let formHighlight = initialHighlight ?? true

  const rootEl = writable<HTMLElement | null>(null)
  const root = h('div', { 'data-ink-root': '', 'data-state': 'idle' })
  const scroll = h('div', {
    class: 'ink-scroll',
    'data-ink-scroll': '',
    tabindex: '0',
    role: 'document',
    'aria-label': words().viewer.document,
  })
  const viewportRoot = h(
    'div',
    { class: 'ink-viewport-root', 'data-ink-viewport-root': '', 'data-state': 'idle' },
    scroll
  )
  root.append(viewportRoot)
  el.append(root)
  // Anywhere in the root, toolbars included: the keys do what createUndo and createRedo do.
  const stopHistoryKeys = attachHistoryKeys(root, () => current.get()?.history)
  // Ctrl or Cmd+P and +S inside the root: what viewer.print and viewer.download do.
  const stopFileKeys = attachFileKeys(root, () => current.get())
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
    storage,
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
    messages: readonly(messages),
  })

  const focusReturn = createFocusReturn({
    root: () => root,
    activated: () => activated.get(),
  })
  /** For the viewer's life, like the signature library: the field menu and the script alert. */
  let signFieldMenu: SignFieldMenu | undefined
  const formAlert = createFormAlert(root, readonly(messages))

  let statusEl: HTMLElement | null = null
  /** Rewrites the status panel's words in place, for the status showing now. */
  let relabelStatus: () => void = () => undefined
  /** The page error notices showing, by page, relabelled with the rest. */
  const pageErrors = new Map<HTMLElement, number>()
  /** The reader cancelled the prompt: the unlock button takes focus once the panel shows. */
  let focusUnlock = false

  /** The root's `lang`: the locale when it is a valid tag, else none. */
  const applyLocale = (locale: string | undefined): void => {
    if (isValidLocale(locale)) root.setAttribute('lang', locale)
    else root.removeAttribute('lang')
  }
  applyLocale(messages.get().locale)
  /** New words or locale: the shell's own labels change in place. */
  const stopMessages = messages.subscribe(({ messages: m, locale }) => {
    applyLocale(locale)
    scroll.setAttribute('aria-label', m.viewer.document)
    relabelStatus()
    for (const [notice, page] of pageErrors) {
      const text = notice.querySelector('[data-ink-page-error-text]')
      if (text) text.textContent = m.viewer.pageFailed({ page: page + 1 })
    }
  })

  function renderStatus(s: InkStatus): void {
    root.dataset.state = s.state
    viewportRoot.dataset.state = s.state
    statusEl?.remove()
    statusEl = null
    relabelStatus = () => undefined
    const m = words()
    if (s.state === 'loading') {
      const el = h(
        'div',
        { class: 'ink-status', role: 'status', 'aria-live': 'polite' },
        m.viewer.loading
      )
      relabelStatus = () => {
        el.textContent = words().viewer.loading
      }
      statusEl = el
    } else if (s.state === 'locked') {
      const unlock = h(
        'button',
        { type: 'button', class: 'ink-button', 'data-ink-unlock': '' },
        m.password.unlock
      )
      unlock.addEventListener('click', () => prompt.ask())
      const title = h('p', { class: 'ink-locked-title' }, m.password.locked)
      relabelStatus = () => {
        unlock.textContent = words().password.unlock
        title.textContent = words().password.locked
      }
      statusEl = h(
        'div',
        { class: 'ink-status ink-locked', role: 'status' },
        title,
        unlock
      )
    } else if (s.state === 'error') {
      // The engine's message is not written for readers: it stays on the code's tooltip.
      const title = h('p', { class: 'ink-error-title' }, m.viewer.openFailed)
      relabelStatus = () => {
        title.textContent = words().viewer.openFailed
      }
      statusEl = h(
        'div',
        { class: 'ink-status ink-error', role: 'alert' },
        title,
        h(
          'p',
          {},
          h('code', { class: 'ink-error-code', title: s.error.message }, s.error.code)
        )
      )
    }
    if (statusEl) viewportRoot.prepend(statusEl)
    if (s.state === 'loading') return
    if (focusUnlock) statusEl?.querySelector<HTMLElement>('[data-ink-unlock]')?.focus()
    focusUnlock = false
  }
  function setStatus(s: InkStatus): void {
    renderStatus(s)
    status.set(s)
  }

  /** Mounts the engine and the thread popover for a ready document; returns their teardown. */
  function start(doc: InkDocument): () => void {
    const store = doc.annotations
    const threads = withThreads
      ? createThreadPopover({
          root,
          store,
          activated,
          focusReturn,
          messages: readonly(messages),
        })
      : null
    // An activated annotation that has gone (removed, undone) is no longer activated, so it
    // does not reopen its popover if it comes back.
    const stopList = store.list.subscribe(() => {
      const id = activated.get()
      if (id !== null && !store.get(id)) activated.set(null)
    })
    // A failed script leaves the form fillable; its error reaches the host. Subscribed first,
    // so the form replays the errors from while the document opened here, and they are held
    // until `onReady` has run.
    let held: InkError[] | undefined = []
    const stopForm = doc.form.on('error', (error) => {
      if (held) held.push(error)
      else onError?.(error)
    })
    releaseFormErrors = () => {
      const early = held ?? []
      held = undefined
      for (const error of early) onError?.(error)
    }
    const hosts = new Map<number, HTMLElement>()
    const errors = new Map<number, HTMLElement>()
    const clearError = (page: number): void => {
      const shown = errors.get(page)
      if (shown) pageErrors.delete(shown)
      shown?.remove()
      errors.delete(page)
    }
    const mounted = mountViewer({
      ...view,
      plugins: host,
      search,
      container: scroll,
      document: doc,
      formHighlight,
      _messageState: messages,
      toolOptions,
      signatureLibrary: signatures,
      storage,
      onFormAlert: (message) => formAlert.show(message),
      // Pressed after `createViewer` returned, so `viewer` exists by then.
      onSignField: (req) => {
        signFieldMenu ??= createSignFieldMenu(viewer, {
          ...(view.signatureFonts ? { fonts: view.signatureFonts } : {}),
          onError: (error) => onError?.(error),
        })
        signFieldMenu.open(req)
      },
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
            h(
              'p',
              { 'data-ink-page-error-text': '' },
              words().viewer.pageFailed({ page: page + 1 })
            ),
            h('code', { class: 'ink-error-code' }, error.code)
          )
          host.append(shown)
          errors.set(page, shown)
          pageErrors.set(shown, page)
        }
        onPageError?.(page, error)
      },
    })
    engine.set(mounted)
    const nav = mounted.navigation
    const stopNav = [
      nav.canGoBack.subscribe(canGoBack.set),
      nav.canGoForward.subscribe(canGoForward.set),
    ]
    canGoBack.set(nav.canGoBack.get())
    canGoForward.set(nav.canGoForward.get())
    navigation.set(nav)
    return () => {
      for (const s of stopNav) s()
      navigation.set(null)
      canGoBack.set(false)
      canGoForward.set(false)
      stopForm()
      releaseFormErrors = () => undefined
      signFieldMenu?.close()
      formAlert.close()
      stopList()
      threads?.destroy()
      activated.set(null)
      engine.set(null)
      mounted.destroy()
      viewport.set(null)
      tools.set(null)
    }
  }

  /**
   * One prompt and dialog for the viewer's life. A submitted password goes straight to a retry
   * of the last source and is not kept: the dialog clears its field and the load drops it.
   */
  let lastSource: DocumentSource = initial
  const prompt = createPasswordPrompt((pw) => load(lastSource, { password: pw }))
  const passwordDialog = createPasswordDialog({
    messages: readonly(messages),
    onSubmit: (pw) => prompt.submit(pw),
    onCancel: () => {
      prompt.cancel()
      // During a retry the panel shows when the load comes back locked.
      const unlock = statusEl?.querySelector<HTMLElement>('[data-ink-unlock]')
      if (unlock) unlock.focus()
      else focusUnlock = true
    },
  })
  const stopPrompt = prompt.state.subscribe(({ asking, pending }) => {
    if (!asking) {
      passwordDialog.close()
      return
    }
    // While a retry loads the dialog stays as it is; its result (or `ask`) opens or updates it.
    if (!pending) {
      const s = status.get()
      passwordDialog.open({ incorrect: s.state === 'locked' && s.incorrect })
    }
    passwordDialog.setPending(pending)
  })

  let loads = 0
  let destroyed = false
  const destroyers: (() => void)[] = []
  let stop: () => void = () => undefined
  /** Hands the open document's held form errors to `onError`, once `onReady` has run. */
  let releaseFormErrors: () => void = () => undefined

  /** Tears down the open document, if any, and destroys it. */
  function close(): void {
    stop()
    stop = () => undefined
    const doc = current.get()
    form.set(null)
    current.set(null)
    doc?.destroy()
  }

  /** A failed load: locked, with the prompt asking, or an error. */
  function fail(error: InkError, load: number): void {
    const locked = passwordPrompt ? lockedStatus(error) : null
    if (!locked) prompt.reset()
    setStatus(locked ?? { state: 'error', error })
    try {
      onError?.(error)
    } finally {
      // `onError` may have opened another document already. One that throws still leaves the
      // prompt ready for the next try.
      if (locked && load === loads) prompt.locked()
    }
  }

  /** A new source: the prompt starts over. */
  function open(source: DocumentSource, openOpts?: { password?: string }): void {
    if (destroyed) return
    prompt.reset()
    lastSource = source
    load(source, openOpts)
  }

  /** Loads `source`; a retry from the prompt comes here directly, keeping the dialog open. */
  function load(source: DocumentSource, openOpts?: { password?: string }): void {
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
      fields,
      annotations,
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
          fail(s.error, load)
          return
        }
        const prompted = passwordDialog.isOpen
        prompt.reset()
        // The status leaves the layout before the engine measures the scroll element, and the
        // engine is set before anyone hears `ready`.
        renderStatus({ state: 'ready' })
        // Unlocked from the dialog, focus went with it: the document takes it.
        if (
          prompted &&
          (!document.activeElement || document.activeElement === document.body)
        )
          scroll.focus({ preventScroll: true })
        stop = start(doc)
        form.set(doc.form)
        status.set({ state: 'ready' })
        // A status subscriber may have opened another document already.
        if (load !== loads) return
        onReady?.(doc)
        if (load === loads) releaseFormErrors()
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
        fail(error, load)
      }
    )
  }

  open(initial)

  const viewer: Viewer = {
    element: root,
    async download(opts) {
      const doc = current.get()
      if (doc) await downloadDocument(doc, opts)
    },
    async print() {
      const doc = current.get()
      if (doc) await printDocument(doc)
    },
    status: readonly(status),
    document: readonly(current),
    form: readonly(form),
    engine: readonly(engine),
    viewport: readonly(viewport),
    tools: readonly(tools),
    activated: readonly(activated),
    setActivated: (id) => {
      if (id === null || current.get()?.annotations.get(id)) activated.set(id)
    },
    setFormHighlight(on) {
      formHighlight = on
      engine.get()?.setFormHighlight(on)
    },
    setMessages(next) {
      if (!destroyed) messages.setMessages(next)
    },
    setLocale(next) {
      if (!destroyed) messages.setLocale(next)
    },
    messages: readonly(messages),
    canGoBack: readonly(canGoBack),
    canGoForward: readonly(canGoForward),
    back: () => navigation.get()?.back(),
    forward: () => navigation.get()?.forward(),
    follow: async (target) => navigation.get()?.follow(target),
    commands: { get: (id) => host.command(id) },
    search: viewerSearch,
    records: (key) => host.records(key),
    open,
    destroy() {
      if (destroyed) return
      destroyed = true
      loads++
      close()
      for (const fn of destroyers) fn()
      search.destroy()
      signFieldMenu?.destroy()
      formAlert.destroy()
      stopMessages()
      stopPrompt()
      passwordDialog.destroy()
      host.destroy()
      stopHistoryKeys()
      stopFileKeys()
      root.remove()
    },
  }
  toolsByViewer.set(viewer, withHostTools([...(view.tools ?? []), ...host.tools]))
  commandIdsByViewer.set(viewer, () => [...host.commands.keys()])
  internals.set(viewer, {
    search,
    host,
    navigation: readonly(navigation),
    messages: readonly(messages),
    destroyers,
    destroyed: () => destroyed,
  })
  return viewer
}

const toolsByViewer = new WeakMap<Viewer, readonly Tool[]>()

/**
 * Every tool a viewer registers (`select-text` and `select`, then its own and its plugins'), for
 * the controls' labels and icons.
 */
export function toolsOf(viewer: Viewer): readonly Tool[] {
  return toolsByViewer.get(viewer) ?? []
}

const commandIdsByViewer = new WeakMap<Viewer, () => string[]>()

/** The ids of the commands a viewer's plugins registered, for the error on an unknown one. */
export function hostCommandIdsOf(viewer: Viewer): string[] {
  return commandIdsByViewer.get(viewer)?.() ?? []
}

const internals = new WeakMap<
  Viewer,
  {
    search: SearchController
    host: PluginHost
    navigation: Readable<Navigation | null>
    messages: Readable<MessageState>
    destroyers: (() => void)[]
    destroyed: () => boolean
  }
>()

/** @internal The viewer's search controller, which the find bar registers with. */
export function searchControllerOf(viewer: Viewer): SearchController {
  const found = internals.get(viewer)
  if (!found) throw new Error('Not a viewer made by createViewer')
  return found.search
}

/** @internal The viewer's plugin host, for builders that read plugin records and layers. */
export function pluginHostOf(viewer: Viewer): PluginHost {
  const found = internals.get(viewer)
  if (!found) throw new Error('Not a viewer made by createViewer')
  return found.host
}

/**
 * @internal The open document's navigation, `null` while none is ready, for controls that jump
 * (the outline) and so must record history.
 */
export function navigationOf(viewer: Viewer): Readable<Navigation | null> {
  const found = internals.get(viewer)
  if (!found) throw new Error('Not a viewer made by createViewer')
  return found.navigation
}

/** @internal The viewer's words and locale, for the controls that label themselves. */
export function messagesOf(viewer: Viewer): Readable<MessageState> {
  const found = internals.get(viewer)
  if (!found) throw new Error('Not a viewer made by createViewer')
  return found.messages
}

/**
 * @internal Calls `fn` with the viewer's words on every change, until the viewer is destroyed:
 * for a control that rewrites its own labels in place. It does not call `fn` now.
 */
export function onMessages(viewer: Viewer, fn: (m: InkMessages) => void): void {
  const stop = messagesOf(viewer).subscribe(({ messages: m }) => fn(m))
  onViewerDestroy(viewer, stop)
}

/**
 * @internal Runs `fn` when the viewer is destroyed, for what a control set up on it; at once
 * when it already is.
 */
export function onViewerDestroy(viewer: Viewer, fn: () => void): void {
  const found = internals.get(viewer)
  if (!found) return
  if (found.destroyed()) fn()
  else found.destroyers.push(fn)
}
