/*
 * The wiring every viewer needs: a viewport over the scroll element, page layers in each page
 * host it creates, page-error tracking, the tool controller and keyboard shortcuts. Framework
 * bindings and `createViewer` sit on top: they render their own chrome and get pages and
 * errors back through the callbacks.
 */
import { InkError, isInkError } from '../model/errors'
import {
  createMemorySignatureStore,
  createSignatureLibrary,
  type SignatureLibrary,
  type SignatureStore,
} from '../model/signatures'

import { hasControl, type SignFieldRequest } from './form-layer'
import { tabOrder } from './form-order'
import { createPageMount, type PageLayer, type PageMount } from './page-mount'
import { createPluginLayers } from './plugins/layer'
import { createSearchHighlights } from './search/highlights'
import { getSelectionQuads } from './selection'
import {
  createToolController,
  createToolOptions,
  trackToolStyle,
  withHostTools,
  type Tool,
  type ToolController,
  type ToolId,
  type ToolOptions,
} from './tools'
import { FONT_FAMILIES, SIGNATURE_FONTS } from './ui'
import { createViewport, type Viewport, type ZoomValue } from './viewport'
import { attachViewportKeys } from './viewport-keys'

import type { LayoutMode } from './layout'
import type { DecorateAnnotation } from './overlay'
import type { PluginHost } from './plugins/host'
import type { SearchController } from './search/controller'
import type { PageTransform, ViewRotation } from './transform'
import type { ToolStyle } from '../model/annotations/tool-style'
import type { InkDocument } from '../model/document'
import type { FormAction, FormWidget } from '../model/form/types'
import type { Point } from '../model/geometry'

