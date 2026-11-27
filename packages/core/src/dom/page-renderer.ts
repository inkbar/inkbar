// Inline styles here are structural only: the wrapper fills the page host and clips
// (`position:absolute; inset:0; overflow:hidden`), and each canvas is pinned to the top-left
// with its CSS size set from the transform (`position:absolute; left:0; top:0; width; height`).
// Everything cosmetic (background, shadow, border) belongs to the theme.
import { readonly, writable, type Readable } from '../model/readable'

import { watchDevicePixelRatio } from './dpr-watch'
import { hiddenFromIds, pageCanvasSize } from './draw-request'
import { hiddenAppearances } from './hidden-appearances'

import type { PageTransform } from './transform'
import type { InkDocument } from '../model/document'

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
  /**
   * Whether form widgets are drawn into the canvas as the PDF draws them. By default they are
   * drawn only when the document has no form fields; a document with fields leaves the
   * widgets of its fields on the page out, and the form layer draws each one's appearance.
   */
  drawWidgets?: boolean
  /** Mark every draw as background, so it queues behind the draws people are waiting on. */
  background?: boolean
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
  /**
   * PDF.js ids of file annotations lifted into the session whose file copies the canvas on
   * screen still paints, while a render that leaves them out is under way. Whoever draws the
   * lifted annotations leaves these to the canvas until then, so each shows once. Empty when no
   * render is pending (a failed or cancelled one included) or nothing is on screen yet.
   */
  readonly fileCopies: Readable<ReadonlySet<string>>
  update(transform: PageTransform): void
  destroy(): void
}

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
  /** Aborts the render in flight. */
  let controller: AbortController | undefined
  let destroyed = false
  let generation = 0

  // One deferred per busy period: renders that supersede each other share it, and it
  // resolves when the newest one settles.
  let resolvePending: (() => void) | undefined
  let rendered: Promise<void> = Promise.resolve()

  /** What the canvas on screen left out; undefined while none is on screen. */
  let drawnHidden: ReadonlySet<string> | undefined
  const fileCopies = writable<ReadonlySet<string>>(new Set())
  /** Brings `fileCopies` up to date with the canvas on screen and the pending render. */
  function trackFileCopies(): void {
    const shown =
      !destroyed && resolvePending && drawnHidden
        ? [...doc._lifted.get()].filter((id) => !drawnHidden!.has(id))
        : []
    const now = fileCopies.get()
    if (shown.length === now.size && shown.every((id) => now.has(id))) return
    fileCopies.set(new Set(shown))
  }

  function settle() {
    resolvePending?.()
    resolvePending = undefined
    trackFileCopies()
  }

  /**
   * Drops a canvas for good. Zeroing it frees its bitmap now rather than at garbage
   * collection; Safari caps the total canvas memory, which a long scroll would otherwise hit.
   */
  function release(canvas: HTMLCanvasElement): void {
    canvas.width = 0
    canvas.height = 0
    canvas.remove()
  }

  function sizeCanvas(canvas: HTMLCanvasElement, transform: PageTransform) {
    canvas.style.width = `${transform.cssWidth}px`
    canvas.style.height = `${transform.cssHeight}px`
  }

  async function render(transform: PageTransform): Promise<void> {
    const gen = ++generation
    latest = transform
    const dpr = currentDpr()
    dprWatch?.watch(dpr)
    controller?.abort()
    controller = undefined
    if (!resolvePending) {
      rendered = new Promise<void>((resolve) => (resolvePending = resolve))
    }
    trackFileCopies()
    // The previous bitmap stays visible, stretched to the new size, until the new one lands.
    if (current) sizeCanvas(current, transform)
    const ownController = new AbortController()
    controller = ownController
    let canvas: HTMLCanvasElement | undefined
    try {
      const fields = doc.form.fields.get()
      const drawWidgets = opts.drawWidgets ?? fields.length === 0
      canvas = host.ownerDocument.createElement('canvas')
      canvas.dataset.inkCanvas = ''
      canvas.setAttribute('aria-hidden', 'true')
      canvas.style.cssText = 'position:absolute;left:0;top:0;'
      sizeCanvas(canvas, transform)
      // Widgets the form layer draws, and file annotations lifted into the session, which the
      // overlay draws.
      const hidden = hiddenAppearances(
        doc,
        drawWidgets
          ? []
          : fields.flatMap((f) =>
              f.widgets.flatMap((w) => (w.page === page ? [w.id] : []))
            )
      )
      await doc._reader.draw(
        {
          page,
          rotation: transform.totalRotation,
          zoom: transform.zoom,
          pixelRatio: dpr,
          ...pageCanvasSize(transform, dpr),
          hide: hiddenFromIds(hidden, page),
          ...(opts.background && { background: true }),
        },
        canvas,
        ownController.signal
      )
      if (controller === ownController) controller = undefined
      if (destroyed || gen !== generation) {
        release(canvas)
        return
      }
      if (current) release(current)
      current = canvas
      drawnHidden = hidden
      wrapper.append(canvas)
      opts.onRendered?.()
    } catch (error) {
      if (canvas && canvas !== current) release(canvas)
      if (controller === ownController) controller = undefined
      const superseded = destroyed || gen !== generation
      const cancelled =
        ownController.signal.aborted && error === ownController.signal.reason
      if (!(superseded && cancelled) && !destroyed) opts.onError?.(error)
    } finally {
      if (gen === generation) settle()
    }
  }

  // Re-render when the device pixel ratio changes, unless the caller fixed it.
  const dprWatch =
    opts.devicePixelRatio === undefined
      ? watchDevicePixelRatio(view, currentDpr, () => void render(latest))
      : undefined

  // File annotations lifted into the session once the document has read them leave the page.
  const stopLifted = doc._lifted.subscribe(() => {
    if (!destroyed) void render(latest)
  })
  // A document that has stopped reading and starts again draws the page again: a draw made
  // meanwhile failed, leaving the bitmap from before or none.
  const stopRestart = doc.engineStopped.subscribe((stopped) => {
    if (!stopped && !destroyed) void render(latest)
  })

  void render(opts.transform)

  return {
    element: wrapper,
    get rendered() {
      return rendered
    },
    fileCopies: readonly(fileCopies),
    update(transform) {
      if (destroyed) return
      void render(transform)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      stopLifted()
      stopRestart()
      dprWatch?.destroy()
      controller?.abort()
      controller = undefined
      if (current) release(current)
      current = undefined
      drawnHidden = undefined
      wrapper.remove()
      settle()
    },
  }
}
