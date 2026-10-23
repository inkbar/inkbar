<script module lang="ts">
  import type { ChildSnippet } from './child-snippet.js'
  import type {
    Annotation,
    AnnotationChange,
    AnnotationDefaults,
    DocumentSource,
    FieldsChange,
    FieldValues,
    FormAction,
    InkDocument,
    InkError,
    InkStatus,
    PdfAssets,
    SignatureStore,
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
    /** The form asked to submit, open a link, send mail, print or prompt. Inkbar does none. */
    onformaction?: ((action: FormAction) => void) | undefined
    /** Tints fillable form fields. Default true. Read when the viewer is built for a document. */
    formHighlight?: boolean | undefined
    tool?: ToolId | undefined
    onToolChange?: ((tool: ToolId) => void) | undefined
    /**
     * Host tools, added to the built-ins; one with a built-in's id replaces it. Read when a
     * document opens.
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
     * Where saved signatures live. Default: memory, gone on reload.
     * `createLocalSignatureStore` keeps them in the browser; a host can keep them anywhere.
     * A new store takes effect at once, for the menus and the `signature` tool alike.
     */
    signatures?: SignatureStore | undefined
    /** The handwriting fonts a typed signature offers; the host loads them. */
    signatureFonts?: string[] | undefined
    page?: number | undefined
    onPageChange?: ((page: number) => void) | undefined
    zoom?: ZoomValue | undefined
    onZoomChange?: ((zoom: ZoomValue) => void) | undefined
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
    createMemorySignatureStore,
    createSignatureLibrary,
    createSnapshotHistory,
    InkError as InkErrorClass,
    openDocument,
    readonly,
    writable,
  } from '@inkbar/core'
  import {
    createPluginHost,
    createSearchController,
    createToolOptions,
    cssVariableDefaults,
    FONT_FAMILIES,
    handleFindKey,
    pageSelectionText,
    SIGNATURE_FONTS,
    trackToolStyle,
    viewerSearchOf,
  } from '@inkbar/core/dom'
  import { DEV } from 'esm-env'
  import { untrack } from 'svelte'
  import { createAttachmentKey } from 'svelte/attachments'

  import { setInkContext, type InkContext, type InkHistory } from '../context.js'
  import { useReadable } from '../use-readable.svelte.js'

  import type { PluginHistory } from '@inkbar/core'
  import type {
    PluginHost,
    SearchController,
    ToolController,
    Viewport,
  } from '@inkbar/core/dom'

  let {
    src,
    assets,
    password,
    defaults,
    annotations = $bindable(),
    onAnnotationsChange,
    onChange,
    fields = $bindable(),
    onFieldsChange,
    onformaction,
    formHighlight,
    tool = $bindable(),
    onToolChange,
    tools: hostTools,
    plugins,
    decorateAnnotation,
    fonts,
    signatures: signatureStore,
    signatureFonts,
    page = $bindable(),
    onPageChange,
    zoom = $bindable(),
    onZoomChange,
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

  const signatures = $derived(
    createSignatureLibrary(signatureStore ?? createMemorySignatureStore())
  )
  $effect(() => {
    void signatures.refresh()
  })
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
  $effect(() => {
    void sourceIdentity
    const pw = sourcePassword
    let cancelled = false
    let opened: InkDocument | null = null
    /** The snapshot history's hold on a controlled document's store. */
    let detach: () => void = noop
    let stopFormErrors: () => void = noop
    untrack(() => snapshotHistory.clear())
    const source = untrack(() => src)
    if (source === null) {
      override = null
      return
    }
    override = { state: 'loading' }
    void (async () => {
      try {
        const doc = await openDocument(
          source,
          untrack(() => ({
            assets,
            password: pw,
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
        )
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
          if (s.state === 'ready') onReady?.(doc)
          else if (s.state === 'error') onError?.(s.error)
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
        override = { state: 'error', error }
        onError?.(error)
      }
    })()
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
  function reportPage(p: number): void {
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
        tool: currentTool,
      })
    )
  })
  $effect(() => {
    const id = currentTool
    styleTracker?.setTool(id)
  })

  const context: InkContext = {
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
    get tools() {
      return tools
    },
    get tool() {
      return currentTool
    },
    setTool,
    get hostTools() {
      return hostTools
    },
    get decorateAnnotation() {
      return decorateAnnotation
    },
    get fonts() {
      return fonts ?? FONT_FAMILIES
    },
    toolOptions,
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
      return page
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
    reportFormAction: (a) => onformaction?.(a),
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
    props: { ...rest, 'data-ink-root': '', 'data-state': status.state, ...attachRoot },
  })}
{:else}
  <div bind:this={ref} {...rest} data-ink-root="" data-state={status.state}>
    {@render children?.({ status, document })}
  </div>
{/if}
