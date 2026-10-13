import { createSnapshotHistory, InkError, openDocument } from '@inkbar/core'
import { cssVariableDefaults } from '@inkbar/core/dom'
import { Slot } from 'radix-ui'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type Ref,
} from 'react'
import { flushSync } from 'react-dom'

import {
  InkContextObject,
  type InkContext,
  type InkHistory,
  type InkStatus,
} from '../context'
import { useLatest } from '../use-latest'
import { useReadable } from '../use-readable'

import type {
  Annotation,
  AnnotationChange,
  AnnotationDefaults,
  DocumentSource,
  InkDocument,
  PdfAssets,
} from '@inkbar/core'
import type { ToolController, ToolId, Viewport, ZoomValue } from '@inkbar/core/dom'

export interface InkRootHandle {
  readonly document: InkDocument | null
  readonly status: InkStatus
  readonly rootEl: HTMLElement | null
  /** What `useHistory()` returns inside the root. A controlled host calls `clear()` after loading its saved list. */
  readonly history: InkHistory
}

export interface InkRootProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'children' | 'onChange' | 'onError'
> {
  src: DocumentSource | null
  assets: PdfAssets
  password?: string | undefined
  /** Colour defaults. Without it, the theme's CSS variables on the root element apply. */
  defaults?: AnnotationDefaults | undefined
  /**
   * Pass (with `onAnnotationsChange`) to put annotations under the host's control. The mode
   * is fixed when a document opens: passing or dropping this prop later takes effect on the
   * next open.
   */
  annotations?: Annotation[] | undefined
  onAnnotationsChange?: ((next: Annotation[]) => void) | undefined
  onChange?: ((change: AnnotationChange) => void) | undefined
  tool?: ToolId | undefined
  onToolChange?: ((tool: ToolId) => void) | undefined
  page?: number | undefined
  onPageChange?: ((page: number) => void) | undefined
  zoom?: ZoomValue | undefined
  onZoomChange?: ((zoom: ZoomValue) => void) | undefined
  /** Undo history. Defaults to on for uncontrolled, off for controlled. */
  history?: boolean | undefined
  asChild?: boolean | undefined
  onReady?: ((doc: InkDocument) => void) | undefined
  onError?: ((error: InkError) => void) | undefined
  onActivate?: ((id: string) => void) | undefined
  children?:
    | ReactNode
    | ((props: { status: InkStatus; document: InkDocument | null }) => ReactNode)
  ref?: Ref<InkRootHandle>
}

type TestHookElement = HTMLElement & { __inkDocument?: InkDocument | undefined }

const IDLE: InkStatus = { state: 'idle' }
const NO_ANNOTATIONS: readonly Annotation[] = []
const NO_IDS: readonly string[] = []

/** Signed URLs change; the key does not. Bytes and Blobs are their own identity. */
function identity(src: DocumentSource | null): unknown {
  if (src === null) return null
  if (typeof src === 'string') return src
  if ('key' in src) return src.key
  return src
}

function isDevelopment(): boolean {
  // Bundlers replace the expression with a literal; raw browser ESM has no `process`.
  try {
    return process.env.NODE_ENV !== 'production'
  } catch {
    return false
  }
}

function setTestHook(el: HTMLElement | null, doc: InkDocument | undefined): void {
  if (el && isDevelopment()) (el as TestHookElement).__inkDocument = doc
}

