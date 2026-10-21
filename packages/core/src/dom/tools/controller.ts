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
//
// A one-shot tool (`kind: 'one-shot'`) is used once, then hands back to `select-text`. It is
// ready until it reports what it made (`ctx.made`), then made, with `data-ink-made` on the
// root. A press on empty page (a page or a gap between pages, not a scroll bar) while made, or
// Escape, ends it (`ctx.done`), and the tool never sees that press. A press on another annotation switches to `select-text` and goes to it, so
// the same press can drag: in either state, bar text markup, which switches only when made. Whether a press finds the tool
// made is read before anything the press itself does: on the window when it is created, or on
// the document once a free-text editor (which listens on the window) has committed. So a note
// dropped by the press that closes its popover still counts as made. Removing everything it
// made (Delete, undo, a controlled host refusing the add) returns the tool to ready; the
// selection moving to something else switches to `select-text`.
//
// While made, a press on a made item or on its handles goes to the controller's own selection
// editor (selection-edit.ts) instead of the tool, as under `select-text`: a drag moves it, a
// handle resizes it, a press inside a made text box reopens its editor, and the tool stays on
// and made. Escape in an editor on a made text box (opened that way, or by Enter or a
// double-click) commits and ends the tool, as in a new box. Delete and
// Backspace go to the selection editor too, so the made item can be removed without switching.
import { isTextMarkup } from '../../model/annotations/edit'
import {
  createToolStyle,
  type StyleGroup,
  type ToolStyle,
} from '../../model/annotations/tool-style'
import { readonly, writable, type Readable } from '../../model/readable'
import { canEditFreeText, editFreeTextIn, editorFor } from '../freetext-editor'

import { createToolOptions, type ToolOptions } from './options'
import { createSelectionEdit, type SelectionEdit } from './selection-edit'

import type { AnnotationStore } from '../../model/annotations/store'
import type { Point } from '../../model/geometry'
import type { SignatureLibrary } from '../../model/signatures'
import type { SelectionQuads } from '../selection'
import type { Viewport, ViewportHit } from '../viewport'
import type { IconNode } from '@inkbar/icons'

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
  | 'signature'
/** A built-in tool's id, or any id a host registers its own tool under. */
export type ToolId = BuiltinToolId | (string & {})

/**
 * A one-shot tool switches back to `select-text` once it has made something and the user moves
 * on; a sticky tool stays on. A tool without a kind is sticky.
 */
export type ToolKind = 'one-shot' | 'sticky'

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
  /** The signature templates the `signature` tool places. Without it, it places nothing. */
  signatures?: SignatureLibrary | undefined
  /**
   * A one-shot tool reports what it just made, already added and selected. Does nothing under
   * a sticky tool or with an empty list.
   */
  made(ids: readonly string[]): void
  /** Clears the selection and switches to `select-text`. */
  done(): void
}

