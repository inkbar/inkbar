/*
 * Pinch zoom. Two fingers on the viewport's container scale the document around the
 * point between them. While the fingers are down nothing is re-laid out or re-rendered: a CSS
 * transform on the pages element previews the zoom, and the viewport commits one zoom change
 * when a finger lifts (or, for a trackpad pinch, when the events stop). All points here are container-relative CSS px.
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
    pagesEl.removeEventListener('transitionend', onTransitionEnd)
    pagesEl.style.removeProperty('transition')
  }

  function settled(): void {
    stopSettling()
    pagesEl.style.removeProperty('transform')
  }

  // Transitions inside the pages (a theme's, a host's) bubble here too.
  const onTransitionEnd = (e: TransitionEvent): void => {
    if (e.target === pagesEl && e.propertyName === 'transform') settled()
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
        pagesEl.addEventListener('transitionend', onTransitionEnd)
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
 * Tracks touches on the container with touch events, which every touch browser sends as one
 * stream (pointer events may be cancelled once the browser decides to pan). The first two
 * fingers down start a pinch; a third is ignored. The pinch ends when either of its fingers
 * lifts or is cancelled, and any finger still down then starts nothing until every finger has
 * lifted. While two fingers are down their moves are prevented, so the browser neither pans
 * nor zooms underneath; one finger's moves never are, so a one-finger scroll stays native.
 * The viewport claims pinch on the container (`touch-action: pan-x pan-y`), which keeps the
 * page from zooming as well; the tool controller turns off one-finger panning on the pages
 * element while a drag tool is ready, and two fingers still land here. A finger
 * that lands alone starts afresh, so an end the browser never sent leaves nothing behind.
 */
export function attachTouchPinch(opts: TouchPinchOptions): { destroy(): void } {
  const { container, preview } = opts
  let pinch:
    | { ids: [number, number]; start: [Point, Point]; scale: number; last: PinchFrame }
    | undefined
  let spent = false
  /** The touches that went down on the container, by identifier. */
  const mine = new Set<number>()
  const down = (list: TouchList): Touch[] =>
    [...list].filter((t) => mine.has(t.identifier))

  function at(t: Touch): Point {
    const r = container.getBoundingClientRect()
    return {
      x: t.clientX - r.left - container.clientLeft,
      y: t.clientY - r.top - container.clientTop,
    }
  }

  const onStart = (e: TouchEvent): void => {
    // Forget fingers that are no longer down anywhere: their end never reached the container.
    const live = new Set([...e.touches].map((t) => t.identifier))
    for (const id of mine) if (!live.has(id)) mine.delete(id)
    for (const t of e.changedTouches) mine.add(t.identifier)
    const fingers = down(e.touches)
    if (fingers.length === 1) {
      if (pinch) preview.clear()
      pinch = undefined
      spent = false
    }
    if (pinch || spent || fingers.length < 2) return
    const [a, b] = fingers as [Touch, Touch]
    const start: [Point, Point] = [at(a), at(b)]
    const scale = opts.scale()
    pinch = {
      ids: [a.identifier, b.identifier],
      start,
      scale,
      last: pinchFrame(start, start, scale, opts.minZoom, opts.maxZoom),
    }
  }

  const onMove = (e: TouchEvent): void => {
    if (down(e.touches).length >= 2 && e.cancelable) e.preventDefault()
    if (!pinch) return
    const ids = pinch.ids
    const touches = [...e.touches]
    const a = touches.find((t) => t.identifier === ids[0])
    const b = touches.find((t) => t.identifier === ids[1])
    if (!a || !b) return
    pinch.last = pinchFrame(
      pinch.start,
      [at(a), at(b)],
      pinch.scale,
      opts.minZoom,
      opts.maxZoom
    )
    preview.show(pinch.last.factor, pinch.last.anchor, pinch.last.pan)
  }

  const onEnd = (e: TouchEvent): void => {
    const ended = [...e.changedTouches].map((t) => t.identifier)
    for (const id of ended) mine.delete(id)
    if (pinch && pinch.ids.some((id) => ended.includes(id))) {
      const { last } = pinch
      pinch = undefined
      spent = true
      preview.clear()
      opts.commit(last)
    }
    if (down(e.touches).length === 0) spent = false
  }

  // Not passive: a two-finger move is prevented.
  const listen = { passive: false }
  container.addEventListener('touchstart', onStart, listen)
  container.addEventListener('touchmove', onMove, listen)
  container.addEventListener('touchend', onEnd, listen)
  container.addEventListener('touchcancel', onEnd, listen)

  return {
    destroy() {
      container.removeEventListener('touchstart', onStart)
      container.removeEventListener('touchmove', onMove)
      container.removeEventListener('touchend', onEnd)
      container.removeEventListener('touchcancel', onEnd)
      mine.clear()
      pinch = undefined
      spent = false
    },
  }
}

const WHEEL_STEP = 1.1

/**
 * The zoom factor one wheel event stands for. A trackpad pinch arrives as ctrl+wheel events
 * with small pixel deltas, which zoom smoothly. A mouse wheel notch with ctrl held arrives in
 * line or page mode, or as one large pixel delta, and is one small step, whatever its size.
 */
