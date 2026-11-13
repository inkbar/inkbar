/*
 * The scroll element is handed to core's `mountViewer`, which builds the viewport, the page
 * layers, the tool controller and the keyboard shortcuts in it; React never renders children
 * into it. The engine reports each page host it mounts, and InkPage components rendered here
 * portal the page-error and custom-annotation slots into them.
 *
 * Two-way zoom and page: the viewport's own changes are reported through the context, and
 * the host's props are applied only when they differ from the viewport's state, so the echo
 * of a reported value does nothing.
 *
 * Form fields render in the engine's form layer. A signature field's "Sign" opens
 * `InkSignFieldPopover`, and a form script's alert shows in `InkFormAlert`; both are mounted
 * here, so hosts compose nothing for them.
 */
import { mountViewer } from '@inkbar/core/dom'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { toolIdsOf } from '../hooks/useRegisteredTool'
import { useMessageStore } from '../message-store'
import { useLatest } from '../use-latest'
import { useReadable } from '../use-readable'

import { InkFormAlert } from './InkFormAlert'
import { InkPage } from './InkPage'
import { InkPasswordDialog } from './InkPasswordDialog'
import { InkSignFieldPopover } from './InkSignFieldPopover'

import type { InkDocument, InkError } from '@inkbar/core'
import type {
  AnnotationSlotProps,
  PasswordPromptState,
  LayoutMode,
  PageMount,
  SignFieldRequest,
  ToolId,
  ViewerEngine,
  ViewRotation,
  ZoomValue,
} from '@inkbar/core/dom'

export interface InkViewportProps extends ComponentPropsWithoutRef<'div'> {
  mode?: LayoutMode
  rotation?: ViewRotation
  /** Gap between pages, CSS px. */
  gap?: number
  /** Pages kept mounted either side of the visible ones. */
  buffer?: number
  /** Pinch to zoom the pages. Off leaves the browser's own touch handling alone. */
  pinchZoom?: boolean
  loading?: ReactNode
  empty?: ReactNode
  error?: ReactNode | ((props: { error: InkError }) => ReactNode)
  /**
   * Replaces the panel shown for a locked file while its dialog is closed. `promptPassword`
   * opens the dialog.
   */
  locked?:
    ReactNode | ((props: { incorrect: boolean; promptPassword: () => void }) => ReactNode)
  renderAnnotation?: ((props: AnnotationSlotProps) => ReactNode) | undefined
  /** Shown inside a page that failed to render. The rest of the document stays usable. */
  renderPageError?: ((props: { error: InkError; page: number }) => ReactNode) | undefined
}

const IDLE_PROMPT: PasswordPromptState = { asking: false, pending: false }
/** The controls a host's own locked panel may hold, for focus after Cancel. */
const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

interface MountedPage {
  /** The engine build the host belongs to; part of the InkPage key. */
  build: number
  page: number
  host: HTMLElement
  mount: PageMount
  error: InkError | null
  /** Whether the build that mounted the page renders the annotation slot. */
  custom: boolean
}

/** A key per document, so the field menu and its dialog start afresh for each one. */
const documentKeys = new WeakMap<InkDocument, number>()
let documentKeyCount = 0
function documentKey(doc: InkDocument | null): number {
  if (!doc) return 0
  let key = documentKeys.get(doc)
  if (key === undefined) {
    key = ++documentKeyCount
    documentKeys.set(doc, key)
  }
  return key
}

