/*
 * Pinch zoom. Two touch pointers on the viewport's container scale the document around the
 * point between them. While the fingers are down nothing is re-laid out or re-rendered: a CSS
 * transform on the pages element previews the zoom, and the viewport commits one zoom change
 * when a finger lifts. All points here are container-relative CSS px.
 */
import type { Point } from '../model/geometry'

export interface PinchFrame {
  /** The zoom the pinch has reached, clamped to the viewport's limits. */
  zoom: number
  /** `zoom` over the zoom the pinch started at. */
  factor: number
  /** The midpoint between the fingers when the pinch started. */
  anchor: Point
  /** How far that midpoint has moved since. */
  pan: Point
}

const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

export function pinchFrame(
  start: readonly [Point, Point],
  now: readonly [Point, Point],
  startScale: number,
  minZoom: number,
  maxZoom: number
): PinchFrame {
  const from = Math.hypot(start[1].x - start[0].x, start[1].y - start[0].y)
  const to = Math.hypot(now[1].x - now[0].x, now[1].y - now[0].y)
  const zoom =
    from > 0 ? Math.min(maxZoom, Math.max(minZoom, (startScale * to) / from)) : startScale
  const anchor = midpoint(start[0], start[1])
  const mid = midpoint(now[0], now[1])
  return {
    zoom,
    factor: from > 0 ? zoom / startScale : 1,
    anchor,
    pan: { x: mid.x - anchor.x, y: mid.y - anchor.y },
  }
}

export interface ZoomPreview {
  /** Scales the pages by `factor` around `anchor`, then moves them by `pan`. */
  show(factor: number, anchor: Point, pan: Point): void
  clear(): void
  /** Shifts the pages by `offset`, then eases them back to where the layout puts them. */
  settle(offset: Point): void
  destroy(): void
}

const SETTLE_MS = 150

/**
 * The pinch preview: a transform on the pages element, which the browser composites without
 * laying anything out. `settle` covers what a preview can show but the committed layout
 * cannot reach (mainly scroll clamped at the content edges): the pages start where the fingers
 * left them and slide into place.
 */
export function createZoomPreview(
  container: HTMLElement,
  pagesEl: HTMLElement
): ZoomPreview {
  const win = container.ownerDocument.defaultView ?? window
  let frame = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function stopSettling(): void {
    if (frame) win.cancelAnimationFrame(frame)
    frame = 0
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    pagesEl.removeEventListener('transitionend', settled)
    pagesEl.style.removeProperty('transition')
  }

  function settled(): void {
    stopSettling()
    pagesEl.style.removeProperty('transform')
  }

  function clear(): void {
    stopSettling()
    pagesEl.style.removeProperty('transform')
    pagesEl.style.removeProperty('transform-origin')
  }

  return {
    show(factor, anchor, pan) {
      stopSettling()
      const x = anchor.x + container.scrollLeft - pagesEl.offsetLeft
      const y = anchor.y + container.scrollTop - pagesEl.offsetTop
      pagesEl.style.transformOrigin = `${x}px ${y}px`
      pagesEl.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${factor})`
    },
    clear,
    settle(offset) {
      clear()
      pagesEl.style.transform = `translate(${offset.x}px, ${offset.y}px)`
      frame = win.requestAnimationFrame(() => {
        frame = 0
        // Resolve the starting transform before the transition is set, so it animates from it.
        void getComputedStyle(pagesEl).transform
        pagesEl.style.transition = `transform ${SETTLE_MS}ms ease-out`
        pagesEl.style.removeProperty('transform')
        pagesEl.addEventListener('transitionend', settled)
        timer = setTimeout(settled, SETTLE_MS + 50)
      })
    },
    destroy: clear,
  }
}

export interface TouchPinchOptions {
  container: HTMLElement
  preview: ZoomPreview
  /** The effective zoom when a pinch starts. */
  scale(): number
  minZoom: number
  maxZoom: number
  /** Called once per pinch, when either finger lifts or is cancelled, after the preview clears. */
  commit(frame: PinchFrame): void
}

/**
 * Tracks touch pointers on the container. The first two down start a pinch; a third is
 * ignored. The pinch ends when either of its fingers lifts or is cancelled, and any finger
 * still down then starts nothing until every finger has lifted. The listeners are passive:
 * the container's `touch-action: pan-x pan-y` is what keeps the browser from zooming the page.
 */
export function attachTouchPinch(opts: TouchPinchOptions): { destroy(): void } {
  const { container, preview } = opts
  const down = new Map<number, Point>()
  let pinch:
    | { ids: [number, number]; start: [Point, Point]; scale: number; last: PinchFrame }
    | undefined
  let spent = false

  function at(e: PointerEvent): Point {
    const r = container.getBoundingClientRect()
    return {
      x: e.clientX - r.left - container.clientLeft,
      y: e.clientY - r.top - container.clientTop,
    }
  }

  const onDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return
    down.set(e.pointerId, at(e))
    if (pinch || spent || down.size !== 2) return
    const [[a, pa], [b, pb]] = [...down] as [[number, Point], [number, Point]]
    const start: [Point, Point] = [pa, pb]
    const scale = opts.scale()
    pinch = {
      ids: [a, b],
      start,
      scale,
      last: pinchFrame(start, start, scale, opts.minZoom, opts.maxZoom),
    }
  }

  const onMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch' || !down.has(e.pointerId)) return
    down.set(e.pointerId, at(e))
    if (!pinch || !pinch.ids.includes(e.pointerId)) return
    const now: [Point, Point] = [down.get(pinch.ids[0])!, down.get(pinch.ids[1])!]
    pinch.last = pinchFrame(pinch.start, now, pinch.scale, opts.minZoom, opts.maxZoom)
    preview.show(pinch.last.factor, pinch.last.anchor, pinch.last.pan)
  }

  const onUp = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch' || !down.delete(e.pointerId)) return
    if (pinch?.ids.includes(e.pointerId)) {
      const { last } = pinch
      pinch = undefined
      spent = true
      preview.clear()
      opts.commit(last)
    }
    if (down.size === 0) spent = false
  }

  const listen = { passive: true }
  container.addEventListener('pointerdown', onDown, listen)
  container.addEventListener('pointermove', onMove, listen)
  container.addEventListener('pointerup', onUp, listen)
  container.addEventListener('pointercancel', onUp, listen)

  return {
    destroy() {
      container.removeEventListener('pointerdown', onDown)
      container.removeEventListener('pointermove', onMove)
      container.removeEventListener('pointerup', onUp)
      container.removeEventListener('pointercancel', onUp)
      down.clear()
      pinch = undefined
    },
  }
}