export function InkRoot({
  src,
  assets,
  password,
  defaults,
  annotations,
  onAnnotationsChange,
  onChange,
  tool,
  onToolChange,
  page,
  onPageChange,
  zoom,
  onZoomChange,
  history,
  asChild = false,
  onReady,
  onError,
  onActivate,
  children,
  ref,
  ...rest
}: InkRootProps) {
  const rootElRef = useRef<HTMLElement | null>(null)
  const [rootEl, setRootElState] = useState<HTMLElement | null>(null)
  const setRootEl = useCallback((el: HTMLElement | null) => {
    rootElRef.current = el
    setRootElState(el)
  }, [])

  const documentRef = useRef<InkDocument | null>(null)
  const [document, setDocument] = useState<InkDocument | null>(null)
  /** Overrides the document's status while opening, and when opening itself failed. */
  const [override, setOverride] = useState<InkStatus | null>(null)
  const [internalTool, setInternalTool] = useState<ToolId>(tool ?? 'view')
  const [activated, setActivatedState] = useState<string | null>(null)
  const [viewport, setViewportState] = useState<Viewport | null>(null)
  const [tools, setToolsState] = useState<ToolController | null>(null)

  const documentStatus = useReadable<InkStatus>(document?.status, IDLE)
  const status = override ?? documentStatus
  const annotationList = useReadable(document?.annotations.list, NO_ANNOTATIONS)
  const selection = useReadable(document?.annotations.selection, NO_IDS)

  // What the next open will do follows the prop; the open document's mode is fixed.
  const controlledProp = annotations !== undefined
  const controlled = document
    ? document.annotations.mode === 'controlled'
    : controlledProp
  const historyEnabled = controlled && history === true
  // Callbacks and options read later than the render that passed them.
  const latest = useLatest({
    src,
    assets,
    defaults,
    annotations,
    controlled: controlledProp,
    history,
    historyEnabled,
    onAnnotationsChange,
    onChange,
    onReady,
    onError,
    onActivate,
    onToolChange,
    onPageChange,
    onZoomChange,
  })

  const snapshotHistory = useMemo(
    () =>
      createSnapshotHistory({
        apply: (list) => documentRef.current?.annotations.replaceAll(list, 'history'),
        enabled: () => latest.current.historyEnabled,
      }),
    [latest]
  )
  useEffect(() => {
    snapshotHistory.observe(annotations)
  }, [annotations, snapshotHistory])

  const srcIdentity = identity(src)
  useEffect(() => {
    let cancelled = false
    snapshotHistory.clear()
    const source = latest.current.src
    if (source === null) {
      setOverride(null)
      return
    }
    setOverride({ state: 'loading' })
    let opened: InkDocument | null = null
    const run = async () => {
      try {
        const doc = await openDocument(source, {
          assets: latest.current.assets,
          password,
          defaults:
            latest.current.defaults ??
            (rootElRef.current ? cssVariableDefaults(rootElRef.current) : undefined),
          history: latest.current.history ?? !latest.current.controlled,
          annotations: latest.current.controlled
            ? {
                mode: 'controlled',
                initial: latest.current.annotations ?? [],
                onChange: (next, change) => {
                  // Apply the host's state update, its render and the layout effect that pushes
                  // the list back before core's development check expires. The microtask
                  // leaves React's render, commit and passive-effect contexts, where a host
                  // may call the store, so `flushSync` is always legal; the host sees the
                  // proposal one microtask after the store returned. A proposal made in the
                  // tick this root unmounts or reopens never reaches the host.
                  queueMicrotask(() => {
                    if (cancelled) return
                    flushSync(() => {
                      latest.current.onAnnotationsChange?.(next)
                      latest.current.onChange?.(change)
                    })
                  })
                },
              }
            : { mode: 'uncontrolled' },
        })
        if (cancelled) {
          doc.destroy()
          return
        }
        opened = doc
        // The prop may have changed while the file loaded, when there was no store to apply it to.
        const current = latest.current.annotations
        if (doc.annotations.mode === 'controlled' && current !== undefined)
          doc.annotations.setControlledValue(current)
        documentRef.current = doc
        setDocument(doc)
        setOverride(null)
        setTestHook(rootElRef.current, doc)
        const s = doc.status.get()
        if (s.state === 'ready') latest.current.onReady?.(doc)
        else if (s.state === 'error') latest.current.onError?.(s.error)
      } catch (cause) {
        if (cancelled) return
        const error =
          cause instanceof InkError
            ? cause
            : new InkError(
                'InvalidPdf',
                cause instanceof Error ? cause.message : String(cause),
                {},
                cause
              )
        setOverride({ state: 'error', error })
        latest.current.onError?.(error)
      }
    }
    // StrictMode's simulated cleanup runs synchronously in the same commit, so deferring one
    // microtask means the discarded first attempt never starts a fetch.
    void Promise.resolve().then(() => {
      if (!cancelled) return run()
    })
    return () => {
      cancelled = true
      opened?.destroy()
      documentRef.current = null
      setDocument(null)
      setTestHook(rootElRef.current, undefined)
    }
    // `srcIdentity` stands in for `src`: a new URL with the same key is the same document.
  }, [srcIdentity, password, snapshotHistory, latest])

  useLayoutEffect(() => {
    if (annotations && document?.annotations.mode === 'controlled')
      document.annotations.setControlledValue(annotations)
  }, [annotations, document])

  useEffect(() => {
    if (tool) setInternalTool(tool)
  }, [tool])

  const setTool = useCallback(
    (id: ToolId) => {
      setInternalTool(id)
      latest.current.onToolChange?.(id)
    },
    [latest]
  )
  const setActivated = useCallback(
    (id: string | null) => {
      setActivatedState(id)
      if (id) latest.current.onActivate?.(id)
    },
    [latest]
  )
  const reportZoom = useCallback(
    (z: ZoomValue) => latest.current.onZoomChange?.(z),
    [latest]
  )
  const reportPage = useCallback(
    (p: number) => latest.current.onPageChange?.(p),
    [latest]
  )
  const setViewport = useCallback((vp: Viewport | null, tc: ToolController | null) => {
    setViewportState(vp)
    setToolsState(tc)
  }, [])

  const snapCanUndo = useReadable(snapshotHistory.canUndo, false)
  const snapCanRedo = useReadable(snapshotHistory.canRedo, false)
  const coreCanUndo = useReadable(document?.history.canUndo, false)
  const coreCanRedo = useReadable(document?.history.canRedo, false)
  const inkHistory = useMemo<InkHistory>(
    () => ({
      canUndo: controlled ? historyEnabled && snapCanUndo : coreCanUndo,
      canRedo: controlled ? historyEnabled && snapCanRedo : coreCanRedo,
      undo: () =>
        controlled ? snapshotHistory.undo() : documentRef.current?.history.undo(),
      redo: () =>
        controlled ? snapshotHistory.redo() : documentRef.current?.history.redo(),
      clear: () =>
        controlled ? snapshotHistory.clear() : documentRef.current?.history.clear(),
    }),
    [
      controlled,
      historyEnabled,
      snapCanUndo,
      snapCanRedo,
      coreCanUndo,
      coreCanRedo,
      snapshotHistory,
    ]
  )

  useImperativeHandle(ref, () => ({ document, status, rootEl, history: inkHistory }), [
    document,
    status,
    rootEl,
    inkHistory,
  ])

  const ctx = useMemo<InkContext>(
    () => ({
      assets,
      document,
      status,
      annotations: annotationList,
      selection,
      viewport,
      tools,
      tool: internalTool,
      setTool,
      zoomModel: zoom,
      pageModel: page,
      reportZoom,
      reportPage,
      activated,
      setActivated,
      history: inkHistory,
      rootEl,
      setViewport,
    }),
    [
      assets,
      document,
      status,
      annotationList,
      selection,
      viewport,
      tools,
      internalTool,
      setTool,
      zoom,
      page,
      reportZoom,
      reportPage,
      activated,
      setActivated,
      inkHistory,
      rootEl,
      setViewport,
    ]
  )

  const Comp = asChild ? Slot.Root : 'div'
  return (
    <InkContextObject.Provider value={ctx}>
      <Comp ref={setRootEl} data-ink-root="" data-state={status.state} {...rest}>
        {typeof children === 'function' ? children({ status, document }) : children}
      </Comp>
    </InkContextObject.Provider>
  )
}