export function InkViewport({
  mode = 'continuous',
  rotation = 0,
  gap = 16,
  buffer = 2,
  pinchZoom = true,
  loading,
  empty,
  error,
  locked,
  renderAnnotation,
  renderPageError,
  className,
  ...rest
}: InkViewportProps) {
  const ctx = useInkContext('InkViewport')
  const m = ctx.messages
  const messageStore = useMessageStore()
  const scroll = useRef<HTMLDivElement>(null)
  const custom = !!renderAnnotation
  const latest = useLatest({
    ctx,
    messageStore,
    mode,
    rotation,
    gap,
    buffer,
    pinchZoom,
    custom,
  })

  const engine = useRef<ViewerEngine | null>(null)
  /** Page hosts, mounts and errors the engine reported; InkPage renders portals for them. */
  const [pages, setPages] = useState<MountedPage[]>([])
  /**
   * Numbered before each build starts, so the pages a build mounts carry its own number. A
   * rebuild gives each page a new host and mount, so pages from an earlier build must remount,
   * not be reused.
   */
  const buildCount = useRef(0)
  /** The construction options the engine was last built with, so a rebuild runs only on a change. */
  const builtWith = useRef<{
    gap: number
    buffer: number
    pinchZoom: boolean
    custom: boolean
  } | null>(null)
  /** The zoom and page last reported to the host. */
  const lastReportedZoom = useRef<ZoomValue | undefined>(undefined)
  const lastReportedPage = useRef<number | undefined>(undefined)
  /** The signature field whose menu is open. */
  const [signRequest, setSignRequest] = useState<SignFieldRequest | null>(null)
  /** The form script's message on show, and how many have been shown. */
  const [alert, setAlert] = useState<{ message: string; shown: number } | null>(null)

  // Build for a new document or status; tear down on the next change and on unmount.
  useEffect(() => {
    const {
      ctx: c,
      mode: m,
      rotation: r,
      gap: g,
      buffer: b,
      pinchZoom: pz,
      custom: cu,
      messageStore: words,
    } = latest.current
    const doc = c.document
    const el = scroll.current
    lastReportedZoom.current = undefined
    lastReportedPage.current = undefined
    if (!doc || !el || c.status.state !== 'ready') return
    let first = true
    let stops: (() => void)[] = []
    buildCount.current += 1
    builtWith.current = { gap: g, buffer: b, pinchZoom: pz, custom: cu }
    // The tools this viewer registers, from the same inputs; a later `tools` waits for a rebuild.
    c.setOpenedToolIds(toolIdsOf(c.hostTools, c.pluginHost))
    const e = mountViewer({
      container: el,
      document: doc,
      zoom: c.zoomModel ?? 'fit-width',
      ...(c.pageModel === undefined ? {} : { page: c.pageModel }),
      mode: m,
      rotation: r,
      gap: g,
      buffer: b,
      pinchZoom: pz,
      tool: c.tool,
      ...(c.hostTools ? { tools: c.hostTools } : {}),
      // The engine adds the plugins' tools and layers, and decorates through the host, which
      // reads `decorateAnnotation` first.
      ...(c.pluginHost ? { plugins: c.pluginHost } : {}),
      // The highlights draw from the shared search.
      ...(c.search ? { search: c.search } : {}),
      // Reads InkRoot's current prop; the effect below re-applies it when it changes.
      decorateAnnotation: (a) => latest.current.ctx.decorateAnnotation(a),
      ...(c.toolStyle ? { toolStyle: c.toolStyle } : {}),
      toolHistory: { batch: (fn) => latest.current.ctx.history.batch(fn) },
      toolOptions: c.toolOptions,
      fonts: [...c.fonts],
      signatureLibrary: () => latest.current.ctx.signatures,
      customAnnotations: cu,
      // The root's message state, shared: a new `messages` or `locale` relabels in place.
      _messageState: words,
      ...(c.formHighlight === undefined ? {} : { formHighlight: c.formHighlight }),
      // The field's own button again, while its menu is open, closes the menu.
      onSignField: (req) =>
        setSignRequest((open) => (open?.widget === req.widget ? null : req)),
      onAction: (a) => latest.current.ctx.reportAction(a),
      onFormAlert: (message) =>
        setAlert((prev) => ({ message, shown: (prev?.shown ?? 0) + 1 })),
      onActivate: (id) => latest.current.ctx.setActivated(id),
      onBuild: (vp, tc) => {
        latest.current.ctx.setViewport(vp, tc)
        if (first) {
          // A new document starts from where the viewport opens (its zoom, on the first page);
          // only later changes are reported, the restored page among them.
          first = false
          lastReportedZoom.current = vp.zoom.get()
          lastReportedPage.current = 0
        }
        for (const stop of stops) stop()
        const reportZoom = (z: ZoomValue): void => {
          if (z === lastReportedZoom.current) return
          lastReportedZoom.current = z
          latest.current.ctx.reportZoom(z)
        }
        const reportPage = (p: number): void => {
          if (p === lastReportedPage.current) return
          lastReportedPage.current = p
          latest.current.ctx.reportPage(p)
        }
        // A tool that switches itself (a one-shot tool once used) is reported as a pick.
        const followTool = (id: ToolId): void => {
          if (id !== latest.current.ctx.tool) latest.current.ctx.setTool(id)
        }
        stops = [
          vp.zoom.subscribe(reportZoom),
          vp.currentPage.subscribe(reportPage),
          tc.active.subscribe(followTool),
        ]
        // Whatever the build restored is reported once; nothing is when it matched.
        reportZoom(vp.zoom.get())
        reportPage(vp.currentPage.get())
      },
      onPageMount: (page, mount, host) => {
        // `buildCount` and `builtWith` belong to the build in progress: both are set before it starts.
        const build = buildCount.current
        const custom = builtWith.current?.custom ?? false
        setPages((prev) => [...prev, { build, page, host, mount, error: null, custom }])
      },
      onPageUnmount: (page) => setPages((prev) => prev.filter((p) => p.page !== page)),
      onPageError: (page, err) =>
        setPages((prev) => prev.map((p) => (p.page === page ? { ...p, error: err } : p))),
    })
    engine.current = e
    // The engine exists from here; its navigation lasts for its life, across rebuilds.
    c.setNavigation(e.navigation)
    return () => {
      for (const stop of stops) stop()
      e.destroy()
      engine.current = null
      builtWith.current = null
      c.setViewport(null, null)
      c.setNavigation(null)
      c.setOpenedToolIds(null)
      setPages((prev) => (prev.length === 0 ? prev : []))
      // Their fields and the document they came from are gone.
      setSignRequest(null)
      setAlert(null)
    }
  }, [ctx.document, ctx.status.state, ctx.pluginHost, ctx.search, latest])

  // The plugins' `root`. A layout effect, so it is set before the build above runs.
  const { viewportEl } = ctx
  useLayoutEffect(() => {
    const el = scroll.current
    viewportEl.set(el)
    return () => {
      if (viewportEl.get() === el) viewportEl.set(null)
    }
  }, [viewportEl])

  // A new decorateAnnotation re-applies to the mounted annotation elements at once.
  const { onDecorateAnnotationChange } = ctx
  useEffect(
    () => onDecorateAnnotationChange(() => engine.current?.redecorate()),
    [onDecorateAnnotationChange]
  )

  // Construction-only options rebuild the engine for the same document, keeping zoom and page.
  useEffect(() => {
    const built = builtWith.current
    if (!engine.current || !built) return
    if (
      built.gap === gap &&
      built.buffer === buffer &&
      built.pinchZoom === pinchZoom &&
      built.custom === custom
    )
      return
    buildCount.current += 1
    builtWith.current = { gap, buffer, pinchZoom, custom }
    engine.current.rebuild({ gap, buffer, pinchZoom, customAnnotations: custom })
  }, [gap, buffer, pinchZoom, custom])

  useEffect(() => {
    const vp = engine.current?.viewport
    const z = ctx.zoomModel
    if (vp && z !== undefined && z !== vp.zoom.get()) vp.setZoom(z)
  }, [ctx.zoomModel])
  useEffect(() => {
    const vp = engine.current?.viewport
    const p = ctx.pageModel
    if (!vp || p === undefined || p === lastReportedPage.current) return
    if (p !== vp.currentPage.get()) vp.scrollToPage(p)
  }, [ctx.pageModel])
  useEffect(() => {
    const tc = engine.current?.tools
    if (tc && tc.active.get() !== ctx.tool) tc.set(ctx.tool)
  }, [ctx.tool])
  // The tint follows `formHighlight` in place, without a new document.
  useEffect(() => {
    engine.current?.setFormHighlight(ctx.formHighlight ?? true)
  }, [ctx.formHighlight])
  // The build applied both; these only act on a later change, not on mount.
  useEffect(() => {
    const vp = engine.current?.viewport
    if (vp && vp.mode.get() !== mode) vp.setMode(mode)
  }, [mode])
  useEffect(() => {
    const vp = engine.current?.viewport
    if (vp && vp.rotation.get() !== rotation) vp.setRotation(rotation)
  }, [rotation])

  const state = ctx.status.state
  const prompt = ctx.passwordPrompt
  const promptState = useReadable(prompt?.state, IDLE_PROMPT)
  /** Whether the last locked result was a wrong password; kept while a retry loads. */
  const lockedIncorrect = ctx.status.state === 'locked' ? ctx.status.incorrect : null
  const [incorrect, setIncorrect] = useState(lockedIncorrect ?? false)
  if (lockedIncorrect !== null && lockedIncorrect !== incorrect)
    setIncorrect(lockedIncorrect)

  const unlock = useRef<HTMLButtonElement>(null)
  const lockedPanel = useRef<HTMLDivElement>(null)
  /** The reader cancelled: focus goes to the locked panel once it is there. */
  const focusUnlock = useRef(false)
  /** The reader submitted a password: when it opens the document, focus must not be lost. */
  const unlocking = useRef(false)
  const stateRef = useLatest(state)

  function cancelPrompt(): void {
    prompt?.cancel()
    unlocking.current = false
    focusUnlock.current = true
  }

  /**
   * Focuses the locked panel: its unlock button, else the first control of a host's own panel,
   * else the document. False while the panel is not showing.
   */
  function focusLocked(): boolean {
    const panel = lockedPanel.current
    if (!panel) return false
    const target =
      unlock.current ?? panel.querySelector<HTMLElement>(FOCUSABLE) ?? scroll.current
    target?.focus({ preventScroll: true })
    return target !== null
  }

  /** The dialog has closed: focus goes to the locked panel, or waits for it (see `focusUnlock`). */
  function onCloseAutoFocus(e: Event): void {
    if (focusUnlock.current && focusLocked()) {
      focusUnlock.current = false
      e.preventDefault()
    } else if (unlocking.current && stateRef.current === 'ready') {
      // The reader opened the document from the dialog: it takes the focus the dialog held.
      unlocking.current = false
      scroll.current?.focus({ preventScroll: true })
      e.preventDefault()
    }
  }

  function submitPassword(password: string): void {
    unlocking.current = true
    prompt?.submit(password)
  }

  useEffect(() => {
    if (state === 'locked') {
      // A wrong try leaves the dialog open and the document shut: nothing to move focus to.
      unlocking.current = false
      if (focusUnlock.current && !promptState.asking && focusLocked())
        focusUnlock.current = false
    } else if (state !== 'loading') {
      // Ready, an error or no source: whatever focus was waiting for is moot.
      focusUnlock.current = false
      if (state !== 'ready') unlocking.current = false
    }
  }, [state, promptState.asking])
  // A new source: the prompt resets while the file loads, so no try is waiting on it.
  useEffect(() => {
    if (!promptState.pending && state === 'loading') unlocking.current = false
  }, [promptState.pending, state])
  // The dialog is open again (the reader asked, or a new locked file): nothing waits to focus.
  useEffect(() => {
    if (promptState.asking) focusUnlock.current = false
  }, [promptState.asking])

  const err = ctx.status.state === 'error' ? ctx.status.error : null

  return (
    <div
      {...rest}
      className={cx('ink-viewport-root', className)}
      data-ink-viewport-root=""
      data-state={state}
    >
      {state === 'loading' ? (
        <div className="ink-status" role="status" aria-live="polite">
          {loading === undefined ? m.viewer.loading : loading}
        </div>
      ) : err ? (
        <div className="ink-status ink-error" role="alert">
          {typeof error === 'function' ? (
            error({ error: err })
          ) : error !== undefined ? (
            error
          ) : (
            <>
              <p className="ink-error-title">{m.viewer.openFailed}</p>
              {/* The message comes from the PDF engine and is not written for readers: it stays
                  off the page, on the code's tooltip. */}
              <p>
                <code className="ink-error-code" title={err.message}>
                  {err.code}
                </code>
              </p>
            </>
          )}
        </div>
      ) : state === 'locked' ? (
        <div ref={lockedPanel} className="ink-status ink-locked" role="status">
          {typeof locked === 'function' ? (
            locked({ incorrect, promptPassword: () => prompt?.ask() })
          ) : locked !== undefined ? (
            locked
          ) : (
            <>
              <p className="ink-locked-title">{m.password.locked}</p>
              <button
                ref={unlock}
                type="button"
                className="ink-button"
                data-ink-unlock=""
                onClick={() => prompt?.ask()}
              >
                {m.password.unlock}
              </button>
            </>
          )}
        </div>
      ) : state === 'idle' ? (
        <div className="ink-status ink-empty">{empty}</div>
      ) : null}
      <div
        ref={scroll}
        className="ink-scroll"
        data-ink-scroll=""
        tabIndex={0}
        role="document"
        aria-label={m.viewer.document}
      />
      {prompt ? (
        <InkPasswordDialog
          open={promptState.asking}
          onOpenChange={(open) => {
            if (!open) cancelPrompt()
          }}
          incorrect={incorrect}
          pending={promptState.pending}
          onSubmit={submitPassword}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      ) : null}
      {pages.map((p) => (
        <InkPage
          key={`${p.build}:${p.page}`}
          page={p.page}
          host={p.host}
          mount={p.mount}
          error={p.error}
          customAnnotations={p.custom}
          renderAnnotation={renderAnnotation}
          renderPageError={renderPageError}
        />
      ))}
      <InkSignFieldPopover
        key={documentKey(ctx.document)}
        request={signRequest}
        onClose={() => setSignRequest(null)}
      />
      <InkFormAlert
        message={alert?.message ?? null}
        shown={alert?.shown ?? 0}
        fallback={() => scroll.current}
        onClose={() => setAlert(null)}
      />
    </div>
  )
}
