// The marquee is `position:absolute; pointer-events:none` with left/top/width/height from the
// drag, and a moving annotation is shown with a temporary `transform: translate(...)` on its
// overlay element; a resizing one with `translate(...) scale(...)` from a `0 0` origin. All
// are geometry; the marquee's look comes from the theme.
//
// Resize: a press on one of the overlay's corner handles (`[data-handle]`, drawn on a
// selected, unlocked rect-shaped annotation) drags that CSS corner while the opposite one
// stays put. The new box is converted back to user space once, on release, as one
// `store.update` of `rect`. Neither side goes below 1 pt.
import { MIN_SIZE, hasRectGeometry, translated } from '../../model/annotations/edit'
import { rectFromPoints, rectsIntersect } from '../../model/geometry'

import { cssIn, type PageHit, type Tool, type ToolContext } from './controller'

import type { Point } from '../../model/geometry'
import type { CssRect } from '../transform'

type Corner = 'nw' | 'ne' | 'sw' | 'se'
const CORNERS: readonly string[] = ['nw', 'ne', 'sw', 'se']

/** Pointer travel, CSS px, before a press on an annotation becomes a move. */
const DRAG_THRESHOLD = 3

type Mode =
  | { kind: 'idle' }
  | { kind: 'press'; id: string; start: PageHit }
  | { kind: 'move'; id: string; start: PageHit; el: HTMLElement | undefined }
  | { kind: 'marquee'; start: PageHit; el: HTMLElement; additive: boolean }
  | {
      kind: 'resize'
      id: string
      start: PageHit
      corner: Corner
      /** The annotation's CSS box when the press began. */
      box: CssRect
      el: HTMLElement | undefined
    }

export function selectTool(): Tool {
  let ctx: ToolContext | undefined
  let mode: Mode = { kind: 'idle' }

  const reset = (): void => {
    if (mode.kind === 'marquee') mode.el.remove()
    if ((mode.kind === 'move' || mode.kind === 'resize') && mode.el) {
      mode.el.style.transform = ''
      mode.el.style.transformOrigin = ''
    }
    mode = { kind: 'idle' }
  }

  return {
    id: 'select',
    cursor: 'default',
    activate(c) {
      ctx = c
    },
    deactivate() {
      reset()
      ctx = undefined
    },
    onPointerDown(e, hit, annotationId) {
      if (!ctx || !hit) return
      reset()
      if (annotationId !== undefined) {
        const corner = handleOf(e.target)
        const a = corner === undefined ? undefined : ctx.store.get(annotationId)
        if (corner !== undefined && a && !a.locked && hasRectGeometry(a)) {
          // The annotation is already selected (it has handles): keep the overlay from
          // re-activating it.
          e.stopPropagation()
          e.preventDefault()
          const el =
            hit.host.querySelector<HTMLElement>(
              `[data-annotation="${CSS.escape(annotationId)}"]`
            ) ?? undefined
          mode = {
            kind: 'resize',
            id: annotationId,
            start: hit,
            corner,
            box: hit.transform.toCssRect(a.rect),
            el,
          }
          return true
        }
        if (e.shiftKey) {
          // Toggle membership ourselves; the overlay would replace the selection.
          e.stopPropagation()
          const selected = ctx.store.selection.get()
          ctx.store.select(
            selected.includes(annotationId)
              ? selected.filter((s) => s !== annotationId)
              : [...selected, annotationId]
          )
          return
        }
        // The overlay selects and activates it once this capture-phase handler returns.
        mode = { kind: 'press', id: annotationId, start: hit }
        e.preventDefault()
        return true
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
      if (!ctx || mode.kind === 'idle') return
      // No button down: the release was missed, so drop the gesture. So does a start host
      // that scrolling has unmounted.
      if (e.buttons === 0 || !mode.start.host.isConnected) {
        reset()
        return
      }
      const { start } = mode
      if (mode.kind === 'resize') {
        const { box, el } = mode
        const next = resizeCss(box, mode.corner, cornerAt(mode, e), minCss(start))
        if (el) {
          el.style.transformOrigin = '0 0'
          el.style.transform =
            `translate(${next.left - box.left}px, ${next.top - box.top}px) ` +
            `scale(${next.width / box.width}, ${next.height / box.height})`
        }
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
        const el =
          start.host.querySelector<HTMLElement>(
            `[data-annotation="${CSS.escape(mode.id)}"]`
          ) ?? undefined
        mode = { kind: 'move', id: mode.id, start, el }
      }
      if (mode.kind === 'move') {
        if (mode.el) mode.el.style.transform = `translate(${dx}px, ${dy}px)`
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
      if (!ctx) return
      const current = mode
      reset()
      if (current.kind !== 'idle' && !current.start.host.isConnected) return
      if (current.kind === 'move') {
        const { start } = current
        const end = start.transform.fromCss(cssIn(start.host, e))
        const a = ctx.store.get(current.id)
        if (a && !a.locked)
          ctx.store.update(
            a.id,
            translated(a, end.x - start.user.x, end.y - start.user.y)
          )
      } else if (current.kind === 'resize') {
        const { start, box } = current
        const next = resizeCss(box, current.corner, cornerAt(current, e), minCss(start))
        if (
          next.left === box.left &&
          next.top === box.top &&
          next.width === box.width &&
          next.height === box.height
        )
          return
        const a = ctx.store.get(current.id)
        if (!a || a.locked) return
        const r = start.transform.fromCssRect(next)
        ctx.store.update(a.id, {
          rect: {
            ...r,
            width: Math.max(MIN_SIZE, r.width),
            height: Math.max(MIN_SIZE, r.height),
          },
        })
      } else if (current.kind === 'marquee') {
        const { start } = current
        const box = rectFromPoints(
          start.user,
          start.transform.fromCss(cssIn(start.host, e))
        )
        if (box.width === 0 && box.height === 0) return
        const ids = ctx.store
          .byPage(start.page)
          .filter((a) => rectsIntersect(a.rect, box))
          .map((a) => a.id)
        ctx.store.select(
          current.additive ? [...new Set([...ctx.store.selection.get(), ...ids])] : ids
        )
      }
    },
    onKeyDown(e) {
      if (!ctx) return
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

/** The corner of the resize handle a press landed on, if it landed on one. */
function handleOf(target: EventTarget | null): Corner | undefined {
  if (!(target instanceof Element)) return undefined
  const corner = target.closest('[data-handle]')?.getAttribute('data-handle')
  return corner && CORNERS.includes(corner) ? (corner as Corner) : undefined
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
  const { cssWidth, cssHeight } = start.transform
  return {
    x: Math.min(Math.max(x, 0), cssWidth),
    y: Math.min(Math.max(y, 0), cssHeight),
  }
}

/** `MIN_SIZE` points as CSS px on the press's page. */
function minCss(start: PageHit): number {
  return start.transform.toCssLength(MIN_SIZE)
}

/** `box` with its `corner` dragged to `p` and the opposite corner fixed, at least `min` a side. */
function resizeCss(box: CssRect, corner: Corner, p: Point, min: number): CssRect {
  let left = box.left
  let top = box.top
  let right = box.left + box.width
  let bottom = box.top + box.height
  if (corner[1] === 'w') left = Math.min(p.x, right - min)
  else right = Math.max(p.x, left + min)
  if (corner[0] === 'n') top = Math.min(p.y, bottom - min)
  else bottom = Math.max(p.y, top + min)
  return { left, top, width: right - left, height: bottom - top }
}
