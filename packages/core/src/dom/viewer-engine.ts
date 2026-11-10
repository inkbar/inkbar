/*
 * The wiring every viewer needs: a viewport over the scroll element, page layers in each page
 * host it creates, page-error tracking, the tool controller and keyboard shortcuts. Framework
 * bindings and `createViewer` sit on top: they render their own chrome and get pages and
 * errors back through the callbacks.
 */
import { InkError, isInkError } from '../model/errors'
import { rectFromQuad, type Point, type Rect } from '../model/geometry'
import {
  createMemorySignatureStore,
  createSignatureLibrary,
  type SignatureLibrary,
  type SignatureStore,
} from '../model/signatures'

import { hasControl, type SignFieldRequest } from './form-layer'
import { pageStopOrder } from './form-order'
import { createNavigation, type Navigation } from './navigation'
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
import type { FormWidget, ViewerAction } from '../model/form/types'

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
  /** Zoom the document on a two-finger pinch. Default `true`; see `ViewportOptions.pinchZoom`. */
  pinchZoom?: boolean
  tool?: ToolId
  /**
   * The creation tools (`allTools()`, or the ones the host imports); `select-text` and `select`
   * are always present. A later tool replaces an earlier one with its id, so a host tool can
   * replace a core one. The same instances are reused when the engine rebuilds.
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
   * The viewer asked the host to do something: a form's submit, mail, print or prompt, or a
   * link to a URL. Inkbar itself never does any of these.
   */
  onAction?(action: ViewerAction): void
  /** @deprecated Use `onAction`. Removed in 0.13.0. Ignored when `onAction` is given. */
  onFormAction?(action: ViewerAction): void
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
   * Back and forward through the document's jumps: links, outline items and form buttons that
   * go to a page. It lasts as long as the engine, across rebuilds, and starts empty for each
   * document. URL targets reach `onAction`.
   */
  readonly navigation: Navigation
  /**
   * Recreates the viewport for construction-only options, keeping zoom, page, mode, rotation
   * and tool. The scroll position is kept too: the user-space point at the top-left of the
   * visible area stays there. When that corner is in a gap rather than on a page, the page below
   * the gap lands where `scrollToPage` puts it, with the new gap above it.
   */
  rebuild(opts: {
    gap?: number
    buffer?: number
    pinchZoom?: boolean
    customAnnotations?: boolean
  }): void
  /**
   * Runs `decorateAnnotation` (or the plugins' `decorate`) again for every mounted annotation
   * element, without re-rendering anything else. Call it when the decorations would change but
   * no annotation did.
   */
  redecorate(): void
  /**
   * Turns the form field tint on or off for the mounted pages and those mounted later, in
   * place: no page renders again and no field loses focus or typed text.
   */
  setFormHighlight(on: boolean): void
  destroy(): void
}

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'iframe',
  'summary',
  '[tabindex]',
  '[contenteditable]',
].join(', ')

/** Whether `c` takes focus from Tab: enabled, rendered, visible and not inert. */
function tabbable(c: HTMLElement): boolean {
  if (c.matches(':disabled') || c.closest('[inert]') || c.getClientRects().length === 0)
    return false
  return c.ownerDocument.defaultView?.getComputedStyle(c).visibility === 'visible'
}

/**
 * The element the browser's Tab moves to from `from` (`back`: Shift+Tab), skipping `from`'s
 * own descendants (`from` may be the viewer). Forward, that is the next element in document
 * order with tabindex 0: from a tabindex-0 control the browser never moves to a positive one.
 * Back, it is the previous tabindex-0 element, else the last of the positive tabindex ones,
 * which the browser visits first. Inside a shadow root it looks only within that root.
 */
