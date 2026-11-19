<script module lang="ts">
  import type { ChildSnippet } from './child-snippet.js'
  import type {
    Annotation,
    AnnotationChange,
    AnnotationDefaults,
    DocumentSource,
    EngineLoader,
    FieldsChange,
    FieldValues,
    ViewerAction,
    InkDocument,
    InkError,
    InkMessagesInput,
    InkStatus,
    PdfAssets,
    RedactionPreview,
    RedactionResult,
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
     * The words the viewer shows, over English: an object of groups, each with any subset of
     * its keys. Each label is a string, or a function the viewer calls again whenever
     * `messages` or `locale` changes. A change applies in place: nothing remounts and open
     * menus stay open.
     */
    messages?: InkMessagesInput | undefined
    /**
     * The locale dates are formatted for, and the root's `lang` when it is a valid tag.
     * Default: the `lang` of `messages`, else the browser's.
     */
    locale?: string | undefined
    /** Undo history. Defaults to on for uncontrolled, off for controlled. */
    history?: boolean | undefined
    /**
     * Loads @inkbar/engine, so that InkDownloadButton, InkPrintButton and Ctrl+S or Ctrl+P hand
     * over the file with this session's annotations and changed form values written into it:
     * `() => import('@inkbar/engine')`. It loads on the first of those with changes, never
     * before. Without it they hand over the file as it was opened, the redaction marks cannot
     * be applied (InkApplyRedactions stays disabled), and the engine is not bundled. Read when
     * a document opens: a change applies from the next open.
     */
    engine?: EngineLoader | undefined
    /**
     * How applying redactions (InkApplyRedactions, `useRedaction`) asks before it applies.
     * Default: the built-in dialog (`createRedactionDialog`). A function asks your own way with
     * what the apply will do: resolve true to apply. `false` applies without asking, for a host
     * that has asked already.
     */
    redactionConfirm?:
      false | ((preview: RedactionPreview) => Promise<boolean>) | undefined
    /**
     * The redaction marks were applied: `bytes` is the redacted file, which the root now shows
     * in place of `src` (a host that stores files stores these), and `result` says what was done.
     * When it throws, `onError` hears a `RedactionFailed` error with `details.callback`
     * `'onRedacted'`, and the redacted file still opens. A `src` change made in it opens that
     * source instead of the redacted file.
     */
    onRedacted?:
      ((event: { bytes: Uint8Array; result: RedactionResult }) => void) | undefined
    onReady?: ((doc: InkDocument) => void) | undefined
    /**
     * Opening failed, or later: a form script failed (`FormScriptError`; the form stays
     * fillable), a signature field refused its signing (`FieldSigned`, `FieldReadOnly`), a
     * download or print could not write its copy (`SaveFailed`), or applying redactions failed
     * (`RedactionFailed`, `EngineUnavailable`, `NothingToRedact`); the last two kinds are also
     * shown to the reader in InkViewport's message box. An error from while the document opened
     * comes after `onReady`.
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
    applyRedactionsFlow,
    attachFileKeys,
    attachHistoryKeys,
    fileActionFailure,
    createMessageState,
    createPasswordPrompt,
    createPluginHost,
    createRedactionDialog,
    createSearchController,
    createToolOptions,
    cssVariableDefaults,
    FONT_FAMILIES,
    handleFindKey,
    keepHistoryFocus,
    lockedStatus,
    MIN_DOCUMENT_WIDTH,
    pageSelectionText,
    redactionBusy,
    savePictures,
    SIGNATURE_FONTS,
    trackToolStyle,
    unknownTool,
    viewerSearchOf,
  } from '@inkbar/core/dom'
  import { DEV } from 'esm-env'
  import { flushSync, tick, untrack } from 'svelte'
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
    RedactionDialog,
    RedactionReopen,
    RedactionView,
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
    engine: engineProp,
    redactionConfirm,
    onRedacted,
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

  /**
   * Who shows the reader a failed download's or print's message, and what applying redactions
   * did: InkViewport, when mounted.
   */
  let fileMessageListeners: ((message: string) => void)[] = []
  function showMessage(message: string): void {
    for (const show of fileMessageListeners) show(message)
  }
  function reportFileError(error: unknown): void {
    const failure = fileActionFailure(error, messageState.get().messages)
    if (!failure) return
    showMessage(failure.message)
    onError?.(failure.error)
  }
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

  /**
   * The redacted file shown in place of `src` (what `applyRedactionsFlow` said to open), until
   * the host passes a new `src` or password. Each reopen bumps `reopens`, which opens it.
   */
  let reopened: RedactionReopen | null = null
  let reopens = $state(0)
  /** What to tell the reader once the reopened document shows; read by the open that follows. */
  let toTell: string | null = null
  /**
   * The host's list as it stood before it was proposed the list without the marks, and that
   * proposal. Until the host passes another list, the old one (marks included) is never pushed
   * into the redacted file: the viewer shows the proposed list instead.
   */
  let staleHost: { list: Annotation[] | undefined; proposed: Annotation[] } | null = null
  /**
   * The host's list just before the redaction's proposal reached it. A binding writes the
   * proposal at once, so by the time `proposed` runs a host that answered at once already holds
   * its answer, which must not count as the stale list.
   */
  let beforeRedaction: Annotation[] | undefined
  /** The host's list, or the proposed one while the host still holds the stale list. */
  function hostList(): Annotation[] | undefined {
    const current = untrack(() => annotations)
    return staleHost && current === staleHost.list ? staleHost.proposed : current
  }
  /** The password the open document was opened with: a redacted copy opens with it too. */
  let openedWith: string | undefined
  /** The view each document opened on redacted bytes starts from, until InkViewport reads it. */
  const keptViews = new WeakMap<InkDocument, RedactionView>()
  /**
   * The built-in confirmation, made on first use (so never on the server) and kept until the
   * root unmounts. `answer` settles the question it is showing.
   */
  let redactionDialog: RedactionDialog | null = null
  let answer: (apply: boolean) => void = noop
  // The dialog speaks of one document: when that one closes or another opens, it closes,
  // answering no, so Apply never reaches a document that has gone.
  function closeDialog(): void {
    redactionDialog?.close()
    answer(false)
  }

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
    void reopens
    // A new source or password from the host: the prompt starts over, even when a retry landed
    // in the same flush, so the typed password never reaches the new source.
    const newSource =
      lastSource === null || lastSource.identity !== id || lastSource.password !== pw
    lastSource = { identity: id, password: pw }
    // The redacted file stood in for the old source only.
    if (newSource) reopened = null
    const re = reopened
    // The list and the view are for the first open of the redacted file only: a later open of
    // it (a password attempt) starts as any open does.
    if (re && (re.initial || re.view))
      reopened = { ...re, initial: undefined, view: undefined }
    // A new source: the host's list is its own again.
    if (!re) staleHost = null
    const message = re ? toTell : null
    toTell = null
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
    // A controlled reopen after applying redactions keeps the history as `proposed` left it:
    // emptied, and starting again from the host's answer, which may still be on its way.
    if (!re?.initial) untrack(() => snapshotHistory.clear())
    const source = re ? re.source : untrack(() => src)
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
      pictures: savePictures(ref?.ownerDocument ?? globalThis.document),
      engine: engineProp,
      // Controlled hosts get the snapshot history; core's own stack stays off.
      history: controlledProp ? false : (historyProp ?? true),
      annotations: controlledProp
        ? {
            mode: 'controlled' as const,
            initial: re?.initial ?? hostList() ?? [],
            onChange: (next: Annotation[], change: AnnotationChange) => {
              // A proposal made in the tick this root unmounts or reopens never reaches
              // the host. Writing the bindable hands it to a bound host now; the effect
              // below pushes the applied list to the store in Svelte's next effect flush.
              if (cancelled) return
              // Lifting is no edit: the list the host answers with re-seeds the history.
              if (change.kind === 'replace' && change.reason === 'file')
                snapshotHistory.lifted(change.lifted)
              // Read before the write: a bound host holds its answer as soon as it is written.
              if (change.kind === 'replace' && change.reason === 'redaction')
                beforeRedaction = untrack(() => annotations)
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
      _fileName: re?.fileName,
    }))
    /*
     * The typed password goes in as an argument and is used only in the `openDocument` call:
     * no closure captures it, so nothing here keeps it once the load has started.
     */
    void (async (attemptPassword: string | undefined) => {
      const opening = attemptPassword ?? (re ? re.password : pw)
      try {
        const doc = await openDocument(source, { ...base, password: opening })
        if (cancelled) {
          doc.destroy()
          return
        }
        opened = doc
        if (re?.view) keptViews.set(doc, re.view)
        // The prop may have changed while the file loaded, when there was no store to apply it to.
        const current = hostList()
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
        openedWith = opening
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
        // Said once the redacted file shows, after InkViewport has built for it (a build empties
        // its message box); a reopen that fails shows its own failure instead.
        if (message !== null && s.state === 'ready')
          void tick().then(() => {
            if (!cancelled && documentNow === doc) showMessage(message)
          })
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
      closeDialog()
      // Cleared first, so the plugins close their stores while the document is still alive.
      hostDocument.set(null)
      detach()
      stopFormErrors()
      opened?.destroy()
      documentNow = null
      openedWith = undefined
      document = null
      setTestHook(ref, undefined)
    }
  })

  // The host's list reaches the store; the echo of a proposal it applied is the same list.
  $effect(() => {
    const list = annotations
    const doc = document
    // The host has not answered the redaction's proposal yet: its old list stays out.
    if (staleHost && list === staleHost.list) return
    staleHost = null
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
    // While the marks are applied no thread opens: a reply written then would be lost.
    if (id !== null && documentNow && redactionBusy(documentNow).get()) return
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

  /** False until the root has mounted and once it has unmounted: an apply then stops. */
  let alive = false
  $effect(() => {
    alive = true
    return () => {
      alive = false
      redactionDialog?.destroy()
      redactionDialog = null
      answer(false)
    }
  })
  // New words relabel the dialog in place.
  $effect(() => {
    const m = words.current.messages
    untrack(() => redactionDialog?.setMessages(m))
  })

  function askInDialog(preview: RedactionPreview): Promise<boolean> {
    redactionDialog ??= createRedactionDialog({
      messages: messageState.get().messages,
      onConfirm: () => answer(true),
      onCancel: () => answer(false),
    })
    const dialog = redactionDialog
    return new Promise<boolean>((resolve) => {
      answer = (apply) => {
        answer = noop
        resolve(apply)
      }
      dialog.open(preview)
    })
  }

  /**
   * Applies the open document's redaction marks through core's `applyRedactionsFlow`: asks first
   * (`redactionConfirm`), removes the content under them, calls `onRedacted`, then shows the
   * redacted file in place of `src`, with the same key, file name, password and view.
   * Controlled, the host is proposed its list without the marks and the annotations removed with
   * them (reason `'redaction'`), and the history starts again from its answer. Resolves with
   * what was done, or null when the reader cancelled, nothing was applied, or the root unmounted
   * or another document opened while it ran. A failure leaves the document as it was, is shown
   * in InkViewport's message box and reaches `onError`; it does not reject.
   */
  async function applyRedactions(): Promise<RedactionResult | null> {
    const doc = documentNow
    if (!doc || doc.status.get().state !== 'ready') return null
    const ask = redactionConfirm
    const out = await applyRedactionsFlow(doc, {
      confirm: ask === false ? () => Promise.resolve(true) : (ask ?? askInDialog),
      isCurrent: () => alive && documentNow === doc,
      notify: (event) => onRedacted?.(event),
      callbackName: 'onRedacted',
      onError: (error) => onError?.(error),
      showFailure: showMessage,
      messages: () => messageState.get().messages,
      view: () => {
        const vp = viewport
        const tc = tools
        return vp && tc
          ? {
              zoom: vp.zoom.get(),
              page: vp.currentPage.get(),
              mode: vp.mode.get(),
              rotation: vp.rotation.get(),
              tool: tc.active.get(),
            }
          : undefined
      },
      password: openedWith,
      proposed: (initial) => {
        staleHost = { list: beforeRedaction, proposed: initial }
        beforeRedaction = undefined
        // Armed before Svelte's next effect flush hands the host's list to the history, so
        // that list is the restart, not a step.
        snapshotHistory.replaced()
      },
    })
    if (!out?.reopen) return out?.result ?? null
    // A `src` the host passed from `onRedacted` has opened already (Svelte's effect flush runs
    // before this continuation): that source stays, and the redacted file is not opened.
    if (!alive || documentNow !== doc) return out.result
    reopened = out.reopen
    toTell = out.reopen.message
    // The open effect runs again and opens the redacted file; the old document goes with it.
    reopens += 1
    return out.result
  }
  function keptView(doc: InkDocument): RedactionView | undefined {
    const view = keptViews.get(doc)
    keptViews.delete(doc)
    return view
  }

  /** Whether the open document's redaction marks are being applied: nothing may edit it. */
  const redacting = useReadable(() => (document ? redactionBusy(document) : null), false)
  $effect(() => {
    if (redacting.current) setActivated(null)
  })
  const snapCanUndo = useReadable(() => snapshotHistory.canUndo, false)
  const snapCanRedo = useReadable(() => snapshotHistory.canRedo, false)
  const coreCanUndo = useReadable(() => document?.history.canUndo, false)
  const coreCanRedo = useReadable(() => document?.history.canRedo, false)
  const inkHistory: InkHistory = {
    // While the marks are applied the history stays still, as Undo and Redo show.
    get canUndo() {
      if (redacting.current) return false
      return controlled ? historyEnabled && snapCanUndo.current : coreCanUndo.current
    },
    get canRedo() {
      if (redacting.current) return false
      return controlled ? historyEnabled && snapCanRedo.current : coreCanRedo.current
    },
    undo: () => {
      if (document && redactionBusy(document).get()) return
      if (controlled) snapshotHistory.undo()
      else document?.history.undo()
    },
    redo: () => {
      if (document && redactionBusy(document).get()) return
      if (controlled) snapshotHistory.redo()
      else document?.history.redo()
    },
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
    const stopFileKeys = attachFileKeys(el, () => document, {
      onError: reportFileError,
      messages: () => messageState.get().messages,
    })
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
    reportFileError,
    onFileMessage: (show) => {
      fileMessageListeners = [...fileMessageListeners, show]
      return () => {
        fileMessageListeners = fileMessageListeners.filter((s) => s !== show)
      }
    },
    applyRedactions,
    keptView,
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
