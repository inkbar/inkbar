/*
 * The scroll element is handed to core's `createViewport` and `createToolController`; React
 * never renders children into it. Pages are InkPage components rendered here (they render
 * nothing in place) that mount core's page layers into the hosts the viewport creates.
 * Keyboard shortcuts are core's `attachViewportKeys` on the scroll element.
 *
 * Two-way zoom and page: the viewport's own changes are reported through the context, and
 * the host's props are applied only when they differ from the viewport's state, so the echo
 * of a reported value does nothing.
 */
import {
  attachViewportKeys,
  createToolController,
  createViewport,
  getSelectionQuads,
} from '@inkbar/core/dom'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { useLatest } from '../use-latest'

import { InkPage } from './InkPage'

import type { InkDocument, InkError } from '@inkbar/core'
import type {
  AnnotationSlotProps,
  LayoutMode,
  PageTransform,
  ToolController,
  ViewRotation,
  Viewport,
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
  /** The viewport build the host belongs to; part of the InkPage key. */
  build: number
  page: number
  host: HTMLElement
  transform: PageTransform
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
  const [pages, setPages] = useState<MountedPage[]>([])
  const latest = useLatest({ ctx, mode, rotation, gap, buffer })

  const viewport = useRef<Viewport | null>(null)
  const tools = useRef<ToolController | null>(null)
  /**
   * Bumped on every build. A rebuild gives each page a new host element, and InkPage mounts
   * into its host only once, so pages from an earlier build must remount, not be reused.
   */
  const build = useRef(0)
  const stops = useRef<(() => void)[]>([])
  /** The document the viewport was built for, and the zoom and page last reported to the host. */
  const builtFor = useRef<InkDocument | null>(null)
  const lastReportedZoom = useRef<ZoomValue | undefined>(undefined)
  const lastReportedPage = useRef<number | undefined>(undefined)

  const teardown = useCallback(() => {
    for (const stop of stops.current) stop()
    stops.current = []
    tools.current?.destroy()
    viewport.current?.destroy()
    tools.current = null
    viewport.current = null
    latest.current.ctx.setViewport(null, null)
    setPages((prev) => (prev.length === 0 ? prev : []))
  }, [latest])

  const setup = useCallback(() => {
    const { ctx: c, mode: m, rotation: r, gap: g, buffer: b } = latest.current
    // Rebuilding for the same document (a gap or buffer change) keeps where the reader was.
    const carry =
      viewport.current && builtFor.current === c.document
        ? { zoom: viewport.current.zoom.get(), page: viewport.current.currentPage.get() }
        : null
    teardown()
    const doc = c.document
    const el = scroll.current
    if (!carry) {
      builtFor.current = null
      lastReportedZoom.current = undefined
      lastReportedPage.current = undefined
    }
    if (!doc || !el || c.status.state !== 'ready') return
    const current = ++build.current
    const vp = createViewport({
      container: el,
      document: doc,
      zoom: carry?.zoom ?? c.zoomModel ?? 'fit-width',
      mode: m,
      rotation: r,
      gap: g,
      buffer: b,
      onMount: (page, host, transform) => {
        setPages((prev) => [...prev, { build: current, page, host, transform }])
      },
      onUpdate: (page, host, transform) => {
        setPages((prev) =>
          prev.map((p) =>
            p.page === page ? { build: current, page, host, transform } : p
          )
        )
      },
      onUnmount: (page) => {
        setPages((prev) => prev.filter((p) => p.page !== page))
      },
    })
    const tc = createToolController({
      initial: c.tool,
      ctx: {
        store: doc.annotations,
        viewport: vp,
        root: el,
        selectionQuads: () =>
          getSelectionQuads(el, (host) => {
            const page = Number(host.dataset.page)
            return { page, transform: vp.transformFor(page) }
          }),
        clearSelection: () =>
          el.ownerDocument.defaultView?.getSelection()?.removeAllRanges(),
        onActivate: (id) => latest.current.ctx.setActivated(id),
      },
    })
    viewport.current = vp
    tools.current = tc
    c.setViewport(vp, tc)
    // Every successful build records its document, so each later rebuild carries state too.
    builtFor.current = doc
    if (!carry) {
      // A new document starts from where the viewport opens; only later changes are reported.
      lastReportedZoom.current = vp.zoom.get()
      lastReportedPage.current = vp.currentPage.get()
    }
    const page = carry?.page ?? c.pageModel
    if (page !== undefined && page !== vp.currentPage.get()) vp.scrollToPage(page)
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
    stops.current = [
      attachViewportKeys(el, { viewport: vp, pageCount: () => doc.pages.length }),
      vp.zoom.subscribe(reportZoom),
      vp.currentPage.subscribe(reportPage),
    ]
    // Whatever the restore changed is reported once; nothing is when it matched.
    reportZoom(vp.zoom.get())
    reportPage(vp.currentPage.get())
  }, [latest, teardown])

  // Build for a new document or status; rebuild when the construction options change.
  useEffect(() => {
    setup()
  }, [ctx.document, ctx.status.state, gap, buffer, setup])
  useEffect(() => () => teardown(), [teardown])

  useEffect(() => {
    const vp = viewport.current
    const z = ctx.zoomModel
    if (vp && z !== undefined && z !== vp.zoom.get()) vp.setZoom(z)
  }, [ctx.zoomModel])
  useEffect(() => {
    const vp = viewport.current
    const p = ctx.pageModel
    if (!vp || p === undefined || p === lastReportedPage.current) return
    if (p !== vp.currentPage.get()) vp.scrollToPage(p)
  }, [ctx.pageModel])
  useEffect(() => {
    const tc = tools.current
    if (tc && tc.active.get() !== ctx.tool) tc.set(ctx.tool)
  }, [ctx.tool])
  // The build applied both; these only act on a later change, not on mount.
  useEffect(() => {
    const vp = viewport.current
    if (vp && vp.mode.get() !== mode) vp.setMode(mode)
  }, [mode])
  useEffect(() => {
    const vp = viewport.current
    if (vp && vp.rotation.get() !== rotation) vp.setRotation(rotation)
  }, [rotation])

  const state = ctx.status.state
  const err = ctx.status.state === 'error' ? ctx.status.error : null
  const custom = !!renderAnnotation

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
          key={`${p.build}:${p.page}:${custom}`}
          page={p.page}
          host={p.host}
          transform={p.transform}
          customAnnotations={custom}
          renderAnnotation={renderAnnotation}
          renderPageError={renderPageError}
        />
      ))}
    </div>
  )
}
