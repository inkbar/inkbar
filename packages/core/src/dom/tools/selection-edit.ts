// Move, resize and marquee for the two select tools.
//
// The marquee is `position:absolute; pointer-events:none` with left/top/width/height from the
// drag. Moving annotations are shown with a temporary `transform: translate(...)` on their
// overlay elements; a resizing one with `translate(...) scale(...)` from a `0 0` origin. A line
// whose end is being dragged is hidden (`visibility`) and drawn into a temporary
// `pointer-events:none` preview element beside it. All of these are geometry; their look comes
// from the theme.
//
// Resize: a press on one of the overlay's corner handles (`[data-handle=nw|ne|sw|se]`, drawn
// on a selected, unlocked annotation) drags that CSS corner while the opposite one stays put.
// The new box is converted back to user space once, on release, and the annotation's rect and
// points are scaled onto it in one `store.update`. Neither side goes below 1 pt. `Shift`, or
// a type that always keeps its aspect (`keepsAspect`), keeps the box's aspect ratio. A free
// text's corners are its text box's: the box takes the new size and `rect` and `fringe` are
// refit around it (`resizedBox`). One with a fringe or a callout is shown resizing in a
// preview element, as a line end is, since scaling its element would stretch the callout too.
//
// Line ends: a press on `[data-handle=start|end]` drags that end; the other stays put. A
// callout's tip (`[data-handle=callout]`) drags the same way and moves `callout[0]` only, the
// text box staying where it is (`movedTip`).
//
// Move: dragging a pressed annotation moves it, or, when it belongs to the selection, every
// selected unlocked annotation, in one history step.
//
// Text boxes: a press inside one that can be edited (`canEditFreeText`) selects it and, on the
// release, opens its editor with the caret where the press landed; it never moves the box. The
// box moves by the band along its edge (`[data-ink-edge]`), or a speech bubble by its outline
// and tail, as any annotation does. A locked or embedded box only selects.
//
// Under select-text, text markup is left to the overlay: a drag across it selects text, a
// click selects it, and a press on empty space clears the annotation selection and starts a
// text selection (Shift keeps it). Rectangle select (`marquee`) handles markup like any other
// annotation and draws a marquee on empty space.
import { freeTextBox } from '../../model/annotations/callout'
import {
  MIN_SIZE,
  hasCallout,
  hasCornerHandles,
  hasRectGeometry,
  isTextMarkup,
  keepsAspect,
  movedEndpoint,
  movedTip,
  resizedBox,
  scaled,
  translated,
} from '../../model/annotations/edit'
import { withoutReplies } from '../../model/annotations/threads'
import { rectFromPoints, rectsIntersect } from '../../model/geometry'
import { canEditFreeText, editFreeTextIn, editorFor } from '../freetext-editor'
import { annotationBox, handleBox, renderAnnotationContent } from '../overlay-render'

import { cssIn, type PageHit, type ToolContext } from './controller'

import type { Annotation } from '../../model/annotations/types'
import type { Point, Rect } from '../../model/geometry'
import type { EditorCloseReason } from '../freetext-editor'
import type { CssRect, PageTransform } from '../transform'

type Corner = 'nw' | 'ne' | 'sw' | 'se'
type End = 'start' | 'end' | 'callout'
const CORNERS: readonly string[] = ['nw', 'ne', 'sw', 'se']
const ENDS: readonly string[] = ['start', 'end']
const CALLOUT = 'callout'

/** Pointer travel, CSS px, before a press on an annotation becomes a move. */
const DRAG_THRESHOLD = 3

type Mode =
  | { kind: 'idle' }
  | {
      kind: 'press'
      id: string
      start: PageHit
      /** Pressed a member of a multi-selection: a click narrows the selection to it. */
      narrow: boolean
    }
  | { kind: 'move'; ids: string[]; start: PageHit; els: HTMLElement[] }
  | {
      kind: 'edit'
      id: string
      start: PageHit
      /** Where the press landed, for the caret. */
      caret: { clientX: number; clientY: number }
    }
  | { kind: 'marquee'; start: PageHit; el: HTMLElement; additive: boolean }
  | {
      kind: 'resize'
      id: string
      start: PageHit
      corner: Corner
      /** The annotation's CSS box when the press began. */
      box: CssRect
      el: HTMLElement | undefined
      /** Keeps its aspect ratio whatever the modifier keys. */
      locked: boolean
      /** Where the resized annotation is drawn instead of scaling `el`, for a free text. */
      preview: HTMLElement | undefined
    }
  | {
      kind: 'endpoint'
      id: string
      start: PageHit
      which: End
      /** Where the dragged end was when the press began, CSS px. */
      from: Point
      el: HTMLElement | undefined
      preview: HTMLElement
    }