export function wheelFactor(e: { deltaY: number; deltaMode: number }): number {
  if (e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50)
    return e.deltaY < 0 ? WHEEL_STEP : e.deltaY > 0 ? 1 / WHEEL_STEP : 1
  return Math.exp(-e.deltaY / 100)
}

/** Safari's gesture events, which the DOM typings do not include. */
interface GestureLike extends UIEvent {
  scale: number
  clientX: number
  clientY: number
}

export interface TrackpadPinchOptions {
  container: HTMLElement
  preview: ZoomPreview
  /** The effective zoom when a pinch starts. */
  scale(): number
  minZoom: number
  maxZoom: number
  /** Called once per pinch, after the preview clears. */
  commit(frame: PinchFrame): void
}

const IDLE_MS = 150
const TOUCH_TYPES = ['touchstart', 'touchend', 'touchcancel'] as const

/**
 * A trackpad pinch over the container. Browsers report it as ctrl+wheel events, which are
 * taken over so the page does not zoom; a run of them is one pinch, anchored at the pointer
 * where it began and committed once the events stop, or as soon as the container scrolls (a
 * plain wheel, a scroll bar), so the scroll moves the committed layout and not the preview.
 * Safari also has gesture events, which give the scale directly; while one of those runs,
 * ctrl+wheel is ignored so nothing counts twice. Safari on a touch screen sends gesture events
 * for a touch pinch too, which `attachTouchPinch` already handles: while a finger is down on
 * the container they are prevented and otherwise ignored. The wheel listener is non-passive
 * because it has to call `preventDefault`.
 */
export function attachTrackpadPinch(opts: TrackpadPinchOptions): { destroy(): void } {
  const { container, preview } = opts
  const win = container.ownerDocument.defaultView ?? window
  let run: { anchor: Point; scale: number; factor: number; last: PinchFrame } | undefined
  let gesturing = false
  /** A finger is down on the container. */
  let touching = false
  let timer: ReturnType<typeof setTimeout> | undefined

  function at(e: { clientX: number; clientY: number }): Point {
    const r = container.getBoundingClientRect()
    return {
      x: e.clientX - r.left - container.clientLeft,
      y: e.clientY - r.top - container.clientTop,
    }
  }

  function update(
    e: { clientX: number; clientY: number },
    next: (factor: number) => number
  ): void {
    if (!run) {
      const scale = opts.scale()
      const anchor = at(e)
      const last = pinchFrame(
        [anchor, anchor],
        [anchor, anchor],
        scale,
        opts.minZoom,
        opts.maxZoom
      )
      run = { anchor, scale, factor: 1, last }
    }
    run.factor = next(run.factor)
    const zoom = Math.min(opts.maxZoom, Math.max(opts.minZoom, run.scale * run.factor))
    run.last = {
      zoom,
      factor: zoom / run.scale,
      anchor: run.anchor,
      pan: { x: 0, y: 0 },
    }
    preview.show(run.last.factor, run.last.anchor, run.last.pan)
  }

  function end(): void {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    if (!run) return
    const { last } = run
    run = undefined
    preview.clear()
    opts.commit(last)
  }

  const onWheel = (e: WheelEvent): void => {
    if (!e.ctrlKey) {
      if (!gesturing) end()
      return
    }
    if (gesturing) return
    e.preventDefault()
    update(e, (f) => f * wheelFactor(e))
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(end, IDLE_MS)
  }

  const onScroll = (): void => {
    if (!gesturing) end()
  }

  const onTouch = (e: TouchEvent): void => {
    touching = e.type === 'touchstart' || e.touches.length > 0
  }

  const onGestureStart = (e: Event): void => {
    e.preventDefault()
    if (touching) return
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    // Anything a ctrl+wheel run left behind commits first, so the gesture starts from it.
    end()
    gesturing = true
    update(e as GestureLike, () => 1)
  }

  const onGestureChange = (e: Event): void => {
    e.preventDefault()
    if (!gesturing) return
    update(e as GestureLike, () => (e as GestureLike).scale)
  }

  const onGestureEnd = (e: Event): void => {
    e.preventDefault()
    if (!gesturing) return
    gesturing = false
    end()
  }

  container.addEventListener('wheel', onWheel, { passive: false })
  container.addEventListener('scroll', onScroll, { passive: true })
  const hasGestures = 'GestureEvent' in win
  if (hasGestures) {
    for (const type of TOUCH_TYPES)
      container.addEventListener(type, onTouch, { passive: true })
    container.addEventListener('gesturestart', onGestureStart)
    container.addEventListener('gesturechange', onGestureChange)
    container.addEventListener('gestureend', onGestureEnd)
  }

  return {
    destroy() {
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('scroll', onScroll)
      if (hasGestures) {
        for (const type of TOUCH_TYPES) container.removeEventListener(type, onTouch)
        container.removeEventListener('gesturestart', onGestureStart)
        container.removeEventListener('gesturechange', onGestureChange)
        container.removeEventListener('gestureend', onGestureEnd)
      }
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      run = undefined
      gesturing = false
      preview.clear()
    },
  }
}
