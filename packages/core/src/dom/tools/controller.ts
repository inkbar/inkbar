// The controller writes two things to the root: `data-ink-tool="<id>"` (a marker for themes
// and tests; `data-tool` belongs to toolbar buttons) and `style.cursor` from the active tool.
// Both are structural, and both are removed on destroy.
//
// `pointerdown` is listened for in the capture phase. The overlay stops propagation of presses
// on annotation shapes (so a creation tool never starts a drag from one), but a capture
// listener on the root runs before that, so the controller can pass the pressed annotation's
// id to the tool. Move, up and key events bubble normally.
//
// When a tool starts a gesture (its `onPointerDown` returns true) the controller captures the
// pointer on the root, so the release still arrives when it happens outside. `pointercancel`
// and `lostpointercapture` reach the tool as `onPointerCancel`. `touch-action` is left to the
// theme or host: touch gestures are theirs to arbitrate.
import { readonly, writable, type Readable } from '../../model/readable'

import type { AnnotationStore } from '../../model/annotations/store'
import type { Point } from '../../model/geometry'
import type { SelectionQuads } from '../selection'
import type { Viewport, ViewportHit } from '../viewport'

export type ToolId = 'view' | 'select' | 'highlight' | 'redact-area' | 'note'

export interface PageHit extends ViewportHit {
  /** Pointer position in user space. */
  user: Point
  /** Pointer position relative to the page host's top-left, CSS px. */
  css: Point
}

export interface ToolContext {
  store: AnnotationStore
  viewport: Viewport
  /** The element pointer and key events are listened on (the viewport container). */
  root: HTMLElement
  /** The live text selection as user-space quads, one entry per page. */
  selectionQuads(): SelectionQuads[]
  clearSelection(): void
  onActivate?(id: string): void
}

export interface Tool {
  id: ToolId
  cursor: string
  activate(ctx: ToolContext): void
  deactivate(): void
  /**
   * Runs in the capture phase, before the overlay sees the press. `annotationId` is set when
   * the press landed on an annotation; the overlay then selects and activates it, so tools
   * other than `select` should ignore such presses. Calling `e.stopPropagation()` here keeps
   * the overlay from handling it. Return true when the press starts a gesture: the controller
   * then captures the pointer until it is released or cancelled.
   */
  onPointerDown?(
    e: PointerEvent,
    hit: PageHit | undefined,
    annotationId?: string
  ): boolean | void
  /**
   * A move with `e.buttons === 0` during a gesture means the release was missed (it happened
   * where no listener saw it): tools treat it as a cancel.
   */
  onPointerMove?(e: PointerEvent, hit: PageHit | undefined): void
  onPointerUp?(e: PointerEvent, hit: PageHit | undefined): void
  /** `pointercancel` or `lostpointercapture`: drop any gesture in progress without writing. */
  onPointerCancel?(e: PointerEvent): void
  onKeyDown?(e: KeyboardEvent): void
}

export interface ToolController {
  readonly active: Readable<ToolId>
  set(id: ToolId): void
  destroy(): void
}

export interface ToolControllerOptions {
  ctx: ToolContext
  /** Default `'view'`. */
  initial?: ToolId
  tools: Tool[]
}

/** Host-relative CSS point for a client point. */
export function cssIn(host: HTMLElement, e: { clientX: number; clientY: number }): Point {
  const r = host.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

/** The mounted page under a client point, with the point in CSS px and user space. */
export function hitFor(
  ctx: ToolContext,
  e: { clientX: number; clientY: number }
): PageHit | undefined {
  const hit = ctx.viewport.pageAtCss(e.clientX, e.clientY)
  if (!hit) return undefined
  const css = cssIn(hit.host, e)
  return { ...hit, css, user: hit.transform.fromCss(css) }
}

export function createToolController(opts: ToolControllerOptions): ToolController {
  const { ctx } = opts
  const byId = new Map(opts.tools.map((t) => [t.id, t]))
  const active = writable<ToolId>(opts.initial ?? 'view')
  let current: Tool | undefined

  const onDown = (e: PointerEvent): void => {
    if (!e.isPrimary || e.button !== 0) return
    const target = e.target instanceof Element ? e.target : null
    const annotationId =
      target?.closest('[data-annotation]')?.getAttribute('data-annotation') ?? undefined
    if (current?.onPointerDown?.(e, hitFor(ctx, e), annotationId) === true)
      capture(e.pointerId)
  }
  const onMove = (e: PointerEvent): void => {
    if (e.isPrimary) current?.onPointerMove?.(e, hitFor(ctx, e))
  }
  const onUp = (e: PointerEvent): void => {
    if (!e.isPrimary) return
    current?.onPointerUp?.(e, hitFor(ctx, e))
    release(e.pointerId)
  }
  const onCancel = (e: PointerEvent): void => {
    if (e.isPrimary) current?.onPointerCancel?.(e)
  }
  const onKey = (e: KeyboardEvent): void => current?.onKeyDown?.(e)

  // Capture is best effort: synthetic events may carry a pointer id the browser does not know.
  function capture(id: number): void {
    try {
      ctx.root.setPointerCapture?.(id)
    } catch {
      // Not an active pointer: the gesture still works while the pointer stays over the root.
    }
  }
  function release(id: number): void {
    try {
      if (ctx.root.hasPointerCapture?.(id)) ctx.root.releasePointerCapture(id)
    } catch {
      // Already released.
    }
  }
  ctx.root.addEventListener('pointerdown', onDown, { capture: true })
  ctx.root.addEventListener('pointermove', onMove)
  ctx.root.addEventListener('pointerup', onUp)
  ctx.root.addEventListener('pointercancel', onCancel)
  ctx.root.addEventListener('lostpointercapture', onCancel)
  ctx.root.addEventListener('keydown', onKey)

  function set(id: ToolId): void {
    const next = byId.get(id)
    if (!next) throw new RangeError(`Unknown tool ${id}`)
    current?.deactivate()
    current = next
    next.activate(ctx)
    ctx.root.dataset.inkTool = id
    ctx.root.style.cursor = next.cursor
    active.set(id)
  }
  set(opts.initial ?? 'view')

  return {
    active: readonly(active),
    set,
    destroy() {
      current?.deactivate()
      current = undefined
      ctx.root.removeEventListener('pointerdown', onDown, { capture: true })
      ctx.root.removeEventListener('pointermove', onMove)
      ctx.root.removeEventListener('pointerup', onUp)
      ctx.root.removeEventListener('pointercancel', onCancel)
      ctx.root.removeEventListener('lostpointercapture', onCancel)
      ctx.root.removeEventListener('keydown', onKey)
      delete ctx.root.dataset.inkTool
      ctx.root.style.cursor = ''
    },
  }
}