function nextFocusable(from: Element, back: boolean): HTMLElement | undefined {
  // The tree the viewer lives in: a shadow root that hosts it, else the document.
  const root = from.getRootNode()
  const scope: ParentNode = root instanceof ShadowRoot ? root : from.ownerDocument
  const all = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (c) => c.tabIndex >= 0 && !from.contains(c) && tabbable(c)
  )
  const after = (c: Element) =>
    (from.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  const zero = all.filter((c) => c.tabIndex === 0)
  if (!back) return zero.find(after)
  const before = zero.filter((c) => !after(c)).at(-1)
  if (before) return before
  // Positive tabindex elements go first, by tabindex and then document order.
  return all
    .filter((c) => c.tabIndex > 0)
    .sort((a, b) => a.tabIndex - b.tabIndex)
    .at(-1)
}

/** The tools under which form fields take input: the pointer tools, which make nothing. */
const FORM_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['select-text', 'select'])

export function mountViewer(opts: MountViewerOptions): ViewerEngine {
  const { container: el, document: doc } = opts
  let highlight = opts.formHighlight ?? true
  if (!highlight) el.dataset.inkFormHighlight = 'off'
  const pages = new Map<number, PageMount>()
  let gap = opts.gap
  let buffer = opts.buffer
  let pinchZoom = opts.pinchZoom
  let custom = opts.customAnnotations ?? false
  let viewport: Viewport
  let tools: ToolController
  let stopKeys: () => void = () => undefined
  let stopActive: () => void = () => undefined
  let stopFormTools: () => void = () => undefined
  let stopPageEvents: () => void = () => undefined
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
      formHighlight: highlight,
      // While a build mounts its pages, `tools` is unset or the old controller; the build
      // refreshes the fields once its controller exists.
      formActive: formsActive,
      onSignField: (req) => opts.onSignField?.(req),
      followLink: (target) => void navigation.follow(target),
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
   * The first stop (`last`: the last) in Tab order on `page`, by its user-space rect, among the
   * fields with a control to stop at (while fields take input) and the links Inkbar follows.
   * `widgets` holds those fields' widgets by page.
   */
  function tabEdge(
    page: number,
    last: boolean,
    widgets: ReadonlyMap<number, readonly FormWidget[]>
  ): Rect | undefined {
    const state = doc.form.widgetState.get()
    const shown = (widgets.get(page) ?? []).filter(
      (w) => !(state[w.id]?.hidden ?? (w.hidden || w.printOnly))
    )
    const links = doc.links(page).filter((l) => l.target.kind !== 'unsupported')
    if (shown.length === 0 && links.length === 0) return undefined
    const rects = new Map<string, Rect>([
      ...shown.map((w) => [w.id, w.rect] as const),
      ...links.map(
        (l) => [l.id, l.quads?.[0] ? rectFromQuad(l.quads[0]) : l.rect] as const
      ),
    ])
    const order = pageStopOrder(
      shown,
      links,
      doc.form._tabs.get(page),
      doc.pages[page],
      page,
      doc.form._structure.get(page)
    )
    const id = last ? order.at(-1) : order[0]
    return id === undefined ? undefined : rects.get(id)
  }

  /** The page a Tab waits for: its stops were not mounted when the view scrolled to it. */
  let tabWait: { page: number; retry: () => void; cancel: () => void } | undefined

  /** The first stop of `page` (`back`: its last), once the page is mounted. */
  const edgeStop = (page: number, back: boolean): HTMLElement | undefined => {
    const stops = pages.get(page)?.tabStops() ?? []
    return back ? stops.at(-1) : stops[0]
  }

  /**
   * Focuses `page`'s edge stop when the page mounts, or on the next animation frame,
   * whichever comes first. Tries once; when the page still has no stop, Tab goes where the
   * browser would have taken it from `from` (`nextFocusable`), or past the viewer when `from`
   * has unmounted. With nowhere to go, focus returns to the document.
   */
  function awaitTabStop(page: number, back: boolean, from: Element): void {
    tabWait?.cancel()
    const frame = requestAnimationFrame(() => wait.retry())
    const wait = {
      page,
      retry: () => {
        wait.cancel()
        if (destroyed) return
        const stop = edgeStop(page, back)
        if (stop) {
          stop.focus()
          return
        }
        const next = nextFocusable(from.isConnected ? from : el, back)
        if (next) next.focus()
        // Nothing to move to: give focus back to the document, as the browser would leave the
        // page, so the next Tab starts over from there.
        else if (from instanceof HTMLElement && from.isConnected) from.blur()
        else (el.ownerDocument.activeElement as HTMLElement | null)?.blur()
      },
      cancel: () => {
        cancelAnimationFrame(frame)
        if (tabWait === wait) tabWait = undefined
      },
    }
    tabWait = wait
  }

  /**
   * Tab among a page's fields and links, and across pages. On a page with both, Tab follows the
   * page's one order of them: they sit in two layers, so the browser's own Tab would visit one
   * layer and then the other. Tab on a page's last stop (Shift+Tab on its first) goes to the
   * first (last) stop of the next (previous) page that has any, mounting it and scrolling it
   * into view. A page that has not mounted once the view scrolls to it gets one more try, when
   * it mounts or on the next frame; after that, focus moves on as the browser's Tab would. Past
   * the last page's stops, Tab leaves the viewer as usual.
   */
  function onPageTab(e: KeyboardEvent): void {
    if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented)
      return
    const target = e.target
    if (
      !(target instanceof HTMLElement) ||
      !target.closest('[data-ink-form-layer], [data-ink-link-layer]')
    )
      return
    const back = e.shiftKey
    const from = [...pages].find(
      ([, m]) => m.form?.element.contains(target) || m.links?.element.contains(target)
    )
    if (!from) return
    const [page, mount] = from
    const stops = mount.tabStops()
    const at = stops.indexOf(target)
    if (at < 0) return
    const within = stops[back ? at - 1 : at + 1]
    if (within) {
      if (mount.form && mount.links) {
        e.preventDefault()
        within.focus()
      }
      return
    }
    const fields = formsActive() ? doc.form.fields.get() : []
    const widgets = new Map<number, FormWidget[]>()
    for (const f of fields)
      if (hasControl(f))
        for (const w of f.widgets) {
          const list = widgets.get(w.page) ?? []
          list.push(w)
          widgets.set(w.page, list)
        }
    for (
      let next = page + (back ? -1 : 1);
      next >= 0 && next < doc.pages.length;
      next += back ? -1 : 1
    ) {
      const rect = tabEdge(next, back, widgets)
      if (!rect) continue
      viewport.scrollToRect(next, rect)
      const to = edgeStop(next, back)
      if (to) {
        e.preventDefault()
        to.focus()
        return
      }
      if (!pages.has(next)) {
        e.preventDefault()
        awaitTabStop(next, back, target)
        return
      }
    }
  }
  el.addEventListener('keydown', onPageTab)

  /**
   * The Tab key pressed now, and whether with Shift: set on its keydown, wherever focus is, and
   * cleared once the browser has moved focus for it, so a pointer press never counts.
   */
  let tabbing: { back: boolean } | undefined
  const onTabKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return
    const press = { back: e.shiftKey }
    tabbing = press
    setTimeout(() => {
      if (tabbing === press) tabbing = undefined
    })
  }
  el.ownerDocument.addEventListener('keydown', onTabKey, true)

  /**
   * Tab from outside a page onto its fields and links starts at the page's first stop (Shift+Tab
   * at its last). The browser enters by DOM order, which on a page with both is the first link or
   * the last field, so stops before it in the page's order would be skipped.
   */
  function onStopFocus(e: FocusEvent): void {
    const target = e.target
    if (!tabbing || !(target instanceof HTMLElement)) return
    const on = [...pages.values()].find(
      (m) => m.form?.element.contains(target) || m.links?.element.contains(target)
    )
    if (!on?.form || !on.links) return
    const from = e.relatedTarget
    if (
      from instanceof Node &&
      (on.form.element.contains(from) || on.links.element.contains(from))
    )
      return
    const stops = on.tabStops()
    if (!stops.includes(target)) return
    const edge = tabbing.back ? stops.at(-1) : stops[0]
    if (edge && edge !== target) edge.focus()
  }
  el.addEventListener('focusin', onStopFocus)

  // `onAction` wins; the old `onFormAction` is only a fallback while it lasts.
  const reportAction = (a: ViewerAction): void =>
    (opts.onAction ?? opts.onFormAction)?.(a)

  /**
   * History of the jumps made in this document. "Here" is the point the rebuild anchor keeps:
   * the top-left of the visible area as an `xyz` destination, so Back puts the view where it
   * was. When that corner is in a gap, `top` is left out and the page lands at its top.
   */
  const navigation = createNavigation({
    viewport: () => (destroyed ? undefined : viewport),
    document: () => (destroyed ? undefined : doc),
    here: () => {
      const a = scrollAnchor(viewport)
      return (
        a && {
          page: a.page,
          fit: 'xyz',
          left: a.user.x,
          top: a.vertical ? a.user.y : undefined,
        }
      )
    },
    report: reportAction,
  })

  // What the form asks of the host, and a field's go-to action, which the viewer runs itself
  // as a jump Back returns from.
  const stopForm = [
    doc.form.on('action', reportAction),
    doc.form.on('alert', (message) => opts.onFormAlert?.(message)),
    doc.form.on('goto', (page) => navigation.goTo({ page, fit: 'fit' })),
  ]

  /**
   * The page whose open scripts ran last, and has not closed since. Page open and close events
   * follow the viewport's current page, as Acrobat runs them for the page a person is on, not for
   * the pages mounted around it; a rebuild that keeps the page sends neither.
   */
  let openPage: number | undefined
  function openPageEvents(next: number | undefined): void {
    if (next === openPage) return
    if (openPage !== undefined) void doc.form._pageEvent(openPage, 'PageClose')
    openPage = next
    if (next !== undefined) void doc.form._pageEvent(next, 'PageOpen')
  }

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
      ...(pinchZoom === undefined ? {} : { pinchZoom }),
      onMount: mountPage,
      onUpdate: (page, _host, transform) => pages.get(page)?.update(transform),
      onUnmount: unmountPage,
    })
    const list = withHostTools(hostTools)
    const tc = createToolController({
      ...(state.tool === undefined ? {} : { initial: state.tool }),
      tools: list,
      options: toolOptions,
      ...(plugins && { onPress: (kind, press) => plugins.emitPress(kind, press) }),
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
    openPageEvents(vp.currentPage.get())
    stopPageEvents = vp.currentPage.subscribe(openPageEvents)
    opts.onBuild?.(vp, tc)
  }

  function teardown(): void {
    stopKeys()
    stopActive()
    stopFormTools()
    stopPageEvents()
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
    navigation,
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
      if (next.pinchZoom !== undefined) pinchZoom = next.pinchZoom
      if (next.customAnnotations !== undefined) custom = next.customAnnotations
      build(state)
    },
    redecorate() {
      if (destroyed) return
      for (const mount of pages.values()) mount.overlay.redecorate()
    },
    setFormHighlight(on) {
      if (destroyed || on === highlight) return
      highlight = on
      if (on) delete el.dataset.inkFormHighlight
      else el.dataset.inkFormHighlight = 'off'
      for (const mount of pages.values()) mount.form?.setHighlight(on)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      teardown()
      openPageEvents(undefined)
      layers?.destroy()
      highlights?.destroy()
      stopRedecorate?.()
      el.removeEventListener('keydown', onPageTab)
      el.ownerDocument.removeEventListener('keydown', onTabKey, true)
      el.removeEventListener('focusin', onStopFocus)
      tabWait?.cancel()
      for (const stop of stopForm) stop()
      // The engine is one document's: its history goes with it.
      navigation.clear()
      if (!highlight) delete el.dataset.inkFormHighlight
    },
  }
}
