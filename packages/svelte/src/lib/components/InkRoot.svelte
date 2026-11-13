<script module lang="ts">
  import type { ChildSnippet } from './child-snippet.js'
  import type {
    Annotation,
    AnnotationChange,
    AnnotationDefaults,
    DocumentSource,
    FieldsChange,
    FieldValues,
    ViewerAction,
    InkDocument,
    InkError,
    InkMessagesInput,
    InkStatus,
    PdfAssets,
  } from '@inkbar/core'
  import type {
    DecorateAnnotation,
    InkPlugin,
    Tool,
    ToolId,
    ZoomValue,
  } from '@inkbar/core/dom'
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  export interface InkRootProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'children' | 'onchange' | 'onerror'
  > {
    src: DocumentSource | null
    assets: PdfAssets
    password?: string | undefined
    /**
     * Ask the reader for the password of a locked file. Default true. False: a locked file is
     * an error with code `PasswordRequired`, as before.
     */
    passwordPrompt?: boolean | undefined
    /** Colour defaults. Without it, the theme's CSS variables on the root element apply. */
    defaults?: AnnotationDefaults | undefined
    /**
     * Pass (with `bind:`) to put annotations under the host's control. The mode is fixed when a
     * document opens: passing or dropping this prop later takes effect on the next open. A host
     * that decides on each proposal uses a function binding.
     */
    annotations?: Annotation[] | undefined
    onAnnotationsChange?: ((next: Annotation[]) => void) | undefined
    onChange?: ((change: AnnotationChange) => void) | undefined
    /**
     * Pass (with `bind:`) to put the form's field values under the host's control. A commit
     * shows at once and is reported after; the host's push wins. The mode is fixed when a
     * document opens, as for `annotations`.
     */
    fields?: FieldValues | undefined
    /**
     * Committed field values, in full, with what changed them. Called only while the fields
     * are controlled, after the bound value is written.
     */
    onFieldsChange?: ((next: FieldValues, change: FieldsChange) => void) | undefined
    /**
     * The viewer asked the host to submit a form, open a link, send mail, print or prompt.
     * Inkbar does none of these.
     */
    onaction?: ((action: ViewerAction) => void) | undefined
    /** Tints fillable form fields. Default true. A change applies to the open document in place. */
    formHighlight?: boolean | undefined
    tool?: ToolId | undefined
    onToolChange?: ((tool: ToolId) => void) | undefined
    /**
     * The creation tools, such as `allTools()` or a pick of the tool factories. `select-text`
     * and `select` are always present; a tool with either id replaces it. They are read when a
     * document opens: a tool added later is usable from the next open, one removed stops at
     * once. When the active tool goes, the viewer switches to `select-text` and calls
     * `onToolChange`. A controlled `tool` naming a missing tool is reported back as
     * `select-text` and is not applied again when the tool appears later. Each mounted control
     * for a missing tool logs its own `UnknownTool`.
     */
    tools?: Tool[] | undefined
    /**
     * Plugins, set up once when the root is created; a later change to this prop is not
     * applied. Their tools join `tools`, their decoration and page layers apply to every
     * document, and their commands are placed with `InkCommand` or `useCommand`.
     */
    plugins?: InkPlugin[] | undefined
    /**
     * Adds `data-*` attributes, classes and a screen-reader description to each annotation's
     * element (see `DecorateAnnotation`). Decorations re-apply whenever the annotations change
     * and when this prop changes, without rebuilding the viewer. Pass a new function when its
     * output would change for any other reason.
     */
    decorateAnnotation?: DecorateAnnotation | undefined
    /**
     * The font families text boxes offer, replacing the PDF standard families
     * (`FONT_FAMILIES`). Fonts beyond those are the PDF writer's to embed.
     */
    fonts?: string[] | undefined
    /**
     * Where the viewer keeps what lasts between visits: saved signatures, each `InkSidebar`'s
     * width and the plugins' settings. Default: memory, gone on reload. `createLocalStorage`
     * keeps them in the browser; a host can keep them anywhere. Read once, when the root is
     * created.
     */
    storage?: InkStorage | undefined
    /**
     * The narrowest the document may get beside the sidebars, in CSS px, before a rail
     * sidebar's panel floats over the pages instead. Default 480 (`MIN_DOCUMENT_WIDTH`). Every
     * `InkSidebar` inside takes it unless it has its own. Read once, when the root is created.
     */
    minDocumentWidth?: number | undefined
    /** The handwriting fonts a typed signature offers; the host loads them. */
    signatureFonts?: string[] | undefined
    page?: number | undefined
    onPageChange?: ((page: number) => void) | undefined
    zoom?: ZoomValue | undefined
    onZoomChange?: ((zoom: ZoomValue) => void) | undefined
    /**
     * The words the viewer shows, over English: any group, any subset of its keys. A string,
     * or a function the viewer calls again whenever `messages` or `locale` changes. A change
     * applies in place: nothing remounts and open menus stay open.
     */
    messages?: InkMessagesInput | undefined
    /**
     * The locale dates are formatted for, and the root's `lang` when it is a valid tag.
     * Default: the `lang` of `messages`, else the browser's.
     */
    locale?: string | undefined
    /** Undo history. Defaults to on for uncontrolled, off for controlled. */
    history?: boolean | undefined
    onReady?: ((doc: InkDocument) => void) | undefined
    /**
     * Opening failed, or later: a form script failed (`FormScriptError`; the form stays
     * fillable), or a signature field refused its signing (`FieldSigned`, `FieldReadOnly`).
     * An error from while the document opened comes after `onReady`.
     */
    onError?: ((error: InkError) => void) | undefined
    onActivate?: ((id: string) => void) | undefined
    /** The root element, for hosts that bind it. */
    ref?: HTMLElement | null
    children?: Snippet<[{ status: InkStatus; document: InkDocument | null }]>
    /**
     * Render your own root element: spread `props` on it and put your content inside. The
     * context is still provided, so Inkbar components work inside it.
     */
    child?: ChildSnippet
  }
