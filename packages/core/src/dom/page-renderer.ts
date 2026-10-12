// Inline styles here are structural only: the wrapper fills the page host and clips
// (`position:absolute; inset:0; overflow:hidden`), and each canvas is pinned to the top-left
// with its CSS size set from the transform (`position:absolute; left:0; top:0; width; height`).
// Everything cosmetic (background, shadow, border) belongs to the theme.
import type { PageTransform } from './transform'
import type { InkDocument } from '../model/document'
import type { PdfjsRenderTask } from '../pdfjs/types'

export interface PageRendererOptions {
  document: InkDocument
  /** Zero-based page index. */
  page: number
  /** The page host (`div.ink-page`); the renderer appends its canvas layer to it. */
  host: HTMLElement
  transform: PageTransform
  /**
   * Fixed device pixel ratio. When omitted, `window.devicePixelRatio` is read at every render
   * and the page re-renders when it changes (browser zoom, moving to another screen).
   */
  devicePixelRatio?: number
  onRendered?(): void
  /** Called for any render failure other than a superseded render's cancellation. */
  onError?(error: unknown): void
}

export interface PageRenderer {
  readonly element: HTMLElement
  /**
   * Resolves once the most recent `update` has painted, failed (see `onError`) or the
   * renderer was destroyed. Never rejects. A promise read before a later `update` resolves
   * together with that later render, so every promise handed out settles.
   */
  readonly rendered: Promise<void>
  update(transform: PageTransform): void
  destroy(): void
}

const isCancellation = (error: unknown): boolean =>
  (error as { name?: unknown } | null)?.name === 'RenderingCancelledException'

export function createPageRenderer(opts: PageRendererOptions): PageRenderer {
  const { document: doc, page, host } = opts
  const view = host.ownerDocument.defaultView
  const currentDpr = (): number =>
    opts.devicePixelRatio ??
    (view && view.devicePixelRatio > 0 ? view.devicePixelRatio : 1)
  const wrapper = host.ownerDocument.createElement('div')
  wrapper.className = 'ink-canvas-layer'
  wrapper.dataset.inkCanvasLayer = ''
  wrapper.style.cssText = 'position:absolute;inset:0;overflow:hidden;'
  host.append(wrapper)

  let current: HTMLCanvasElement | undefined
  let latest = opts.transform
  let task: PdfjsRenderTask | undefined
  let destroyed = false
  let generation = 0

  // One deferred per busy period: renders that supersede each other share it, and it
  // resolves when the newest one settles.
  let resolvePending: (() => void) | undefined
  let rendered: Promise<void> = Promise.resolve()

  function settle() {
    resolvePending?.()
    resolvePending = undefined
  }

  function sizeCanvas(canvas: HTMLCanvasElement, transform: PageTransform) {
    canvas.style.width = `${transform.cssWidth}px`
    canvas.style.height = `${transform.cssHeight}px`
  }

  async function render(transform: PageTransform): Promise<void> {
    const gen = ++generation
    latest = transform
    const dpr = currentDpr()
    watchDpr(dpr)
    task?.cancel()
    task = undefined
    if (!resolvePending) {
      rendered = new Promise<void>((resolve) => (resolvePending = resolve))
    }
    // The previous bitmap stays visible, stretched to the new size, until the new one lands.
    if (current) sizeCanvas(current, transform)
    try {
      const pdfPage = await doc._pdfjs.getPage(page)
      if (destroyed || gen !== generation) return
      const { AnnotationMode } = doc._pdfjs.module
      const viewport = pdfPage.getViewport({
        scale: transform.zoom,
        rotation: transform.totalRotation,
      })
      const canvas = host.ownerDocument.createElement('canvas')
      canvas.dataset.inkCanvas = ''
      canvas.setAttribute('aria-hidden', 'true')
      canvas.width = Math.round(transform.cssWidth * dpr)
      canvas.height = Math.round(transform.cssHeight * dpr)
      canvas.style.cssText = 'position:absolute;left:0;top:0;'
      sizeCanvas(canvas, transform)
      const ownTask = pdfPage.render({
        canvas,
        viewport,
        // Pages are paper: an opaque white canvas, whatever the theme puts behind it.
        background: '#ffffff',
        annotationMode: AnnotationMode.ENABLE,
        ...(dpr === 1 ? {} : { transform: [dpr, 0, 0, dpr, 0, 0] }),
      })
      task = ownTask
      await ownTask.promise
      if (task === ownTask) task = undefined
      if (destroyed || gen !== generation) return
      current?.remove()
      current = canvas
      wrapper.append(canvas)
      opts.onRendered?.()
    } catch (error) {
      const superseded = destroyed || gen !== generation
      if (!(superseded && isCancellation(error)) && !destroyed) opts.onError?.(error)
    } finally {
      if (gen === generation) settle()
    }
  }

  // Re-render when the device pixel ratio changes, unless the caller fixed it. The media
  // query matches only the ratio it was built for, so it is rebuilt after every change.
  // During a browser-zoom or screen transition the query can fire while devicePixelRatio
  // still reports the old value, so each change also schedules follow-up checks.
  const RECHECK_MS = [100, 500]
  let dprQuery: MediaQueryList | undefined
  let watchedDpr: number | undefined
  let rechecks: ReturnType<typeof setTimeout>[] = []
  const clearRechecks = (): void => {
    rechecks.forEach(clearTimeout)
    rechecks = []
  }
  const onDprChange = (): void => {
    if (destroyed) return
    const seen = currentDpr()
    watchDpr(seen, true)
    void render(latest)
    clearRechecks()
    rechecks = RECHECK_MS.map((ms) =>
      setTimeout(() => {
        if (!destroyed && currentDpr() !== watchedDpr) onDprChange()
      }, ms)
    )
  }
  function watchDpr(dpr: number, force = false): void {
    if (opts.devicePixelRatio !== undefined || !view?.matchMedia) return
    if (dpr === watchedDpr && !force) return
    watchedDpr = dpr
    dprQuery?.removeEventListener('change', onDprChange)
    dprQuery = view.matchMedia(`(resolution: ${dpr}dppx)`)
    dprQuery.addEventListener('change', onDprChange)
  }

  void render(opts.transform)

  return {
    element: wrapper,
    get rendered() {
      return rendered
    },
    update(transform) {
      if (destroyed) return
      void render(transform)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      dprQuery?.removeEventListener('change', onDprChange)
      dprQuery = undefined
      clearRechecks()
      task?.cancel()
      task = undefined
      wrapper.remove()
      settle()
    },
  }
}