export interface SelectionEdit {
  onPointerDown(e: PointerEvent, hit: PageHit | undefined, id?: string): boolean | void
  onPointerMove(e: PointerEvent, hit: PageHit | undefined): void
  onPointerUp(e: PointerEvent, hit: PageHit | undefined): void
  onPointerCancel(): void
  /** `Escape` clears the selection; `Delete` and `Backspace` remove the unlocked selected. */
  onKeyDown(e: KeyboardEvent): void
  /** Drops any gesture in progress without writing. */
  reset(): void
}

export interface SelectionEditOptions {
  /** A press on empty space draws a marquee (rectangle select). Otherwise it is left alone. */
  marquee?: boolean
  /** A text box editor opened by a press inside the box has closed, for `how`. */
  onEditorClose?(how: EditorCloseReason): void
}

export function createSelectionEdit(
  ctx: ToolContext,
  opts: SelectionEditOptions = {}
): SelectionEdit {
  let mode: Mode = { kind: 'idle' }
  const batch = (fn: () => void): void => (ctx.history ? ctx.history.batch(fn) : fn())

  const reset = (): void => {
    if (mode.kind === 'marquee') mode.el.remove()
    if (mode.kind === 'move') {
      for (const el of mode.els) el.style.transform = ''
      ctx.root.removeAttribute('data-ink-dragging')
    }
    if (mode.kind === 'resize' && mode.el) {
      mode.el.style.transform = ''
      mode.el.style.transformOrigin = ''
      mode.el.style.visibility = ''
    }
    if (mode.kind === 'resize') mode.preview?.remove()
    if (mode.kind === 'endpoint') {
      mode.preview.remove()
      if (mode.el) mode.el.style.visibility = ''
    }
    mode = { kind: 'idle' }
  }

  const elementIn = (root: ParentNode, id: string): HTMLElement | undefined =>
    root.querySelector<HTMLElement>(`[data-annotation="${CSS.escape(id)}"]`) ?? undefined

  const previewFor = (host: HTMLElement, a: Annotation): HTMLElement => {
    const preview = host.ownerDocument.createElement('div')
    preview.className = 'ink-annotation ink-edit-preview'
    preview.dataset.inkPreview = ''
    preview.dataset.type = a.type
    preview.style.cssText = 'position:absolute;pointer-events:none;'
    return preview
  }

  /** Shows `draft` in `preview` beside `el`, which is hidden meanwhile. */
  const showPreview = (
    preview: HTMLElement,
    el: HTMLElement | undefined,
    draft: Annotation,
    start: PageHit
  ): void => {
    drawPreview(preview, draft, start)
    if (el) el.style.visibility = 'hidden'
    // Beside the annotation in the overlay, so it paints where the annotation does.
    if (!preview.isConnected) (el?.parentElement ?? start.host).append(preview)
  }

  function startHandle(
    e: PointerEvent,
    hit: PageHit,
    a: Annotation,
    handle: string
  ): boolean {
    const el = elementIn(hit.host, a.id)
    if (CORNERS.includes(handle) && hasCornerHandles(a)) {
      const text = a.type === 'freetext'
      mode = {
        kind: 'resize',
        id: a.id,
        start: hit,
        corner: handle as Corner,
        box: text ? hit.transform.toCssRect(freeTextBox(a)) : handleBox(a, hit.transform),
        el,
        locked: keepsAspect(a),
        preview:
          text && (a.fringe !== undefined || hasCallout(a))
            ? previewFor(hit.host, a)
            : undefined,
      }
    } else if (
      (ENDS.includes(handle) && a.type === 'line') ||
      (handle === CALLOUT && hasCallout(a))
    ) {
      const preview = previewFor(hit.host, a)
      mode = {
        kind: 'endpoint',
        id: a.id,
        start: hit,
        which: handle as End,
        from: hit.transform.toCss(endOf(a, handle as End)!),
        el,
        preview,
      }
    } else {
      return false
    }
    // The annotation is already selected (it has handles): keep the overlay from
    // re-activating it.
    e.stopPropagation()
    e.preventDefault()
    return true
  }

  return {
    reset,
    onPointerDown(e, hit, annotationId) {
      if (!hit) return
      reset()
      if (annotationId !== undefined) {
        const a = ctx.store.get(annotationId)
        if (!a) return
        // Under select-text, text markup lets a drag through to text selection and the overlay
        // selects it on a click. Rectangle select treats it as any other annotation: it selects
        // on the press and a drag moves it, so it claims the press from the overlay.
        const markup = isTextMarkup(a)
        if (markup && !opts.marquee) return
        const handle = handleOf(e.target)
        if (handle !== undefined && !a.locked && startHandle(e, hit, a, handle))
          return true
        const selected = ctx.store.selection.get()
        if (e.shiftKey) {
          // Toggle membership ourselves; the overlay would replace the selection.
          e.stopPropagation()
          ctx.store.select(
            selected.includes(annotationId)
              ? selected.filter((s) => s !== annotationId)
              : [...selected, annotationId]
          )
          return
        }
        if (inText(e.target) && canEditFreeText(a, elementIn(hit.host, annotationId))) {
          // Selected here, not by the overlay, which would also take the press for a move.
          e.stopPropagation()
          ctx.store.select([annotationId])
          ctx.onActivate?.(annotationId)
          mode = {
            kind: 'edit',
            id: annotationId,
            start: hit,
            caret: { clientX: e.clientX, clientY: e.clientY },
          }
          e.preventDefault()
          return true
        }
        const narrow = selected.length > 1 && selected.includes(annotationId)
        // A press on a member of the selection keeps the selection, so it can move as one.
        // Otherwise the overlay selects and activates it once this capture-phase handler
        // returns, except markup, which the overlay would hold until the release.
        if (narrow) e.stopPropagation()
        else if (markup) {
          e.stopPropagation()
          ctx.store.select([annotationId])
          ctx.onActivate?.(annotationId)
        }
        mode = { kind: 'press', id: annotationId, start: hit, narrow }
        e.preventDefault()
        return true
      }
      if (!opts.marquee) {
        // Select text: an empty press drops the annotation selection and is left alone, so a
        // text selection starts as usual. Shift keeps the selection.
        if (!e.shiftKey) ctx.store.select([])
        return
      }
      const el = hit.host.ownerDocument.createElement('div')
      el.className = 'ink-marquee'
      el.dataset.inkMarquee = ''
      el.style.cssText = `position:absolute;pointer-events:none;left:${hit.css.x}px;top:${hit.css.y}px;width:0;height:0;`
      hit.host.append(el)
      mode = { kind: 'marquee', start: hit, el, additive: e.shiftKey }
      if (!e.shiftKey) ctx.store.select([])
      e.preventDefault()
      return true
    },
    onPointerMove(e) {
      if (mode.kind === 'idle') return
      // No button down: the release was missed, so drop the gesture. So does a start host
      // that scrolling has unmounted.
      if (e.buttons === 0 || !mode.start.host.isConnected) {
        reset()
        return
      }
      const { start } = mode
      if (mode.kind === 'edit') return
      if (mode.kind === 'resize') {
        const { box, el, preview } = mode
        const next = resizeCss(box, mode.corner, cornerAt(mode, e), minCss(start), {
          aspect: mode.locked || e.shiftKey,
          page: start.transform,
        })
        if (preview) {
          const a = ctx.store.get(mode.id)
          if (a?.type !== 'freetext') return
          const draft = { ...a, ...resizedBox(a, userBox(start.transform, next)) }
          showPreview(preview, el, draft, start)
        } else if (el) {
          // The drawn box's corner within the element, which may be padded past it.
          const ox = box.left - (parseFloat(el.style.left) || 0)
          const oy = box.top - (parseFloat(el.style.top) || 0)
          el.style.transformOrigin = `${ox}px ${oy}px`
          el.style.transform =
            `translate(${next.left - box.left}px, ${next.top - box.top}px) ` +
            `scale(${next.width / box.width}, ${next.height / box.height})`
        }
        return
      }
      if (mode.kind === 'endpoint') {
        const a = ctx.store.get(mode.id)
        if (!a) return
        const patch = endPatch(a, mode.which, endAt(mode, e))
        if (!patch) return
        showPreview(mode.preview, mode.el, { ...a, ...patch } as Annotation, start)
        return
      }
      const css = cssIn(start.host, e)
      const dx = css.x - start.css.x
      const dy = css.y - start.css.y
      if (mode.kind === 'press') {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        const a = ctx.store.get(mode.id)
        if (!a || a.locked) {
          mode = { kind: 'idle' }
          return
        }
        const selected = ctx.store.selection.get()
        // Text markup is anchored to its text, and may carry a comment: it moves only when it
        // is what the drag pressed, never along with the rest of a selection.
        const pressed = mode.id
        const ids = selected.includes(pressed)
          ? selected.filter((id) => {
              const m = ctx.store.get(id)
              return m !== undefined && !m.locked && (id === pressed || !isTextMarkup(m))
            })
          : [pressed]
        const els = ids
          .map((id) => elementIn(ctx.root, id))
          .filter((el): el is HTMLElement => el !== undefined)
        mode = { kind: 'move', ids, start, els }
        // The theme shows the move cursor everywhere until the release.
        ctx.root.setAttribute('data-ink-dragging', '')
      }
      if (mode.kind === 'move') {
        for (const el of mode.els) el.style.transform = `translate(${dx}px, ${dy}px)`
        return
      }
      mode.el.style.left = `${Math.min(start.css.x, css.x)}px`
      mode.el.style.top = `${Math.min(start.css.y, css.y)}px`
      mode.el.style.width = `${Math.abs(dx)}px`
      mode.el.style.height = `${Math.abs(dy)}px`
    },
    onPointerCancel() {
      reset()
    },
    onPointerUp(e) {
      const current = mode
      reset()
      if (current.kind !== 'idle' && !current.start.host.isConnected) return
      switch (current.kind) {
        case 'press':
          // A click on a member of a multi-selection: just that one, as the overlay would.
          if (current.narrow) {
            ctx.store.select([current.id])
            ctx.onActivate?.(current.id)
          }
          return
        case 'edit': {
          // Opened on the release, so the press's own focus change has already happened.
          const el = elementIn(current.start.host, current.id)
          const a = ctx.store.get(current.id)
          if (!el || !canEditFreeText(a, el) || editorFor(el)) return
          editFreeTextIn(ctx.store, el, a.id, ctx.viewport.transformFor(a.page), {
            caret: current.caret,
            onClose: (how) => opts.onEditorClose?.(how),
          })
          return
        }
        case 'move': {
          const { start } = current
          const end = start.transform.fromCss(cssIn(start.host, e))
          const dx = end.x - start.user.x
          const dy = end.y - start.user.y
          batch(() => {
            for (const id of current.ids) {
              const a = ctx.store.get(id)
              if (a && !a.locked) ctx.store.update(id, translated(a, dx, dy))
            }
          })
          return
        }
        case 'resize': {
          const { start, box } = current
          const next = resizeCss(
            box,
            current.corner,
            cornerAt(current, e),
            minCss(start),
            {
              aspect: current.locked || e.shiftKey,
              page: start.transform,
            }
          )
          if (
            next.left === box.left &&
            next.top === box.top &&
            next.width === box.width &&
            next.height === box.height
          )
            return
          const a = ctx.store.get(current.id)
          if (!a || a.locked) return
          const to = userBox(start.transform, next)
          if (a.type === 'freetext') {
            ctx.store.update(a.id, resizedBox(a, to))
            return
          }
          // A rect-shaped annotation's box is its rect; a point-based one's is its drawn box.
          const from = hasRectGeometry(a) ? a.rect : start.transform.fromCssRect(box)
          ctx.store.update(a.id, scaled(a, from, to))
          return
        }
        case 'endpoint': {
          const a = ctx.store.get(current.id)
          if (!a || a.locked) return
          const css = cssIn(current.start.host, e)
          if (css.x === current.start.css.x && css.y === current.start.css.y) return
          const patch = endPatch(a, current.which, endAt(current, e))
          if (patch) ctx.store.update(a.id, patch)
          return
        }
        case 'marquee': {
          const { start } = current
          const box = rectFromPoints(
            start.user,
            start.transform.fromCss(cssIn(start.host, e))
          )
          if (box.width === 0 && box.height === 0) return
          // Replies have no element on the page, so a marquee never picks them.
          const ids = withoutReplies(ctx.store.list.get())
            .filter((a) => a.page === start.page && rectsIntersect(a.rect, box))
            .map((a) => a.id)
          ctx.store.select(
            current.additive ? [...new Set([...ctx.store.selection.get(), ...ids])] : ids
          )
          return
        }
        default:
      }
    },
    onKeyDown(e) {
      if (e.key === 'Escape') {
        reset()
        ctx.store.select([])
        return
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      // A focused annotation's overlay element owns the key (it removes that one annotation
      // and prevents the default); deleting the selection too would double-handle it.
      if (e.defaultPrevented) return
      const target = e.target instanceof Element ? e.target : null
      if (
        target?.closest(
          '[data-annotation], input, textarea, [contenteditable]:not([contenteditable="false"])'
        )
      )
        return
      for (const id of ctx.store.selection.get()) {
        if (ctx.store.get(id)?.locked !== true) ctx.store.remove(id)
      }
    },
  }
}

/** The handle (`nw`, `start`, ...) a press landed on, if it landed on one. */
function handleOf(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined
  return target.closest('[data-handle]')?.getAttribute('data-handle') ?? undefined
}

/** True when a press landed inside a free text's drawn text box. */
function inText(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.ink-free-text') !== null
}

/** The point a line's end or a callout's tip handle sits on. */
function endOf(a: Annotation, which: End): Point | undefined {
  if (which === 'callout') return hasCallout(a) ? a.callout[0] : undefined
  return a.type === 'line' ? a[which] : undefined
}

/** The patch that moves a line's end, or a callout's tip, to `to`; undefined for neither. */
function endPatch(a: Annotation, which: End, to: Point): Partial<Annotation> | undefined {
  if (which === 'callout') return hasCallout(a) ? movedTip(a, to) : undefined
  return a.type === 'line' ? movedEndpoint(a, which, to) : undefined
}

/** A resized CSS box in user space, at least `MIN_SIZE` a side. */
function userBox(t: PageTransform, css: CssRect): Rect {
  const r = t.fromCssRect(css)
  return {
    ...r,
    width: Math.max(MIN_SIZE, r.width),
    height: Math.max(MIN_SIZE, r.height),
  }
}

/** Draws `a` into the preview element at its own box. */
function drawPreview(el: HTMLElement, a: Annotation, start: PageHit): void {
  const box = annotationBox(a, start.transform)
  el.style.left = `${box.left}px`
  el.style.top = `${box.top}px`
  el.style.width = `${box.width}px`
  el.style.height = `${box.height}px`
  renderAnnotationContent(el, a, start.transform)
}

/** Keeps a CSS point on the page. */
function onPage(start: PageHit, x: number, y: number): Point {
  const { cssWidth, cssHeight } = start.transform
  return {
    x: Math.min(Math.max(x, 0), cssWidth),
    y: Math.min(Math.max(y, 0), cssHeight),
  }
}

/**
 * Where the dragged line end is now, in user space: where it started plus the pointer's
 * travel, kept on the page.
 */
function endAt(
  mode: { start: PageHit; from: Point },
  e: { clientX: number; clientY: number }
): Point {
  const { start, from } = mode
  const css = cssIn(start.host, e)
  return start.transform.fromCss(
    onPage(start, from.x + css.x - start.css.x, from.y + css.y - start.css.y)
  )
}

/**
 * Where the dragged corner is now: where it started plus the pointer's travel since the
 * press, kept on the page. Keeping the press's offset from the corner means a click on a
 * handle, with no drag, leaves the box as it was.
 */
function cornerAt(
  mode: { start: PageHit; box: CssRect; corner: Corner },
  e: { clientX: number; clientY: number }
): Point {
  const { start, box, corner } = mode
  const css = cssIn(start.host, e)
  const x = (corner[1] === 'w' ? box.left : box.left + box.width) + css.x - start.css.x
  const y = (corner[0] === 'n' ? box.top : box.top + box.height) + css.y - start.css.y
  return onPage(start, x, y)
}

/** `MIN_SIZE` points as CSS px on the press's page. */
function minCss(start: PageHit): number {
  return start.transform.toCssLength(MIN_SIZE)
}

/**
 * `box` with its `corner` dragged to `p` and the opposite corner fixed, at least `min` a side.
 * With `aspect`, the box keeps its proportions: it scales by the larger of the two axes'
 * changes, kept on the page.
 */
function resizeCss(
  box: CssRect,
  corner: Corner,
  p: Point,
  min: number,
  opts: { aspect: boolean; page: { cssWidth: number; cssHeight: number } }
): CssRect {
  const west = corner[1] === 'w'
  const north = corner[0] === 'n'
  /** The fixed corner. */
  const fx = west ? box.left + box.width : box.left
  const fy = north ? box.top + box.height : box.top
  let width = Math.max(west ? fx - p.x : p.x - fx, min)
  let height = Math.max(north ? fy - p.y : p.y - fy, min)
  if (opts.aspect && box.width > 0 && box.height > 0) {
    // Room from the fixed corner to the page edge the dragged corner moves towards.
    const roomX = west ? fx : opts.page.cssWidth - fx
    const roomY = north ? fy : opts.page.cssHeight - fy
    const lo = min / Math.min(box.width, box.height)
    const hi = Math.min(roomX / box.width, roomY / box.height)
    const s = Math.min(
      Math.max(width / box.width, height / box.height, lo),
      Math.max(hi, lo)
    )
    width = box.width * s
    height = box.height * s
  }
  return {
    left: west ? fx - width : fx,
    top: north ? fy - height : fy,
    width,
    height,
  }
}