</script>

<script lang="ts">
  import {
    createMemoryStorage,
    createSignatureLibrary,
    createSnapshotHistory,
    createStorageSignatureStore,
    InkError as InkErrorClass,
    isValidLocale,
    openDocument,
    readonly,
    writable,
  } from '@inkbar/core'
  import {
    attachFileKeys,
    attachHistoryKeys,
    createMessageState,
    createPasswordPrompt,
    createPluginHost,
    createSearchController,
    createToolOptions,
    cssVariableDefaults,
    FONT_FAMILIES,
    handleFindKey,
    keepHistoryFocus,
    lockedStatus,
    MIN_DOCUMENT_WIDTH,
    pageSelectionText,
    SIGNATURE_FONTS,
    trackToolStyle,
    unknownTool,
    viewerSearchOf,
  } from '@inkbar/core/dom'
  import { DEV } from 'esm-env'
  import { flushSync, untrack } from 'svelte'
  import { createAttachmentKey } from 'svelte/attachments'

  import { setInkContext, type InkContext, type InkHistory } from '../context.js'
  import { registeredToolIds } from '../hooks/useRegisteredTool.svelte.js'
  import { setMessageStore } from '../message-store.js'
  import { useReadable } from '../use-readable.svelte.js'

  import type { InkStorage, PluginHistory } from '@inkbar/core'
  import type {
    Navigation,
    PasswordPrompt,
    PluginHost,
    SearchController,
    ToolController,
    Viewport,
  } from '@inkbar/core/dom'

  let {
    src,
    assets,
    password,
    passwordPrompt = true,
    defaults,
    annotations = $bindable(),
    onAnnotationsChange,
    onChange,
    fields = $bindable(),
    onFieldsChange,
    onaction,
    formHighlight,
    tool = $bindable(),
    onToolChange,
    tools: hostTools,
    plugins,
    decorateAnnotation,
    fonts,
    storage: storageProp,
    minDocumentWidth: minDocumentWidthProp,
    signatureFonts,
    page = $bindable(),
    onPageChange,
    zoom = $bindable(),
    onZoomChange,
    messages: messagesProp,
    locale: localeProp,
    history: historyProp,
    onReady,
    onError,
    onActivate,
    ref = $bindable(null),
    children,
    child,
    ...rest
  }: InkRootProps = $props()

  type TestHookElement = HTMLElement & { __inkDocument?: InkDocument | undefined }

  // Read once, like `plugins`: the sidebars and the plugins load from it as they are created.
  const storage = untrack(() => storageProp ?? createMemoryStorage())
  const storageSignatures = createStorageSignatureStore(storage)
  // Read once, like `storage`: each sidebar reads it as it is created.
  const minDocumentWidth = untrack(() => minDocumentWidthProp ?? MIN_DOCUMENT_WIDTH)
  const signatures = createSignatureLibrary(storageSignatures)
  $effect(() => {
    void signatures.refresh()
  })
  /*
   * One message state for the root's life. The props are pushed into it; the engine, the plugin
   * host and core's factories share it, and the components read its mirror below. Every set is
   * a new state, so label functions run again even when the host passes an equal object.
   */
  const messageState = untrack(() => createMessageState(messagesProp, localeProp))
  const publicMessageState = readonly(messageState)
  setMessageStore(messageState)
  /** What the store last took from the props: the first values went in at creation. */
  let pushedMessages = untrack(() => messagesProp)
  let pushedLocale = untrack(() => localeProp)
  // Before the DOM updates, so the new words are on screen in the same flush as the new props.
  $effect.pre(() => {
    const next = messagesProp
    if (next === pushedMessages) return
    pushedMessages = next
    untrack(() => messageState.setMessages(next))
  })
  $effect.pre(() => {
    const next = localeProp
    if (next === pushedLocale) return
    pushedLocale = next
    untrack(() => messageState.setLocale(next))
  })
  const words = useReadable(() => messageState, messageState.get())
  const lang = $derived(
    isValidLocale(words.current.locale) ? words.current.locale : undefined
  )

  /** Tool options last as long as the root; the tool style is per document. */
  const toolOptions = createToolOptions()

  const IDLE: InkStatus = { state: 'idle' }
  const NO_ANNOTATIONS: readonly Annotation[] = []
  const NO_IDS: readonly string[] = []
  const noop = (): void => undefined

  /** Signed URLs change; the key does not. Bytes and Blobs are their own identity. */
  function identity(source: DocumentSource | null): unknown {
    if (source === null) return null
    if (typeof source === 'string') return source
    if ('key' in source) return source.key
    return source
  }

  function setTestHook(el: HTMLElement | null, doc: InkDocument | undefined): void {
    if (el && DEV) (el as TestHookElement).__inkDocument = doc
  }

  let document = $state.raw<InkDocument | null>(null)
  /** The same document outside the reactive graph, for the plugins' history. */
  let documentNow: InkDocument | null = null
  /** Overrides the document's status while opening, and when opening itself failed. */
  let override = $state.raw<InkStatus | null>(null)
  let activated = $state<string | null>(null)
  /** The same value outside the reactive graph, for the popovers' close handlers. */
  let activatedNow: string | null = null
  let viewport = $state.raw<Viewport | null>(null)
  let tools = $state.raw<ToolController | null>(null)
  let navigation = $state.raw<Navigation | null>(null)

  const documentStatus = useReadable<InkStatus>(() => document?.status, IDLE)
  const status = $derived(override ?? documentStatus.current)
  const annotationList = useReadable<readonly Annotation[]>(
    () => document?.annotations.list,
    NO_ANNOTATIONS
  )
  const selection = useReadable<readonly string[]>(
    () => document?.annotations.selection,
    NO_IDS
  )
  const currentTool = $derived<ToolId>(tool ?? 'select-text')

  // What the next open will do follows the prop; the open document's mode is fixed.
  const controlledProp = $derived(annotations !== undefined)
  const controlled = $derived(
    document ? document.annotations.mode === 'controlled' : controlledProp
  )
  const historyEnabled = $derived(controlled && historyProp === true)

  const snapshotHistory = createSnapshotHistory({
    apply: (list) => document?.annotations.replaceAll(list, 'history'),
    enabled: () => historyEnabled,
  })
  $effect(() => {
    snapshotHistory.observe(annotations)
  })

  // Open for a new source identity or password. The effect reads them through deriveds, which
  // notify only when the value changes: a host that spreads its props, or passes a new URL under
  // the same key, invalidates `src` without changing the identity. Everything else is read under
  // `untrack`, so a changed `assets`, `defaults` or callback never reopens.
  const sourceIdentity = $derived(identity(src))
  const sourcePassword = $derived(password)
  /*
   * The reader's retry. `retry` parks the typed password and bumps `attempt`, which reopens the
   * document; the open takes it and clears it in the same step that starts the fetch, so
   * nothing outlives that load.
   */
  let retryPassword: string | null = null
  let attempt = $state(0)
  /** The `attempt` the last fetch started for; an effect run for any other cause is a new source. */
  let startedAttempt = 0
  /** The source identity and host password of the last run, to tell a new source from a retry. */
  let lastSource: { identity: unknown; password: string | undefined } | null = null
  const prompt: PasswordPrompt = createPasswordPrompt((typed) => {
    retryPassword = typed
    attempt += 1
  })
  /** The parked retry password, handed over once. */
  function takeRetry(): string | undefined {
    const typed = retryPassword ?? undefined
    retryPassword = null
    return typed
  }
  $effect(() => {
    const id = sourceIdentity
    const pw = sourcePassword
    const tried = attempt
    // A new source or password from the host: the prompt starts over, even when a retry landed
    // in the same flush, so the typed password never reaches the new source.
    const newSource =
      lastSource === null || lastSource.identity !== id || lastSource.password !== pw
    lastSource = { identity: id, password: pw }
    if (newSource || tried === startedAttempt) {
      retryPassword = null
      untrack(() => prompt.reset())
    }
    startedAttempt = tried
    let cancelled = false
    let opened: InkDocument | null = null
    /** The snapshot history's hold on a controlled document's store. */
    let detach: () => void = noop
    let stopFormErrors: () => void = noop
    untrack(() => snapshotHistory.clear())
    const source = untrack(() => src)
    if (source === null) {
      retryPassword = null
      override = null
      return
    }
    override = { state: 'loading' }
    /**
     * A failed open: the locked status when the prompt is on and the file is locked (the prompt
     * is told once `onError` has run), else an error.
     */
    const fail = (error: InkError, keepDocument: boolean): void => {
      const locked = passwordPrompt ? lockedStatus(error) : null
      if (!locked) prompt.reset()
      if (locked) {
        override = locked
      } else if (!keepDocument) override = { state: 'error', error }
      try {
        onError?.(error)
      } finally {
        if (locked && !cancelled) prompt.locked()
        // Flushed after the prompt is told, so the dialog and the locked panel arrive together.
        if (locked) flushSync()
      }
    }
    const base = untrack(() => ({
      assets,
      defaults: defaults ?? (ref ? cssVariableDefaults(ref) : undefined),
      // Controlled hosts get the snapshot history; core's own stack stays off.
      history: controlledProp ? false : (historyProp ?? true),
      annotations: controlledProp
        ? {
            mode: 'controlled' as const,
            initial: annotations ?? [],
            onChange: (next: Annotation[], change: AnnotationChange) => {
              // A proposal made in the tick this root unmounts or reopens never reaches
              // the host. Writing the bindable hands it to a bound host now; the effect
              // below pushes the applied list to the store in Svelte's next effect flush.
              if (cancelled) return
              annotations = next
              onAnnotationsChange?.(next)
              onChange?.(change)
            },
          }
        : { mode: 'uncontrolled' as const },
      fields:
        fields !== undefined
          ? {
              mode: 'controlled' as const,
              initial: fields,
              onChange: (next: FieldValues, change: FieldsChange) => {
                // As for annotations: a commit made in the tick this root unmounts or
                // reopens never reaches the host.
                if (cancelled) return
                fields = next
                onFieldsChange?.(next, change)
              },
            }
          : { mode: 'uncontrolled' as const },
    }))
    /*
     * The typed password goes in as an argument and is used only in the `openDocument` call:
     * no closure captures it, so nothing here keeps it once the load has started.
     */
    void (async (attemptPassword: string | undefined) => {
      try {
        const doc = await openDocument(source, {
          ...base,
          password: attemptPassword ?? pw,
        })
        if (cancelled) {
          doc.destroy()
          return
        }
        opened = doc
        // The prop may have changed while the file loaded, when there was no store to apply it to.
        const current = untrack(() => annotations)
        if (doc.annotations.mode === 'controlled' && current !== undefined)
          doc.annotations.setControlledValue(current)
        // The same for the fields; a document whose fields opened uncontrolled ignores the push.
        const currentFields = untrack(() => fields)
        if (currentFields !== undefined) doc.form.setControlledValue(currentFields)
        // A form script that fails leaves the form fillable; the failure goes to `onError`.
        // Subscribed before anyone hears of the document, so the form replays the errors from
        // while it opened here; they are held until `onReady` has run.
        let held: InkError[] | undefined = []
        stopFormErrors = doc.form.on('error', (e) => {
          if (held) held.push(e)
          else onError?.(e)
        })
        documentNow = doc
        document = doc
        // Controlled edits run the plugins' reactions inside their own snapshot step.
        if (doc.annotations.mode === 'controlled')
          detach = snapshotHistory.attach(doc.annotations)
        // The document is current, so the host reads its history when it hears of it.
        hostDocument.set(doc)
        override = null
        setTestHook(ref, doc)
        const s = doc.status.get()
        try {
          if (s.state === 'ready') {
            prompt.reset()
            onReady?.(doc)
          } else if (s.state === 'error') fail(s.error, true)
        } finally {
          // A host whose `onReady` throws still hears the held errors and every later one.
          const early = held
          held = undefined
          if (!cancelled) for (const e of early) onError?.(e)
        }
      } catch (cause) {
        if (cancelled) return
        const error =
          cause instanceof InkErrorClass
            ? cause
            : new InkErrorClass(
                'InvalidPdf',
                cause instanceof Error ? cause.message : String(cause),
                {},
                cause
              )
        fail(error, false)
      }
    })(takeRetry())
    return () => {
      cancelled = true
      // Cleared first, so the plugins close their stores while the document is still alive.
      hostDocument.set(null)
      detach()
      stopFormErrors()
      opened?.destroy()
      documentNow = null
      document = null
      setTestHook(ref, undefined)
    }
  })

  // The host's list reaches the store; the echo of a proposal it applied is the same list.
  $effect(() => {
    const list = annotations
    const doc = document
    if (list && doc?.annotations.mode === 'controlled')
      untrack(() => doc.annotations.setControlledValue(list))
  })

  // The host's field values reach the form; the echo of a commit it applied changes nothing.
  // Read through a derived, so a host that spreads its props pushes only a new value.
  const pushedFields = $derived(fields)
  $effect(() => {
    const values = pushedFields
    const doc = document
    if (values && doc) untrack(() => doc.form.setControlledValue(values))
  })

  function setTool(id: ToolId): void {
    // As the tool controller does: a missing tool is logged and nothing changes.
    if (!isRegistered(id)) {
      logUnknownTool(id)
      return
    }
    // Picking the active tool again starts it afresh, as after a one-shot tool's use.
    if (currentTool === id && tools?.active.get() === id) tools.set(id)
    tool = id
    onToolChange?.(id)
  }
  function setActivated(id: string | null): void {
    activated = id
    activatedNow = id
    hostActivated.set(id)
    if (id) onActivate?.(id)
  }
  function reportZoom(z: ZoomValue): void {
    zoom = z
    onZoomChange?.(z)
  }
  /**
   * Whether the host has given `page` a value of its own, as React's `page` prop. Until then the
   * page written back below is only a report, so the next document opens at its first page
   * instead of the last one's. Not reactive: it flips only with a change to `page`, which
   * `pageModel`'s readers already track.
   */
  let hostPage = untrack(() => page) !== undefined
  let reportedPage: number | undefined
  function reportPage(p: number): void {
    reportedPage = p
    page = p
    onPageChange?.(p)
  }

  const snapCanUndo = useReadable(() => snapshotHistory.canUndo, false)
  const snapCanRedo = useReadable(() => snapshotHistory.canRedo, false)
  const coreCanUndo = useReadable(() => document?.history.canUndo, false)
  const coreCanRedo = useReadable(() => document?.history.canRedo, false)
  const inkHistory: InkHistory = {
    get canUndo() {
      return controlled ? historyEnabled && snapCanUndo.current : coreCanUndo.current
    },
    get canRedo() {
      return controlled ? historyEnabled && snapCanRedo.current : coreCanRedo.current
    },
    undo: () => (controlled ? snapshotHistory.undo() : document?.history.undo()),
    redo: () => (controlled ? snapshotHistory.redo() : document?.history.redo()),
    clear: () => (controlled ? snapshotHistory.clear() : document?.history.clear()),
    batch: (fn) => {
      if (controlled) snapshotHistory.batch(fn)
      else if (document) document.history.batch(fn)
      else fn()
    },
    track: (store) => pluginHistory.track(store),
    react: (fn) => pluginHistory.react(fn),
  }

  // The undo and redo keys anywhere in the root do what InkUndo and InkRedo do. When either
  // button undoes or redoes the last step and disables itself, focus goes back to the document.
  $effect(() => {
    const el = ref
    if (!el) return
    const stopKeys = attachHistoryKeys(el, () => inkHistory)
    const stopFocus = keepHistoryFocus(el, () =>
      el.querySelector<HTMLElement>('[data-ink-scroll]')
    )
    // Ctrl or Cmd+P prints and +S downloads, as InkPrintButton and InkDownloadButton do.
    const stopFileKeys = attachFileKeys(el, () => document)
    return () => {
      stopKeys()
      stopFocus()
      stopFileKeys()
    }
  })

  /**
   * The history the plugins reach, picked by the open document's mode when they call. The host
   * reads it as soon as a document opens, so it goes by `documentNow`, which is set by then.
   */
  const activeHistory = (): PluginHistory | undefined => {
    const doc = documentNow
    if (!doc) return undefined
    return doc.annotations.mode === 'controlled' ? snapshotHistory : doc.history
  }
  const pluginHistory: PluginHistory = {
    batch: (fn) => {
      const h = activeHistory()
      if (h) h.batch(fn)
      else fn()
    },
    track: (store) => activeHistory()?.track(store) ?? noop,
    react: (fn) => activeHistory()?.react(fn) ?? noop,
  }

  /*
   * One plugin host for the root's life, built in an effect so that no `setup` runs on the
   * server, where effects never run and nothing would clean it up. Until then `pluginHost` is
   * null and InkCommand renders its command disabled. The open effect above runs first, but
   * the document it opens arrives after an await, so the host is in place by then. It follows
   * these writables rather than the root's state: the open effect sets `hostDocument` once
   * `documentNow` is current.
   */
  const hostDocument = writable<InkDocument | null>(null)
  const hostActivated = writable<string | null>(null)
  const viewportEl = writable<HTMLElement | null>(null)
  let pluginHost = $state.raw<PluginHost | null>(null)
  /** One search controller for the root's life, built with the plugin host that shares it. */
  let search = $state.raw<SearchController | null>(null)
  $effect(() => {
    const controller = untrack(() =>
      createSearchController({
        document: readonly(hostDocument),
        viewport: () => viewport,
      })
    )
    const host = untrack(() =>
      createPluginHost({
        // Read once, as documented on the prop.
        plugins: plugins ?? [],
        document: readonly(hostDocument),
        history: () => pluginHistory,
        activated: readonly(hostActivated),
        // As in `createViewer`: an id not in the open document is ignored.
        setActivated: (id) => {
          if (id === null || documentNow?.annotations.get(id)) setActivated(id)
        },
        root: readonly(viewportEl),
        decorate: () => decorateAnnotation,
        viewport: () => viewport,
        search: viewerSearchOf(controller),
        storage,
        messages: publicMessageState,
      })
    )
    search = controller
    pluginHost = host
    // Destroyed after InkViewport's engine and its plugin layers, as in `createViewer`: Svelte
    // creates a component's effects after its template and tears them down in creation order,
    // so the children's teardowns run first.
    return () => {
      host.destroy()
      controller.destroy()
    }
  })

  /*
   * The tools are known once the plugins are set up on mount. A tool id nobody registered is
   * logged as `UnknownTool`; as the active tool, from a `tool` prop or because it left `tools`,
   * it falls back to `select-text`, reported through `onToolChange`. A controlled `tool` that
   * stays on the missing id is not applied again.
   */
  /** The ids of the tools the current viewer was built with; InkViewport sets them. */
  let openedToolIds = $state.raw<readonly ToolId[] | null>(null)
  const toolIds = $derived(registeredToolIds(hostTools, pluginHost, openedToolIds))
  const isRegistered = (id: ToolId): boolean =>
    pluginHost === null || toolIds.includes(id)
  /** The tool the engine and the controls see: a missing one never reaches them. */
  const effectiveTool = $derived<ToolId>(
    isRegistered(currentTool) ? currentTool : 'select-text'
  )
  const logUnknownTool = (id: ToolId): void => console.error(unknownTool(id, toolIds))
  $effect(() => {
    const id = currentTool
    if (isRegistered(id)) return
    untrack(() => {
      logUnknownTool(id)
      tool = 'select-text'
      onToolChange?.('select-text')
    })
  })

  /*
   * Ctrl/Cmd+F while focus is in the root and a find bar is mounted; else the browser's. A
   * native listener: the handler reads the event's `currentTarget`, which is the root here.
   */
  $effect(() => {
    const el = ref
    const controller = search
    if (!el || !controller) return
    const onKeydown = (e: KeyboardEvent): void => {
      handleFindKey(e, controller, () => pageSelectionText(el))
    }
    el.addEventListener('keydown', onKeydown)
    return () => el.removeEventListener('keydown', onKeydown)
  })

  /** The document's tool style; it batches through `inkHistory`, whichever mode is on. */
  const styleTracker = $derived.by(() => {
    const doc = document
    if (!doc) return null
    return untrack(() =>
      trackToolStyle({
        store: doc.annotations,
        history: { batch: (fn) => inkHistory.batch(fn) },
        // The plugins' tools too, so a plugin tool's style group applies.
        tools: [...(hostTools ?? []), ...(pluginHost?.tools ?? [])],
        tool: effectiveTool,
      })
    )
  })
  $effect(() => {
    const id = effectiveTool
    styleTracker?.setTool(id)
  })

  const context: InkContext = {
    get passwordPrompt() {
      return passwordPrompt ? prompt : null
    },
    get assets() {
      return assets
    },
    get document() {
      return document
    },
    get status() {
      return status
    },
    get annotations() {
      return annotationList.current
    },
    get selection() {
      return selection.current
    },
    get pluginHost() {
      return pluginHost
    },
    get search() {
      return search
    },
    viewportEl,
    get viewport() {
      return viewport
    },
    get navigation() {
      return navigation
    },
    setNavigation(n) {
      navigation = n
    },
    get tools() {
      return tools
    },
    get tool() {
      return effectiveTool
    },
    setTool,
    get hostTools() {
      return hostTools
    },
    get openedToolIds() {
      return openedToolIds
    },
    setOpenedToolIds(ids) {
      openedToolIds = ids
    },
    get decorateAnnotation() {
      return decorateAnnotation
    },
    get fonts() {
      return fonts ?? FONT_FAMILIES
    },
    toolOptions,
    storage,
    minDocumentWidth,
    get signatures() {
      return signatures
    },
    get signatureFonts() {
      return signatureFonts ?? SIGNATURE_FONTS
    },
    get toolStyle() {
      return styleTracker?.toolStyle ?? null
    },
    get zoomModel() {
      return zoom
    },
    get pageModel() {
      if (page !== undefined && page !== reportedPage) hostPage = true
      return hostPage ? page : undefined
    },
    reportZoom,
    reportPage,
    get activated() {
      return activated
    },
    setActivated,
    history: inkHistory,
    get rootEl() {
      return ref
    },
    setViewport(vp, tc) {
      viewport = vp
      tools = tc
    },
    get formHighlight() {
      return formHighlight
    },
    get messages() {
      return words.current.messages
    },
    get locale() {
      return words.current.locale
    },
    messageState: publicMessageState,
    reportAction: (a) => onaction?.(a),
    reportError: (e) => onError?.(e),
  }
  setInkContext(context, () => activatedNow)

  // Instance exports, for hosts that `bind:this`. Svelte exposes constants and functions, not
  // getters, so the document and status are read through functions.
  export const history = inkHistory
  export function getDocument(): InkDocument | null {
    return document
  }
  export function getStatus(): InkStatus {
    return status
  }

  /** For the `child` snippet: captures the host's element the way `bind:this` would. */
  const attachRoot = {
    [createAttachmentKey()]: (node: HTMLElement) => {
      ref = node
      return () => {
        ref = null
      }
    },
  }
</script>

{#if child}
  {@render child({
    props: {
      ...rest,
      // A host's `lang` wins; one left undefined keeps the computed one.
      lang: rest.lang ?? lang,
      'data-ink-root': '',
      'data-state': status.state,
      ...attachRoot,
    },
  })}
{:else}
  <div
    bind:this={ref}
    {...rest}
    lang={rest.lang ?? lang}
    data-ink-root=""
    data-state={status.state}
  >
    {@render children?.({ status, document })}
  </div>
{/if}
