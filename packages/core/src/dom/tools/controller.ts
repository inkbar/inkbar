// The controller writes two things to the root: `data-ink-tool="<id>"` (a marker for themes
// and tests; `data-tool` belongs to toolbar buttons) and `style.cursor` from the active tool.
// Both are structural, and both are removed on destroy.
//
// `pointerdown` is listened for in the capture phase. The overlay stops propagation of presses
// on annotation shapes other than text markup (so a creation tool never starts a drag from
// one), but a capture listener on the root runs before that, so the controller can pass the
// pressed annotation's id to the tool. Move, up and key events bubble normally.
//
// When a tool starts a gesture (its `onPointerDown` returns true) the controller captures the
// pointer on the root, so the release still arrives when it happens outside. `pointercancel`
// and `lostpointercapture` reach the tool as `onPointerCancel`. `touch-action` is left to the
// theme or host: touch gestures are theirs to arbitrate.
//
// The controller tracks the pressed pointer. Switching tools mid-press cancels the old tool's
// gesture and swallows that pointer's release, so the new tool never sees half a gesture.
// `lostpointercapture` after a completed release is not a cancel. Only primary-button presses
// and releases reach tools. The root's own inline cursor is restored on destroy.
import {
  createToolStyle,
  type StyleGroup,
  type ToolStyle,
} from '../../model/annotations/tool-style'
import { readonly, writable, type Readable } from '../../model/readable'
import { canEditFreeText, editFreeTextIn } from '../freetext-editor'

import { createToolOptions, type ToolOptions } from './options'

import type { AnnotationStore } from '../../model/annotations/store'
import type { Point } from '../../model/geometry'
import type { SelectionQuads } from '../selection'
import type { Viewport, ViewportHit } from '../viewport'

export type BuiltinToolId =
  | 'select-text'
  | 'select'
  | 'highlight'
  | 'redact-area'
  | 'note'
  | 'shape'
  | 'freetext'
  | 'draw'
  | 'sketch'
/** A built-in tool's id, or any id a host registers its own tool under. */
export type ToolId = BuiltinToolId | (string & {})

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
  /** The style each group creates with, shared with the style controls. */
  toolStyle: ToolStyle
  /** The active tool's current options. */
  options<O extends object>(): O
  /**
   * Groups a gesture's changes into one undo step (a group move). Without it each change is
   * its own step.
   */
  history?: { batch(fn: () => void): void }
}

export interface Tool<O extends object = object> {
  id: ToolId
  cursor: string
  /** Style group the tool creates into; select tools have none. */
  styleGroup?: StyleGroup
  /** Option defaults. Options persist per tool for the viewer's life. */
  defaultOptions?: O
  activate(ctx: ToolContext): void
  deactivate(): void
  /**
   * Runs in the capture phase, before the overlay sees the press. `annotationId` is set when
   * the press landed on an annotation; the overlay then selects and activates it (text markup
   * on a click, other types on the press), so tools other than the select tools should ignore
   * such presses. Calling `e.stopPropagation()` here keeps the overlay from handling it.
   * Return true when the press starts a gesture: the controller then captures the pointer
   * until it is released or cancelled.
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
  /** Switches to the tool, first merging `options` into its options. */
  set(id: ToolId, options?: object): void
  /** Merges `patch` into a tool's options without switching to it. */
  setOptions(id: ToolId, patch: object): void
  options(id: ToolId): Readable<object>
  destroy(): void
}

export interface ToolControllerOptions {
  /** The controller adds `options`; `toolStyle` defaults to one of the controller's own. */
  ctx: Omit<ToolContext, 'toolStyle' | 'options'> & { toolStyle?: ToolStyle }
  /** Default `'select-text'`. */
  initial?: ToolId
  tools: Tool[]
  /**
   * Where options live. Pass the same registry to each controller that replaces another (a
   * rebuild) so options persist; by default the controller keeps its own.
   */
  options?: ToolOptions
}

