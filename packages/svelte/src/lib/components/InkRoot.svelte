<script module lang="ts">
  import type { ChildSnippet } from './child-snippet.js'
  import type {
    Annotation,
    AnnotationChange,
    AnnotationDefaults,
    DocumentSource,
    InkDocument,
    InkError,
    InkStatus,
    PdfAssets,
  } from '@inkbar/core'
  import type { Tool, ToolId, ZoomValue } from '@inkbar/core/dom'
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
    tool?: ToolId | undefined
    onToolChange?: ((tool: ToolId) => void) | undefined
    /**
     * Host tools, added to the built-ins; one with a built-in's id replaces it. Read when a
     * document opens.
     */
    tools?: Tool[] | undefined
    /**
     * The font families text boxes offer, replacing the PDF standard families
     * (`FONT_FAMILIES`). Fonts beyond those are the PDF writer's to embed.
     */
    fonts?: string[] | undefined
    page?: number | undefined
    onPageChange?: ((page: number) => void) | undefined
    zoom?: ZoomValue | undefined
    onZoomChange?: ((zoom: ZoomValue) => void) | undefined
    /** Undo history. Defaults to on for uncontrolled, off for controlled. */
    history?: boolean | undefined
    onReady?: ((doc: InkDocument) => void) | undefined
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
    createSnapshotHistory,
    InkError as InkErrorClass,
    openDocument,
  } from '@inkbar/core'
  import { cssVariableDefaults, FONT_FAMILIES, trackToolStyle } from '@inkbar/core/dom'
  import { DEV } from 'esm-env'
  import { untrack } from 'svelte'
  import { createAttachmentKey } from 'svelte/attachments'

  import { setInkContext, type InkContext, type InkHistory } from '../context.js'
  import { useReadable } from '../use-readable.svelte.js'

  import type { ToolController, Viewport } from '@inkbar/core/dom'

  let {
    src,
    assets,
    password,
    defaults,
    annotations = $bindable(),
    onAnnotationsChange,
    onChange,
    tool = $bindable(),
    onToolChange,
    tools: hostTools,
    fonts,
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

  const IDLE: InkStatus = { state: 'idle' }
  const NO_ANNOTATIONS: readonly Annotation[] = []
  const NO_IDS: readonly string[] = []

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
        document = doc
        override = null
        setTestHook(ref, doc)
        const s = doc.status.get()
        if (s.state === 'ready') onReady?.(doc)
        else if (s.state === 'error') onError?.(s.error)
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
      opened?.destroy()
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

  function setTool(id: ToolId): void {
    tool = id
    onToolChange?.(id)
  }
  function setActivated(id: string | null): void {
    activated = id
    activatedNow = id
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
  }

  /** The document's tool style; it batches through `inkHistory`, whichever mode is on. */
  const styleTracker = $derived.by(() => {
    const doc = document
    if (!doc) return null
    return untrack(() =>
      trackToolStyle({
        store: doc.annotations,
        history: { batch: (fn) => inkHistory.batch(fn) },
        tools: hostTools,
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
    get fonts() {
      return fonts ?? FONT_FAMILIES
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