/** A user-space point on a page, used to put the scroll position back after a rebuild. */
interface ScrollAnchor {
  page: number
  user: Point
  /** Whether the vertical position is restored too, not only the horizontal one. */
  vertical: boolean
}

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
  /**
   * Host tools, added to the built-ins. A host tool with a built-in's id replaces it. The same
   * instances are reused when the engine rebuilds.
   */
  tools?: Tool[]
  /**
   * The tools' options (the shape kind, the highlight kind…). A binding or `createViewer` passes
   * one it keeps for its own life, so options persist across documents, as for the life of the
   * viewer. By default the engine makes one, which lasts as long as the engine.
   */
  toolOptions?: ToolOptions
  /**
   * The style the tools create with. A binding passes its own, made with `trackToolStyle` and
   * its own history (and keeps its active group in step with the tool). By default the engine
   * makes one over the document's history.
   */
  toolStyle?: ToolStyle
  /**
   * The history the tools group a gesture's changes with (a group move, a sketch's swap to its
   * shape). A binding passes its own, so a controlled host's undo steps match the gesture. By
   * default the document's history.
   */
  toolHistory?: { batch(fn: () => void): void }
  /**
   * The font families text boxes offer, replacing the default `FONT_FAMILIES` (the PDF
   * standard families). Fonts beyond those are the PDF writer's to embed.
   */
  fonts?: string[]
  /**
   * Where signature templates live. Default: memory, gone on reload
   * (`createMemorySignatureStore`). `createLocalSignatureStore` keeps them in the browser.
   */
  signatures?: SignatureStore
  /**
   * The templates the `signature` tool and the signature controls share. A binding or
   * `createViewer` passes its own, so they outlive one document; it wins over `signatures`.
   * A function is read each time the library is needed, so a host that swaps its library
   * after mount reaches the tool too.
   */
  signatureLibrary?: SignatureLibrary | (() => SignatureLibrary)
  /**
   * The handwriting fonts a typed signature offers. The host loads them (`@font-face`).
   * Default `SIGNATURE_FONTS`.
   */
  signatureFonts?: string[]
  /**
   * Tints fillable form fields, as other PDF viewers do. Default true. False sets
   * `data-ink-form-highlight="off"` on the container and each page's form layer.
   */
  formHighlight?: boolean
  /**
   * An empty signature field was activated: sign it, for instance by offering the saved
   * signatures anchored to `req.anchor` and calling `signField` with the one picked.
   * `createViewer` opens its signature menu here. Without it the field does nothing.
   */
  onSignField?(req: SignFieldRequest): void
  /**
   * The form asked the host to submit, open a link, send mail, print or prompt. Inkbar itself
   * never does any of these.
   */
  onFormAction?(action: FormAction): void
  /** A form script called `app.alert`: show `message` (text, not markup) without blocking. */
  onFormAlert?(message: string): void
  /** Annotation content is rendered by the host (custom slots). Changing it needs `rebuild`. */
  customAnnotations?: boolean
  /**
   * The app's own data attributes, classes and description for each annotation element, to
   * style or find its marks: `{ data: { 'my-flag': 'on' } }` writes `data-my-flag="on"`.
   * Decorations re-apply whenever the annotations change; when the function's output changes
   * for another reason (app state it reads), call `redecorate()`. Core's attributes and `ink-`
   * classes cannot be overridden.
   */
  decorateAnnotation?: DecorateAnnotation
  /**
   * The viewer's plugins. Their tools join `tools`, their layers are drawn on every page the
   * engine mounts, and the host's `decorate` replaces `decorateAnnotation`: build the host with
   * the app's decoration (its `decorate` option) so the two compose.
   */
  plugins?: PluginHost
  /**
   * The viewer's search controller. Its matches are highlighted on every page the engine
   * mounts, below the annotations.
   */
  search?: SearchController
  onActivate?(id: string): void
  /**
   * After every (re)build: subscribe to the new viewport and controller here. It fires inside
   * `mountViewer` before it returns, and after the build's `onPageMount` calls.
   */
  onBuild?(viewport: Viewport, tools: ToolController): void
  /**
   * The viewport mounts pages synchronously, so a build's `onPageMount` calls fire before its
   * `onBuild` (on the first build, before `mountViewer` returns). Do not read `engine.viewport`
   * or `engine.tools` here: during a rebuild they still point at the destroyed objects. Use
   * the arguments, or wait for `onBuild`.
   */
  onPageMount?(page: number, mount: PageMount, host: HTMLElement): void
  /** Same ordering rule as `onPageMount`: do not read `engine.viewport` or `engine.tools`. */
  onPageUnmount?(page: number): void
  /**
   * `error` when a page's canvas or text layer fails; `null` once every failed layer recovers.
   * Unmounting a failed page does not emit `null`: hosts that track errors by page must clear
   * them in `onPageUnmount`. Same ordering rule as `onPageMount`: do not read `engine.viewport`
   * or `engine.tools`.
   */
  onPageError?(page: number, error: InkError | null): void
}

export interface ViewerEngine {
  readonly viewport: Viewport
  readonly tools: ToolController
  /**
   * The style each group creates with, shared by the tools and the style controls. It lives as
   * long as the engine, across rebuilds.
   */
  readonly toolStyle: ToolStyle
  /** The font families text boxes offer: the `fonts` option, else `FONT_FAMILIES`. */
  readonly fonts: readonly string[]
  /** The signature templates: the host's current library, or the engine's own. */
  readonly signatures: SignatureLibrary
  /** The fonts a typed signature offers: the `signatureFonts` option, else `SIGNATURE_FONTS`. */
  readonly signatureFonts: readonly string[]
  readonly pages: ReadonlyMap<number, PageMount>
  /**
   * Recreates the viewport for construction-only options, keeping zoom, page, mode, rotation
   * and tool. The scroll position is kept too: the user-space point at the top-left of the
   * visible area stays there. When that corner is in a gap rather than on a page, the page below
   * the gap lands where `scrollToPage` puts it, with the new gap above it.
   */
  rebuild(opts: { gap?: number; buffer?: number; customAnnotations?: boolean }): void
  /**
   * Runs `decorateAnnotation` (or the plugins' `decorate`) again for every mounted annotation
   * element, without re-rendering anything else. Call it when the decorations would change but
   * no annotation did.
   */
  redecorate(): void
  destroy(): void
}