export interface Tool<O extends object = object> {
  id: ToolId
  /** The accessible name a toolbar button shows for a tool core has no label for. */
  label?: string
  /** The icon a toolbar button shows for a tool core has no icon for. */
  icon?: IconNode
  /** Default sticky. */
  kind?: ToolKind
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
  /**
   * The controller adds `options`, `made` and `done`; `toolStyle` defaults to one of the
   * controller's own.
   */
  ctx: Omit<ToolContext, 'toolStyle' | 'options' | 'made' | 'done'> & {
    toolStyle?: ToolStyle
  }
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
    // Read through, as a spread copies a getter's value once: the host's library may change.
    get signatures() {
      return opts.ctx.signatures
    },
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
    made(ids) {
      if (current?.kind !== 'one-shot' || ids.length === 0) return
      clearMade()
      made = [...ids]
      ctx.root.dataset.inkMade = ''
      stopMade = [
        ctx.store.list.subscribe(checkMade),
        ctx.store.selection.subscribe(checkMade),
      ]
    },
    done() {
      clearMade()
      ctx.store.select([])
      set('select-text')
    },
  }
  const originalCursor = ctx.root.style.cursor
  /** The pointer between a primary press and its release or cancel. */
  let pressed: number | undefined
  /** Pointers whose release belongs to a tool that is no longer active. */
  const swallow = new Set<number>()
  /** What the active one-shot tool made; undefined while it is ready. */
  let made: string[] | undefined
  let stopMade: (() => void)[] = []
  /** Whether the press now under way found the tool made (see the top of the file). */
  let pressFoundMade = false
  /** Moves and resizes what the active one-shot tool made. */
  let madeEdit: SelectionEdit | undefined
  /** The press now under way went to `madeEdit`, not the tool. */
  let editingMade = false

  function clearMade(): void {
    stopMade.forEach((stop) => stop())
    stopMade = []
    made = undefined
    delete ctx.root.dataset.inkMade
  }
  /** Leaves the made state when its items are gone, or switches when the selection moved on. */
  function checkMade(): void {
    if (!made) return
    const store = ctx.store
    if (!made.some((id) => (store.get(id) ?? store._getProposed(id)) !== undefined)) {
      clearMade()
      return
    }
    const selected = store.selection.get()
    if (!made.some((id) => selected.includes(id))) set('select-text')
  }

  /** True for events from a pointer other than the one whose press is live. */
  const foreign = (e: PointerEvent): boolean =>
    pressed !== undefined && pressed !== e.pointerId

  const readFirst = (): void => {
    pressFoundMade = made !== undefined
  }
  const readAfterEditor = (): void => {
    pressFoundMade ||= made !== undefined
  }
  const onDown = (e: PointerEvent): void => {
    if (!e.isPrimary || e.button !== 0 || inCustomContent(e.target)) return
    // One gesture at a time: a second pointer pressing mid-gesture is ignored.
    if (foreign(e)) return
    swallow.delete(e.pointerId)
    const target = e.target instanceof Element ? e.target : null
    const annotationId =
      target?.closest('[data-annotation]')?.getAttribute('data-annotation') ?? undefined
    if (current?.kind === 'one-shot') {
      // Empty page is a page or the gaps between pages, not the viewport's own scroll bars.
      if (pressFoundMade && annotationId === undefined && !onScrollBar(e, ctx.root)) {
        // No text selection starts. The press still bubbles, so a host's popover sees a
        // press outside it and closes.
        e.preventDefault()
        // The release belongs to no tool.
        swallow.add(e.pointerId)
        ctx.done()
        return
      }
      const a = annotationId === undefined ? undefined : ctx.store.get(annotationId)
      if (a && made?.includes(a.id) && madeEdit) {
        pressed = e.pointerId
        editingMade = true
        if (madeEdit.onPointerDown(e, hitFor(ctx, e), a.id) === true) capture(e.pointerId)
        return
      }
      // Text markup counts as another annotation once the tool has made something; while it
      // is ready the tool may claim the press (area redaction draws from it).
      if (a && (!isTextMarkup(a) || pressFoundMade)) set('select-text')
    }
    pressed = e.pointerId
    if (current?.onPointerDown?.(e, hitFor(ctx, e), annotationId) === true)
      capture(e.pointerId)
  }
  const onMove = (e: PointerEvent): void => {
    if (!e.isPrimary || foreign(e)) return
    // A buttonless move means the release was missed: the press is over (tools drop their
    // own gesture on the same signal), so another pointer may press again.
    const missed = pressed === e.pointerId && e.buttons === 0
    if (missed) pressed = undefined
    if (editingMade) {
      madeEdit?.onPointerMove(e, hitFor(ctx, e))
      if (missed) editingMade = false
      return
    }
    current?.onPointerMove?.(e, hitFor(ctx, e))
  }
  const onUp = (e: PointerEvent): void => {
    if (!e.isPrimary || e.button !== 0 || foreign(e)) return
    if (pressed === e.pointerId) pressed = undefined
    if (swallow.delete(e.pointerId)) {
      release(e.pointerId)
      return
    }
    if (editingMade) {
      editingMade = false
      madeEdit?.onPointerUp(e, hitFor(ctx, e))
    } else current?.onPointerUp?.(e, hitFor(ctx, e))
    release(e.pointerId)
  }
  const onCancel = (e: PointerEvent): void => {
    if (!e.isPrimary || foreign(e)) return
    // Capture is also lost when a completed release frees it: only a live press cancels.
    if (e.type === 'lostpointercapture' && pressed !== e.pointerId) return
    if (pressed === e.pointerId) pressed = undefined
    swallow.delete(e.pointerId)
    if (editingMade) {
      editingMade = false
      madeEdit?.onPointerCancel()
    } else current?.onPointerCancel?.(e)
  }
  const onKey = (e: KeyboardEvent): void => {
    if (inCustomContent(e.target)) return
    if (made && e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault()
      ctx.done()
      return
    }
    if (made && (e.key === 'Delete' || e.key === 'Backspace')) {
      madeEdit?.onKeyDown(e)
      return
    }
    current?.onKeyDown?.(e)
    // Enter that no tool took edits the one selected text box, wherever focus is in the viewport.
    if (isViewportEnter(e, ctx.root)) editSelectedText(e)
  }
  /**
   * Escape in an editor on a made text box, however it was opened (a press inside, Enter, a
   * double-click): commits and ends the tool. Captured, as the editor keeps its keys to itself.
   */
  const onEditorEscape = (e: KeyboardEvent): void => {
    if (!made || e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return
    const target = e.target instanceof Element ? e.target : null
    if (!target?.closest('[data-ink-editor]')) return
    const el = target.closest<HTMLElement>('[data-annotation]')
    const id = el?.getAttribute('data-annotation')
    if (!el || !id || !made.includes(id)) return
    e.preventDefault()
    e.stopPropagation()
    editorFor(el)?.close(true)
    ctx.done()
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
  const doc = ctx.root.ownerDocument
  doc.defaultView?.addEventListener('pointerdown', readFirst, { capture: true })
  doc.addEventListener('pointerdown', readAfterEditor, { capture: true })
  ctx.root.addEventListener('pointerdown', onDown, { capture: true })
  ctx.root.addEventListener('pointermove', onMove)
  ctx.root.addEventListener('pointerup', onUp)
  ctx.root.addEventListener('pointercancel', onCancel)
  ctx.root.addEventListener('lostpointercapture', onCancel)
  ctx.root.addEventListener('keydown', onKey)
  ctx.root.addEventListener('keydown', onEditorEscape, { capture: true })

  function set(id: ToolId, options?: object): void {
    const next = byId.get(id)
    if (!next) throw new RangeError(`Unknown tool ${id}`)
    if (options) registry.merge(id, options)
    if (pressed !== undefined) {
      // Mid-press: end the old tool's gesture here and keep its release from the new tool.
      if (editingMade) madeEdit?.onPointerCancel()
      else
        current?.onPointerCancel?.(
          new PointerEvent('pointercancel', { pointerId: pressed, isPrimary: true })
        )
      swallow.add(pressed)
      pressed = undefined
    }
    editingMade = false
    madeEdit?.reset()
    current?.deactivate()
    // After `deactivate`, which may commit an open edit and report it made.
    clearMade()
    current = next
    madeEdit = next.kind === 'one-shot' ? createSelectionEdit(ctx) : undefined
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
      madeEdit?.reset()
      madeEdit = undefined
      current?.deactivate()
      clearMade()
      current = undefined
      doc.defaultView?.removeEventListener('pointerdown', readFirst, { capture: true })
      doc.removeEventListener('pointerdown', readAfterEditor, { capture: true })
      ctx.root.removeEventListener('pointerdown', onDown, { capture: true })
      ctx.root.removeEventListener('pointermove', onMove)
      ctx.root.removeEventListener('pointerup', onUp)
      ctx.root.removeEventListener('pointercancel', onCancel)
      ctx.root.removeEventListener('lostpointercapture', onCancel)
      ctx.root.removeEventListener('keydown', onKey)
      ctx.root.removeEventListener('keydown', onEditorEscape, { capture: true })
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
 * True for a press on `root` itself outside its client area: on a scroll bar (or its border).
 * Client coordinates only, so a synthetic press gives the same answer as a real one.
 */
function onScrollBar(e: PointerEvent, root: HTMLElement): boolean {
  if (e.target !== root) return false
  const r = root.getBoundingClientRect()
  const x = e.clientX - r.left - root.clientLeft
  const y = e.clientY - r.top - root.clientTop
  return x < 0 || y < 0 || x >= root.clientWidth || y >= root.clientHeight
}

/**
 * True for a target inside a custom annotation element (`data-custom`) but not that element
 * itself: the host's buttons and inputs there own their presses and keys, as in the overlay.
 */
function inCustomContent(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  // A free-text editor's presses and keys are its own, too, and so are a plugin layer's
  // marks. The layer element itself lets presses through to the page underneath.
  if (target.closest('[data-ink-editor]')) return true
  const layer = target.closest('.ink-plugin-layer')
  if (layer && layer !== target) return true
  const el = target.closest('[data-annotation]')
  return (
    el !== null &&
    el !== target &&
    el.hasAttribute('data-custom') &&
    // Resize handles are the overlay's, not the host's content.
    target.closest('[data-handle]') === null
  )
}