/** Host-relative CSS point for a client point. */
export function cssIn(host: HTMLElement, e: { clientX: number; clientY: number }): Point {
  const r = host.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

/** Like `cssIn`, clamped to the host's box, so a drag past the page edge stops at the edge. */
export function clampedCssIn(
  host: HTMLElement,
  e: { clientX: number; clientY: number }
): Point {
  const r = host.getBoundingClientRect()
  return {
    x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
    y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
  }
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
  const byId = new Map(opts.tools.map((t) => [t.id, t]))
  const active = writable<ToolId>(opts.initial ?? 'select-text')
  let current: Tool | undefined
  const registry = opts.options ?? createToolOptions()
  registry.register(opts.tools)
  const ctx: ToolContext = {
    ...opts.ctx,
    toolStyle:
      opts.ctx.toolStyle ??
      createToolStyle({
        store: opts.ctx.store,
        history: opts.ctx.history ?? { batch: (fn) => fn() },
        activeGroup: () => current?.styleGroup,
        active,
      }),
    // `current` is the activating tool already, so `activate` reads its own options.
    options: <O extends object>() => registry.get(current?.id ?? active.get()) as O,
  }
  const originalCursor = ctx.root.style.cursor
  /** The pointer between a primary press and its release or cancel. */
  let pressed: number | undefined
  /** Pointers whose release belongs to a tool that is no longer active. */
  const swallow = new Set<number>()

  /** True for events from a pointer other than the one whose press is live. */
  const foreign = (e: PointerEvent): boolean =>
    pressed !== undefined && pressed !== e.pointerId

  const onDown = (e: PointerEvent): void => {
    if (!e.isPrimary || e.button !== 0 || inCustomContent(e.target)) return
    // One gesture at a time: a second pointer pressing mid-gesture is ignored.
    if (foreign(e)) return
    swallow.delete(e.pointerId)
    pressed = e.pointerId
    const target = e.target instanceof Element ? e.target : null
    const annotationId =
      target?.closest('[data-annotation]')?.getAttribute('data-annotation') ?? undefined
    if (current?.onPointerDown?.(e, hitFor(ctx, e), annotationId) === true)
      capture(e.pointerId)
  }
  const onMove = (e: PointerEvent): void => {
    if (!e.isPrimary || foreign(e)) return
    // A buttonless move means the release was missed: the press is over (tools drop their
    // own gesture on the same signal), so another pointer may press again.
    if (pressed === e.pointerId && e.buttons === 0) pressed = undefined
    current?.onPointerMove?.(e, hitFor(ctx, e))
  }
  const onUp = (e: PointerEvent): void => {
    if (!e.isPrimary || e.button !== 0 || foreign(e)) return
    if (pressed === e.pointerId) pressed = undefined
    if (swallow.delete(e.pointerId)) {
      release(e.pointerId)
      return
    }
    current?.onPointerUp?.(e, hitFor(ctx, e))
    release(e.pointerId)
  }
  const onCancel = (e: PointerEvent): void => {
    if (!e.isPrimary || foreign(e)) return
    // Capture is also lost when a completed release frees it: only a live press cancels.
    if (e.type === 'lostpointercapture' && pressed !== e.pointerId) return
    if (pressed === e.pointerId) pressed = undefined
    swallow.delete(e.pointerId)
    current?.onPointerCancel?.(e)
  }
  const onKey = (e: KeyboardEvent): void => {
    if (inCustomContent(e.target)) return
    current?.onKeyDown?.(e)
    // Enter that no tool took edits the one selected text box, wherever focus is in the viewport.
    if (isViewportEnter(e, ctx.root)) editSelectedText(e)
  }
  function editSelectedText(e: KeyboardEvent): void {
    const selected = ctx.store.selection.get()
    if (selected.length !== 1) return
    const id = selected[0]!
    const a = ctx.store.get(id)
    const el = ctx.root.querySelector<HTMLElement>(
      `[data-annotation="${CSS.escape(id)}"]`
    )
    if (!canEditFreeText(a, el) || !el) return
    e.preventDefault()
    editFreeTextIn(ctx.store, el, id, ctx.viewport.transformFor(a.page))
  }

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

  function set(id: ToolId, options?: object): void {
    const next = byId.get(id)
    if (!next) throw new RangeError(`Unknown tool ${id}`)
    if (options) registry.merge(id, options)
    if (pressed !== undefined) {
      // Mid-press: end the old tool's gesture here and keep its release from the new tool.
      current?.onPointerCancel?.(
        new PointerEvent('pointercancel', { pointerId: pressed, isPrimary: true })
      )
      swallow.add(pressed)
      pressed = undefined
    }
    current?.deactivate()
    current = next
    next.activate(ctx)
    ctx.root.dataset.inkTool = id
    ctx.root.style.cursor = next.cursor
    active.set(id)
  }
  set(opts.initial ?? 'select-text')

  return {
    active: readonly(active),
    set,
    setOptions(id, patch) {
      if (!byId.has(id)) throw new RangeError(`Unknown tool ${id}`)
      registry.merge(id, patch)
    },
    options(id) {
      if (!byId.has(id)) throw new RangeError(`Unknown tool ${id}`)
      return registry.readable(id)
    },
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
      ctx.root.style.cursor = originalCursor
    },
  }
}

/**
 * True for an unmodified, unhandled Enter on the viewport's own elements: the scroll element
 * (`root`), a page host, or content of a page's text layer or canvas layer. Every other target
 * (annotations, custom slot content, any control a host puts in the page) keeps its Enter.
 * This is the keyboard trigger for the creation tools.
 */
export function isViewportEnter(e: KeyboardEvent, root: HTMLElement): boolean {
  if (e.key !== 'Enter' || e.defaultPrevented) return false
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing) return false
  const target = e.target
  if (target === root) return true
  if (!(target instanceof Element) || !root.contains(target)) return false
  if (target.matches('.ink-page[data-page]')) return true
  return target.closest('[data-ink-text-layer], [data-ink-canvas-layer]') !== null
}

/**
 * True for a target inside a custom annotation element (`data-custom`) but not that element
 * itself: the host's buttons and inputs there own their presses and keys, as in the overlay.
 */
function inCustomContent(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  // A free-text editor's presses and keys are its own, too.
  if (target.closest('[data-ink-editor]')) return true
  const el = target.closest('[data-annotation]')
  return (
    el !== null &&
    el !== target &&
    el.hasAttribute('data-custom') &&
    // Resize handles are the overlay's, not the host's content.
    target.closest('[data-handle]') === null
  )
}
