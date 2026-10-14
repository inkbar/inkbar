/*
 * The wiring every viewer needs: a viewport over the scroll element, page layers in each page
 * host it creates, page-error tracking, the tool controller and keyboard shortcuts. Framework
 * bindings and `createViewer` sit on top: they render their own chrome and get pages and
 * errors back through the callbacks.
 */
import { InkError, isInkError } from '../model/errors'

import { createPageMount, type PageLayer, type PageMount } from './page-mount'
import { getSelectionQuads } from './selection'
import { createToolController, type ToolController, type ToolId } from './tools'
import { createViewport, type Viewport, type ZoomValue } from './viewport'
import { attachViewportKeys } from './viewport-keys'

import type { LayoutMode } from './layout'
import type { PageTransform, ViewRotation } from './transform'
import type { InkDocument } from '../model/document'

export interface MountViewerOptions {
  container: HTMLElement
  document: InkDocument
  zoom?: ZoomValue
  page?: number
  mode?: LayoutMode
  rotation?: ViewRotation
  gap?: number
  buffer?: number
  tool?: ToolId
  /** Annotation content is rendered by the host (custom slots). Changing it needs `rebuild`. */
  customAnnotations?: boolean
  onActivate?(id: string): void
  /** After every (re)build: subscribe to the new viewport and controller here. */
  onBuild?(viewport: Viewport, tools: ToolController): void
  onPageMount?(page: number, mount: PageMount, host: HTMLElement): void
  onPageUnmount?(page: number): void
  /** `error` when a page's canvas or text layer fails; `null` once every failed layer recovers. */
  onPageError?(page: number, error: InkError | null): void
}

export interface ViewerEngine {
  readonly viewport: Viewport
  readonly tools: ToolController
  readonly pages: ReadonlyMap<number, PageMount>
  /** Recreates the viewport for construction-only options, keeping zoom, page, mode, rotation and tool. */
  rebuild(opts: { gap?: number; buffer?: number; customAnnotations?: boolean }): void
  destroy(): void
}

export function mountViewer(opts: MountViewerOptions): ViewerEngine

export function mountViewer(opts: MountViewerOptions): ViewerEngine {
  const { container: el, document: doc } = opts
  const pages = new Map<number, PageMount>()
  let gap = opts.gap
  let buffer = opts.buffer
  let custom = opts.customAnnotations ?? false
  let viewport: Viewport
  let tools: ToolController
  let stopKeys: () => void = () => undefined
  let destroyed = false

  function mountPage(page: number, host: HTMLElement, transform: PageTransform): void {
    /** Layers that failed and have not rendered since; the error clears when this empties. */
    const failed = new Set<PageLayer>()
    let error: InkError | null = null
    const isCustom = custom
    const mount = createPageMount({
      document: doc,
      page,
      host,
      transform,
      store: doc.annotations,
      onActivate: (id) => opts.onActivate?.(id),
      isCustom: () => isCustom,
      onError: (cause, layer) => {
        failed.add(layer)
        // The first failure wins: a canvas and a text layer failing together report once.
        if (error) return
        error = isInkError(cause)
          ? cause
          : new InkError(
              'InvalidPdf',
              cause instanceof Error ? cause.message : String(cause),
              { page },
              cause
            )
        host.setAttribute('data-state', 'error')
        opts.onPageError?.(page, error)
      },
      onRendered: (layer) => {
        failed.delete(layer)
        if (!error || failed.size > 0) return
        error = null
        host.removeAttribute('data-state')
        opts.onPageError?.(page, null)
      },
    })
    pages.set(page, mount)
    opts.onPageMount?.(page, mount, host)
  }

  function unmountPage(page: number): void {
    const mount = pages.get(page)
    if (!mount) return
    pages.delete(page)
    opts.onPageUnmount?.(page)
    mount.destroy()
  }

  function build(state: {
    zoom: ZoomValue
    page: number | undefined
    mode: LayoutMode | undefined
    rotation: ViewRotation | undefined
    tool: ToolId | undefined
  }): void {
    const vp = createViewport({
      container: el,
      document: doc,
      zoom: state.zoom,
      ...(state.mode === undefined ? {} : { mode: state.mode }),
      ...(state.rotation === undefined ? {} : { rotation: state.rotation }),
      ...(gap === undefined ? {} : { gap }),
      ...(buffer === undefined ? {} : { buffer }),
      onMount: mountPage,
      onUpdate: (page, _host, transform) => pages.get(page)?.update(transform),
      onUnmount: unmountPage,
    })
    const tc = createToolController({
      ...(state.tool === undefined ? {} : { initial: state.tool }),
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
        onActivate: (id) => opts.onActivate?.(id),
      },
    })
    viewport = vp
    tools = tc
    stopKeys = attachViewportKeys(el, { viewport: vp, pageCount: () => doc.pages.length })
    if (state.page !== undefined && state.page !== vp.currentPage.get())
      vp.scrollToPage(state.page)
    opts.onBuild?.(vp, tc)
  }

  function teardown(): void {
    stopKeys()
    tools.destroy()
    // The viewport unmounts every page it mounted, which destroys the page mounts.
    viewport.destroy()
    for (const page of [...pages.keys()]) unmountPage(page)
  }

  build({
    zoom: opts.zoom ?? 'fit-width',
    page: opts.page,
    mode: opts.mode,
    rotation: opts.rotation,
    tool: opts.tool,
  })

  return {
    get viewport() {
      return viewport
    },
    get tools() {
      return tools
    },
    pages,
    rebuild(next) {
      if (destroyed) return
      const state = {
        zoom: viewport.zoom.get(),
        page: viewport.currentPage.get(),
        mode: viewport.mode.get(),
        rotation: viewport.rotation.get(),
        tool: tools.active.get(),
      }
      teardown()
      if (next.gap !== undefined) gap = next.gap
      if (next.buffer !== undefined) buffer = next.buffer
      if (next.customAnnotations !== undefined) custom = next.customAnnotations
      build(state)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      teardown()
    },
  }
}
