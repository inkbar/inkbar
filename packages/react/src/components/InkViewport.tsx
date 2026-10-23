/*
 * The scroll element is handed to core's `mountViewer`, which builds the viewport, the page
 * layers, the tool controller and the keyboard shortcuts in it; React never renders children
 * into it. The engine reports each page host it mounts, and InkPage components rendered here
 * portal the page-error and custom-annotation slots into them.
 *
 * Two-way zoom and page: the viewport's own changes are reported through the context, and
 * the host's props are applied only when they differ from the viewport's state, so the echo
 * of a reported value does nothing.
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
import { useLatest } from '../use-latest'

import { InkPage } from './InkPage'

import type { InkError } from '@inkbar/core'
import type {
  AnnotationSlotProps,
  LayoutMode,
  PageMount,
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
  loading?: ReactNode
  empty?: ReactNode
  error?: ReactNode | ((props: { error: InkError }) => ReactNode)
  renderAnnotation?: ((props: AnnotationSlotProps) => ReactNode) | undefined
  /** Shown inside a page that failed to render. The rest of the document stays usable. */
  renderPageError?: ((props: { error: InkError; page: number }) => ReactNode) | undefined
}

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

export function InkViewport({
  mode = 'continuous',
  rotation = 0,
  gap = 16,
  buffer = 2,
  loading,
  empty,
  error,
  renderAnnotation,
  renderPageError,
  className,
  ...rest
}: InkViewportProps) {
  const ctx = useInkContext('InkViewport')
  const scroll = useRef<HTMLDivElement>(null)
  const custom = !!renderAnnotation
  const latest = useLatest({ ctx, mode, rotation, gap, buffer, custom })

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
  const builtWith = useRef<{ gap: number; buffer: number; custom: boolean } | null>(null)
  /** The zoom and page last reported to the host. */
  const lastReportedZoom = useRef<ZoomValue | undefined>(undefined)
  const lastReportedPage = useRef<number | undefined>(undefined)

  // Build for a new document or status; tear down on the next change and on unmount.
  useEffect(() => {
    const { ctx: c, mode: m, rotation: r, gap: g, buffer: b, custom: cu } = latest.current
    const doc = c.document
    const el = scroll.current
    lastReportedZoom.current = undefined
    lastReportedPage.current = undefined
    if (!doc || !el || c.status.state !== 'ready') return
    let first = true
    let stops: (() => void)[] = []
    buildCount.current += 1
    builtWith.current = { gap: g, buffer: b, custom: cu }
    const e = mountViewer({
      container: el,
      document: doc,
      zoom: c.zoomModel ?? 'fit-width',
      ...(c.pageModel === undefined ? {} : { page: c.pageModel }),
      mode: m,
      rotation: r,
      gap: g,
      buffer: b,
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
      // Read through, so a new `signatures` store reaches the tool as well as the menus.
      signatureLibrary: () => latest.current.ctx.signatures,
      customAnnotations: cu,
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
    return () => {
      for (const stop of stops) stop()
      e.destroy()
      engine.current = null
      builtWith.current = null
      c.setViewport(null, null)
      setPages((prev) => (prev.length === 0 ? prev : []))
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
    if (built.gap === gap && built.buffer === buffer && built.custom === custom) return
    buildCount.current += 1
    builtWith.current = { gap, buffer, custom }
    engine.current.rebuild({ gap, buffer, customAnnotations: custom })
  }, [gap, buffer, custom])

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
          {loading === undefined ? 'Loading document…' : loading}
        </div>
      ) : err ? (
        <div className="ink-status ink-error" role="alert">
          {typeof error === 'function' ? (
            error({ error: err })
          ) : error !== undefined ? (
            error
          ) : (
            <>
              <p className="ink-error-title">This document could not be opened.</p>
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
      ) : state === 'idle' ? (
        <div className="ink-status ink-empty">{empty}</div>
      ) : null}
      <div
        ref={scroll}
        className="ink-scroll"
        data-ink-scroll=""
        tabIndex={0}
        role="document"
        aria-label="Document"
      />
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
    </div>
  )
}
