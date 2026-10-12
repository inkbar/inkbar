// The marquee is `position:absolute; pointer-events:none` with left/top/width/height from the
// drag, and a moving annotation is shown with a temporary `transform: translate(...)` on its
// overlay element. Both are geometry; the marquee's look comes from the theme.
import {
  rectFromPoints,
  rectsIntersect,
  translateQuad,
  translateRect,
} from '../../model/geometry'

import { cssIn, type PageHit, type Tool, type ToolContext } from './controller'

import type { Annotation } from '../../model/annotations/types'
import type { Point } from '../../model/geometry'

/** Pointer travel, CSS px, before a press on an annotation becomes a move. */
const DRAG_THRESHOLD = 3

type Mode =
  | { kind: 'idle' }
  | { kind: 'press'; id: string; start: PageHit }
  | { kind: 'move'; id: string; start: PageHit; el: HTMLElement | undefined }
  | { kind: 'marquee'; start: PageHit; el: HTMLElement; additive: boolean }

export function selectTool(): Tool {
  let ctx: ToolContext | undefined
  let mode: Mode = { kind: 'idle' }

  const reset = (): void => {
    if (mode.kind === 'marquee') mode.el.remove()
    if (mode.kind === 'move' && mode.el) mode.el.style.transform = ''
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
      // No button down: the release was missed, so drop the gesture.
      if (e.buttons === 0) {
        reset()
        return
      }
      const { start } = mode
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
      if (current.kind === 'move') {
        const { start } = current
        const end = start.transform.fromCss(cssIn(start.host, e))
        const a = ctx.store.get(current.id)
        if (a && !a.locked)
          ctx.store.update(a.id, moved(a, end.x - start.user.x, end.y - start.user.y))
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

const shift = (p: Point, dx: number, dy: number): Point => ({ x: p.x + dx, y: p.y + dy })

/** The geometry patch that translates `a` by (dx, dy) in user space. */
function moved(a: Annotation, dx: number, dy: number): Partial<Annotation> {
  const patch: Record<string, unknown> = { rect: translateRect(a.rect, dx, dy) }
  if ('quads' in a && a.quads) patch.quads = a.quads.map((q) => translateQuad(q, dx, dy))
  if ('callout' in a && a.callout) patch.callout = a.callout.map((p) => shift(p, dx, dy))
  switch (a.type) {
    case 'line':
      patch.start = shift(a.start, dx, dy)
      patch.end = shift(a.end, dx, dy)
      break
    case 'polyline':
    case 'polygon':
      patch.vertices = a.vertices.map((p) => shift(p, dx, dy))
      break
    case 'ink':
      patch.paths = a.paths.map((path) => path.map((p) => shift(p, dx, dy)))
      break
    default:
  }
  return patch
}