/** The tools under which form fields take input: the pointer tools, which make nothing. */
const FORM_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['select-text', 'select'])

export function mountViewer(opts: MountViewerOptions): ViewerEngine {
  const { container: el, document: doc } = opts
  if (opts.formHighlight === false) el.dataset.inkFormHighlight = 'off'
  const pages = new Map<number, PageMount>()
  let gap = opts.gap
  let buffer = opts.buffer
  let custom = opts.customAnnotations ?? false
  let viewport: Viewport
  let tools: ToolController
  let stopKeys: () => void = () => undefined
  let stopActive: () => void = () => undefined
  let stopFormTools: () => void = () => undefined
  let destroyed = false
  const plugins = opts.plugins
  const hostTools = [...(opts.tools ?? []), ...(plugins?.tools ?? [])]
  /** Plugin layers follow the host for the engine's life, across rebuilds. */
  const layers = plugins && createPluginLayers(plugins)
  /** Match highlights follow the controller for the engine's life, across rebuilds. */
  const highlights = opts.search && createSearchHighlights(opts.search)
  const decorate: DecorateAnnotation = plugins
    ? (a) => plugins.decorate(a)
    : (a) => opts.decorateAnnotation?.(a)
  /** A plugin's `ctx.redecorate()` reaches every page this engine has mounted. */
  const stopRedecorate = plugins?.watchRedecorate(() => {
    for (const mount of pages.values()) mount.overlay.redecorate()
  })
  /** Option values outlive rebuilds: every controller shares this registry. */
  const toolOptions = opts.toolOptions ?? createToolOptions()
  /** Without a host style, the engine's own follows the active tool across rebuilds. */
  const tracker = opts.toolStyle
    ? undefined
    : trackToolStyle({
        store: doc.annotations,
        history: opts.toolHistory ?? doc.history,
        tools: hostTools,
        tool: opts.tool,
      })
  const toolStyle = opts.toolStyle ?? (tracker as NonNullable<typeof tracker>).toolStyle
  const host = opts.signatureLibrary
  const own = host
    ? undefined
    : createSignatureLibrary(opts.signatures ?? createMemorySignatureStore())
  /** The library now: a host getter is read each time, so a swapped library takes effect. */
  const signatures = (): SignatureLibrary =>
    typeof host === 'function' ? host() : (host ?? (own as SignatureLibrary))
  void signatures().refresh()

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
      decorate,
      formHighlight: opts.formHighlight ?? true,
      // While a build mounts its pages, `tools` is unset or the old controller; the build
      // refreshes the fields once its controller exists.
      formActive: formsActive,
      onSignField: (req) => opts.onSignField?.(req),
      ...(layers ? { layers } : {}),
      ...(highlights ? { highlights } : {}),
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
    if (tabWait?.page === page) tabWait.retry()
  }

  /** Whether form fields take input under the active tool. */
  const formsActive = (): boolean => {
    const id = (tools as ToolController | undefined)?.active.get()
    return id !== undefined && FORM_TOOLS.has(id)
  }

  /**
   * The first widget (`last`: the last) in Tab order on each page with a control to stop at,
   * by page index.
   */
  function tabEdges(last: boolean): Map<number, FormWidget> {
    const fields = doc.form.fields.get()
    const byId = new Map(
      fields.flatMap((f) =>
        hasControl(f) ? f.widgets.map((w) => [w.id, w] as const) : []
      )
    )
    const state = doc.form.widgetState.get()
    const edges = new Map<number, FormWidget>()
    for (const id of tabOrder(fields, doc.form._tabs, doc.pages)) {
      const w = byId.get(id)
      if (!w || (state[id]?.hidden ?? (w.hidden || w.printOnly))) continue
      if (last || !edges.has(w.page)) edges.set(w.page, w)
    }
    return edges
  }

  /** The page a Tab waits for: its stops were not mounted when the view scrolled to it. */
  let tabWait: { page: number; retry: () => void; cancel: () => void } | undefined

  /** The first stop of `page` (`back`: its last), once its form layer is mounted. */
  const edgeStop = (page: number, back: boolean): HTMLElement | undefined => {
    const stops = pages.get(page)?.form?.tabStops() ?? []
    return back ? stops.at(-1) : stops[0]
  }

  /**
   * Focuses `page`'s edge stop when the page mounts, or on the next animation frame,
   * whichever comes first. Tries once; when the page still has no stop, focus stays put.
   */
  function awaitTabStop(page: number, back: boolean): void {
    tabWait?.cancel()
    const frame = requestAnimationFrame(() => wait.retry())
    const wait = {
      page,
      retry: () => {
        wait.cancel()
        if (!destroyed) edgeStop(page, back)?.focus()
      },
      cancel: () => {
        cancelAnimationFrame(frame)
        if (tabWait === wait) tabWait = undefined
      },
    }
    tabWait = wait
  }

  /**
   * Tab on a page's last field stop (Shift+Tab on its first) goes to the first (last) stop of
   * the next (previous) page that has fields, mounting it and scrolling it into view. A page
   * that has not mounted once the view scrolls to it gets one more try, when it mounts or on the
   * next frame. Past the last page's fields, Tab leaves the viewer as usual.
   */
  function onFormTab(e: KeyboardEvent): void {
    if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented)
      return
    const target = e.target
    if (!(target instanceof Element) || !target.closest('[data-ink-form-layer]')) return
    if (!formsActive()) return
    const back = e.shiftKey
    const from = [...pages].find(([, m]) => m.form?.element.contains(target))
    if (!from) return
    const [page, mount] = from
    if (mount.form?.tabStops().at(back ? 0 : -1) !== target) return
    const edges = [...tabEdges(back)]
      .filter(([p]) => (back ? p < page : p > page))
      .sort(([a], [b]) => (back ? b - a : a - b))
    for (const [next, widget] of edges) {
      viewport.scrollToRect(next, widget.rect)
      const to = edgeStop(next, back)
      if (to) {
        e.preventDefault()
        to.focus()
        return
      }
      if (!pages.get(next)?.form) {
        e.preventDefault()
        awaitTabStop(next, back)
        return
      }
    }
  }
  el.addEventListener('keydown', onFormTab)

  // What the form asks of the host, and a field's go-to action, which the viewer runs itself.
  const stopForm = [
    doc.form.on('action', (a) => opts.onFormAction?.(a)),
    doc.form.on('alert', (message) => opts.onFormAlert?.(message)),
    doc.form.on('goto', (page) => {
      if (!destroyed && page >= 0 && page < doc.pages.length) viewport.scrollToPage(page)
    }),
  ]

  function unmountPage(page: number): void {
    const mount = pages.get(page)
    if (!mount) return
    pages.delete(page)
    opts.onPageUnmount?.(page)
    mount.destroy()
  }

  /** The client point at the top-left of the container's visible content area. */
  function viewTopLeft(): Point {
    const r = el.getBoundingClientRect()
    return { x: r.left + el.clientLeft, y: r.top + el.clientTop }
  }

  /** The client point of the pages element's top-left: the origin of the layout's page boxes. */
  function layoutOrigin(): Point | undefined {
    const pagesEl = el.querySelector<HTMLElement>(':scope > [data-ink-pages]')
    if (!pagesEl) return undefined
    const r = pagesEl.getBoundingClientRect()
    return { x: r.left, y: r.top }
  }

  /**
   * Where the view sits before a rebuild: the user-space point under the top-left of the
   * visible area, on the page whose box contains it. When the top of the view is in a gap or a
   * margin, only the horizontal position is kept, and the page lands where `scrollToPage` puts
   * it, the new gap above it (a view resting at a page boundary stays at that boundary).
   */
  function scrollAnchor(vp: Viewport): ScrollAnchor | undefined {
    const o = layoutOrigin()
    if (!o) return undefined
    const corner = viewTopLeft()
    const x = corner.x - o.x
    const y = corner.y - o.y
    const boxes = vp.layout.get().boxes
    const inside = boxes.find((b) => y >= b.top && y < b.top + b.height)
    // In a gap or margin: the page just below it, which the view reaches first. Past the
    // last page there is none, so the current page stands in.
    const box =
      inside ??
      boxes.find((b) => b.top > y) ??
      boxes.find((b) => b.index === vp.currentPage.get())
    if (!box) return undefined
    // Transforms are affine, so a point left or right of the page maps back exactly too.
    const user = vp.transformFor(box.index).fromCss({ x: x - box.left, y: y - box.top })
    return { page: box.index, user, vertical: inside !== undefined }
  }

  /** Scrolls so the anchor's point sits under the top-left of the visible area again. */
  function restoreScroll(vp: Viewport, anchor: ScrollAnchor): void {
    const o = layoutOrigin()
    const box = vp.layout.get().boxes.find((b) => b.index === anchor.page)
    if (!o || !box) return
    const css = vp.transformFor(anchor.page).toCss(anchor.user)
    const corner = viewTopLeft()
    el.scrollLeft += o.x + box.left + css.x - corner.x
    if (anchor.vertical) el.scrollTop += o.y + box.top + css.y - corner.y
  }

  function build(state: {
    zoom: ZoomValue
    page: number | undefined
    mode: LayoutMode | undefined
    rotation: ViewRotation | undefined
    tool: ToolId | undefined
    anchor?: ScrollAnchor | undefined
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
    const list = withHostTools(hostTools)
    const tc = createToolController({
      ...(state.tool === undefined ? {} : { initial: state.tool }),
      tools: list,
      options: toolOptions,
      ctx: {
        toolStyle,
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
        history: opts.toolHistory ?? doc.history,
        get signatures() {
          return signatures()
        },
      },
    })
    viewport = vp
    tools = tc
    if (tracker) {
      tracker.setTool(tc.active.get())
      stopActive = tc.active.subscribe((id) => tracker.setTool(id))
    }
    const refreshForms = () => {
      for (const mount of pages.values()) mount.form?.refresh()
    }
    stopFormTools = tc.active.subscribe(refreshForms)
    refreshForms()
    stopKeys = attachViewportKeys(el, { viewport: vp, pageCount: () => doc.pages.length })
    // A view resting in a gap lands on the page below it, not on the most visible page.
    // The scroll position resets on teardown, so the guard below must not skip a gap anchor.
    if (state.anchor && !state.anchor.vertical) vp.scrollToPage(state.anchor.page)
    else if (state.page !== undefined && state.page !== vp.currentPage.get())
      vp.scrollToPage(state.page)
    if (state.anchor) restoreScroll(vp, state.anchor)
    opts.onBuild?.(vp, tc)
  }

  function teardown(): void {
    stopKeys()
    stopActive()
    stopFormTools()
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
    toolStyle,
    fonts: opts.fonts ? [...opts.fonts] : FONT_FAMILIES,
    get signatures() {
      return signatures()
    },
    signatureFonts: opts.signatureFonts ? [...opts.signatureFonts] : SIGNATURE_FONTS,
    pages,
    rebuild(next) {
      if (destroyed) return
      const state = {
        zoom: viewport.zoom.get(),
        page: viewport.currentPage.get(),
        mode: viewport.mode.get(),
        rotation: viewport.rotation.get(),
        tool: tools.active.get(),
        anchor: scrollAnchor(viewport),
      }
      teardown()
      if (next.gap !== undefined) gap = next.gap
      if (next.buffer !== undefined) buffer = next.buffer
      if (next.customAnnotations !== undefined) custom = next.customAnnotations
      build(state)
    },
    redecorate() {
      if (destroyed) return
      for (const mount of pages.values()) mount.overlay.redecorate()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      teardown()
      layers?.destroy()
      highlights?.destroy()
      stopRedecorate?.()
      el.removeEventListener('keydown', onFormTab)
      tabWait?.cancel()
      for (const stop of stopForm) stop()
      if (opts.formHighlight === false) delete el.dataset.inkFormHighlight
    },
  }
}
