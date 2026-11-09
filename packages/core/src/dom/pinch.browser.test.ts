import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  mountContainer,
  nextFrame,
  openFixtureInBrowser,
  settle,
  until,
} from './test-utils'
import { createViewport, type Viewport, type ZoomValue } from './viewport'

import type { Point } from '../model/geometry'

let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((f) => f())
  cleanup = []
})

async function setup(
  opts: { zoom?: ZoomValue; pinchZoom?: boolean; touchAction?: string } = {}
) {
  const doc = await openFixtureInBrowser('text-simple')
  const container = mountContainer(800, 600)
  if (opts.touchAction !== undefined) container.style.touchAction = opts.touchAction
  const updates = { count: 0 }
  const viewport: Viewport = createViewport({
    container,
    document: doc,
    zoom: opts.zoom ?? 1,
    gap: 16,
    buffer: 1,
    ...(opts.pinchZoom === undefined ? {} : { pinchZoom: opts.pinchZoom }),
    onMount: () => undefined,
    onUpdate: () => {
      updates.count++
    },
    onUnmount: () => undefined,
  })
  cleanup.push(() => {
    viewport.destroy()
    doc.destroy()
    container.remove()
  })
  await until(() => viewport.hostFor(0) !== undefined)
  const pages = container.querySelector<HTMLElement>('.ink-pages')!
  return { doc, container, viewport, pages, updates, f: fingers(container) }
}

/**
 * Fingers on the container, dispatched as touch events the way a browser sends them: every
 * event lists the touches still down, and the ones that changed. Points are relative to the
 * container inside its border.
 */
function fingers(container: HTMLElement) {
  const live = new Map<number, Touch>()
  function touchAt(id: number, p: Point): Touch {
    const r = container.getBoundingClientRect()
    return new Touch({
      identifier: id,
      target: container,
      clientX: r.left + container.clientLeft + p.x,
      clientY: r.top + container.clientTop + p.y,
    })
  }
  function fire(type: string, changed: Touch): TouchEvent {
    const e = new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches: [...live.values()],
      targetTouches: [...live.values()],
      changedTouches: [changed],
    })
    container.dispatchEvent(e)
    return e
  }
  return {
    down(id: number, p: Point): TouchEvent {
      const t = touchAt(id, p)
      live.set(id, t)
      return fire('touchstart', t)
    },
    move(id: number, p: Point): TouchEvent {
      const t = touchAt(id, p)
      live.set(id, t)
      return fire('touchmove', t)
    },
    up(id: number, p: Point, type: 'touchend' | 'touchcancel' = 'touchend'): TouchEvent {
      live.delete(id)
      return fire(type, touchAt(id, p))
    },
    /** Forgets a finger without telling the container, as when the browser loses its end. */
    lose(id: number): void {
      live.delete(id)
    },
  }
}

type Fingers = ReturnType<typeof fingers>

/** The page and user-space point under `at`, which is relative to the container. */
function userPointAt(viewport: Viewport, container: HTMLElement, at: Point) {
  const c = container.getBoundingClientRect()
  const x = c.left + container.clientLeft + at.x
  const y = c.top + container.clientTop + at.y
  const hit = viewport.pageAtCss(x, y)
  if (!hit) throw new Error('no page under the point')
  const h = hit.host.getBoundingClientRect()
  return { page: hit.page, point: hit.transform.fromCss({ x: x - h.left, y: y - h.top }) }
}

/** Where a user-space point on `page` sits now, relative to the container. */
function containerPointOf(
  viewport: Viewport,
  container: HTMLElement,
  page: number,
  user: Point
): Point {
  const host = viewport.hostFor(page)
  if (!host) throw new Error(`page ${page} is not mounted`)
  const c = container.getBoundingClientRect()
  const h = host.getBoundingClientRect()
  const css = viewport.transformFor(page).toCss(user)
  return {
    x: h.left + css.x - c.left - container.clientLeft,
    y: h.top + css.y - c.top - container.clientTop,
  }
}

/** Two fingers down at `a` and `b`, then moved in `steps` to `a2` and `b2`. */
function pinch(
  f: Fingers,
  [a, b]: [Point, Point],
  [a2, b2]: [Point, Point],
  steps = 3
): TouchEvent[] {
  f.down(1, a)
  f.down(2, b)
  const moves: TouchEvent[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    moves.push(
      f.move(1, {
        x: a.x + (a2.x - a.x) * t,
        y: a.y + (a2.y - a.y) * t,
      }),
      f.move(2, {
        x: b.x + (b2.x - b.x) * t,
        y: b.y + (b2.y - b.y) * t,
      })
    )
  }
  return moves
}

describe('touch pinch zoom', () => {
  it('sets touch-action pan-x pan-y and restores it on destroy', async () => {
    const { container, viewport } = await setup({ touchAction: 'manipulation' })
    expect(container.style.touchAction).toBe('pan-x pan-y')
    viewport.destroy()
    expect(container.style.touchAction).toBe('manipulation')
  })

  it('pinchZoom false leaves touch-action and zoom alone', async () => {
    const { container, viewport, pages, f } = await setup({
      touchAction: 'manipulation',
      pinchZoom: false,
    })
    expect(container.style.touchAction).toBe('manipulation')
    pinch(
      f,
      [
        { x: 350, y: 200 },
        { x: 450, y: 200 },
      ],
      [
        { x: 300, y: 200 },
        { x: 500, y: 200 },
      ]
    )
    expect(pages.style.transform).toBe('')
    f.up(2, { x: 500, y: 200 })
    f.up(1, { x: 300, y: 200 })
    expect(viewport.zoom.get()).toBe(1)
  })

  it('previews with a transform and no relayout during a pinch', async () => {
    const { pages, updates, viewport, f } = await setup()
    await settle()
    updates.count = 0
    pinch(
      f,
      [
        { x: 350, y: 200 },
        { x: 450, y: 200 },
      ],
      [
        { x: 300, y: 200 },
        { x: 500, y: 200 },
      ]
    )
    expect(pages.style.transform).toContain('scale(')
    expect(updates.count).toBe(0)
    expect(viewport.zoom.get()).toBe(1)
  })

  it('commits one setZoom at the lift, keeping the point between the fingers still', async () => {
    const { container, pages, viewport, f } = await setup()
    await settle()
    const start = { x: 400, y: 200 }
    const at = userPointAt(viewport, container, start)
    expect(at.page).toBe(0)
    pinch(
      f,
      [
        { x: 350, y: 200 },
        { x: 450, y: 200 },
      ],
      [
        { x: 310, y: 230 },
        { x: 510, y: 230 },
      ]
    )
    f.up(2, { x: 510, y: 230 })
    expect(viewport.zoom.get()).toBe(2)
    expect(viewport.scale.get()).toBe(2)
    expect(pages.style.transform).toBe('')
    const now = containerPointOf(viewport, container, at.page, at.point)
    expect(Math.abs(now.x - 410)).toBeLessThanOrEqual(1)
    expect(Math.abs(now.y - 230)).toBeLessThanOrEqual(1)
  })

  it('a fit-width pinch ends in a numeric zoom', async () => {
    const { viewport, f } = await setup({ zoom: 'fit-width' })
    await settle()
    const fit = viewport.scale.get()
    pinch(
      f,
      [
        { x: 350, y: 200 },
        { x: 450, y: 200 },
      ],
      [
        { x: 325, y: 200 },
        { x: 475, y: 200 },
      ]
    )
    f.up(1, { x: 325, y: 200 })
    expect(typeof viewport.zoom.get()).toBe('number')
    expect(viewport.zoom.get()).toBeCloseTo(fit * 1.5, 6)
  })

  it('a lifted finger that keeps moving starts nothing', async () => {
    const { pages, viewport, f } = await setup()
    await settle()
    pinch(
      f,
      [
        { x: 350, y: 200 },
        { x: 450, y: 200 },
      ],
      [
        { x: 300, y: 200 },
        { x: 500, y: 200 },
      ]
    )
    f.up(2, { x: 500, y: 200 })
    expect(viewport.zoom.get()).toBe(2)
    f.move(1, { x: 250, y: 220 })
    f.move(1, { x: 200, y: 240 })
    // A new second finger while the first is still down does not restart a pinch either.
    f.down(3, { x: 400, y: 240 })
    f.move(3, { x: 500, y: 240 })
    f.move(1, { x: 100, y: 240 })
    expect(pages.style.transform).toBe('')
    f.up(3, { x: 500, y: 240 })
    f.up(1, { x: 100, y: 240 })
    expect(viewport.zoom.get()).toBe(2)
    expect(pages.style.transform).toBe('')
  })

  it('pinch after a scroll still zooms the document', async () => {
    const { container, viewport, f } = await setup()
    container.scrollTop = 800
    await settle()
    const start = { x: 400, y: 300 }
    const at = userPointAt(viewport, container, start)
    pinch(
      f,
      [
        { x: 350, y: 300 },
        { x: 450, y: 300 },
      ],
      [
        { x: 300, y: 300 },
        { x: 500, y: 300 },
      ]
    )
    f.up(1, { x: 300, y: 300 }, 'touchcancel')
    expect(viewport.zoom.get()).toBe(2)
    const now = containerPointOf(viewport, container, at.page, at.point)
    expect(Math.abs(now.x - start.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(now.y - start.y)).toBeLessThanOrEqual(1)
  })

  it('eases out what the scroll edge keeps the commit from reaching, then drops the transform', async () => {
    const { container, pages, viewport, f } = await setup()
    await settle()
    // Dragging the midpoint 250 px down at the top of the document asks for a scroll above 0,
    // which the browser clamps, so the pages slide the rest of the way.
    pinch(
      f,
      [
        { x: 350, y: 200 },
        { x: 450, y: 200 },
      ],
      [
        { x: 300, y: 450 },
        { x: 500, y: 450 },
      ]
    )
    f.up(2, { x: 500, y: 450 })
    expect(viewport.zoom.get()).toBe(2)
    expect(container.scrollTop).toBe(0)
    expect(pages.style.transform).toMatch(/^translate\(/)
    await nextFrame()
    expect(pages.style.transition).toContain('150ms')
    // Another property's transition, or one on something inside the pages, is not the settle.
    pages.dispatchEvent(
      new TransitionEvent('transitionend', { bubbles: true, propertyName: 'opacity' })
    )
    viewport
      .hostFor(0)!
      .dispatchEvent(
        new TransitionEvent('transitionend', { bubbles: true, propertyName: 'transform' })
      )
    expect(pages.style.transition).toContain('150ms')
    await until(() => pages.style.transition === '', 1000)
    expect(pages.style.transform).toBe('')
  })

  it('pinching out below fit width previews centred pages and does not settle horizontally', async () => {
    const { container, pages, viewport, f } = await setup()
    await settle()
    // From the left of the page to half the zoom: the committed layout centres the page.
    pinch(
      f,
      [
        { x: 150, y: 100 },
        { x: 250, y: 100 },
      ],
      [
        { x: 175, y: 100 },
        { x: 225, y: 100 },
      ]
    )
    const c = container.getBoundingClientRect()
    const h = viewport.hostFor(0)!.getBoundingClientRect()
    const centre = c.left + container.clientLeft + container.clientWidth / 2
    expect(Math.abs(h.left + h.width / 2 - centre)).toBeLessThanOrEqual(1)
    f.up(2, { x: 225, y: 100 })
    expect(viewport.zoom.get()).toBe(0.5)
    const settled = /translate\((-?[\d.e-]+)px(?:, (-?[\d.e-]+)px)?\)/.exec(
      pages.style.transform
    )
    const dx = settled ? Number(settled[1]) : 0
    expect(Math.abs(dx)).toBeLessThanOrEqual(1)
  })

  it('a two-finger pan that does not zoom keeps fit-width and scrolls', async () => {
    const { container, viewport, f } = await setup({ zoom: 'fit-width' })
    container.scrollTop = 400
    await settle()
    pinch(
      f,
      [
        { x: 350, y: 200 },
        { x: 450, y: 200 },
      ],
      [
        { x: 350, y: 150 },
        { x: 450, y: 150 },
      ]
    )
    f.up(2, { x: 450, y: 150 })
    expect(viewport.zoom.get()).toBe('fit-width')
    expect(container.scrollTop).toBe(450)
  })

  it('a two-finger pan scrolls the container while the fingers move', async () => {
    const { container, pages, f } = await setup()
    await settle()
    expect(container.scrollTop).toBe(0)
    pinch(
      f,
      [
        { x: 350, y: 450 },
        { x: 450, y: 450 },
      ],
      [
        { x: 350, y: 150 },
        { x: 450, y: 150 },
      ],
      10
    )
    expect(Math.abs(container.scrollTop - 300)).toBeLessThanOrEqual(1)
    const shown = new DOMMatrix(getComputedStyle(pages).transform)
    expect(Math.abs(shown.m41)).toBeLessThanOrEqual(1)
    expect(Math.abs(shown.m42)).toBeLessThanOrEqual(1)
    f.up(2, { x: 450, y: 150 })
    f.up(1, { x: 350, y: 150 })
    expect(Math.abs(container.scrollTop - 300)).toBeLessThanOrEqual(1)
  })

  it('a two-finger pan at the top edge previews the rest', async () => {
    const { container, pages, f } = await setup()
    await settle()
    pinch(
      f,
      [
        { x: 350, y: 200 },
        { x: 450, y: 200 },
      ],
      [
        { x: 350, y: 250 },
        { x: 450, y: 250 },
      ]
    )
    expect(container.scrollTop).toBe(0)
    const shown = new DOMMatrix(getComputedStyle(pages).transform)
    expect(shown.m42).toBeCloseTo(50, 3)
    f.up(2, { x: 450, y: 250 })
    expect(container.scrollTop).toBe(0)
    expect(pages.style.transform).toMatch(/^translate\(/)
    await until(() => pages.style.transform === '', 1000)
  })

  it('prevents moves only while two fingers are down', async () => {
    const { f } = await setup()
    await settle()
    f.down(1, { x: 350, y: 200 })
    expect(f.move(1, { x: 350, y: 180 }).defaultPrevented).toBe(false)
    f.down(2, { x: 450, y: 180 })
    expect(f.move(2, { x: 480, y: 180 }).defaultPrevented).toBe(true)
    f.up(2, { x: 480, y: 180 })
    expect(f.move(1, { x: 350, y: 160 }).defaultPrevented).toBe(false)
    f.up(1, { x: 350, y: 160 })
  })

  it('a finger that lands alone starts afresh after an end the browser lost', async () => {
    const { pages, viewport, f } = await setup()
    await settle()
    pinch(
      f,
      [
        { x: 350, y: 200 },
        { x: 450, y: 200 },
      ],
      [
        { x: 300, y: 200 },
        { x: 500, y: 200 },
      ]
    )
    f.up(2, { x: 500, y: 200 })
    expect(viewport.zoom.get()).toBe(2)
    // The other finger's end never arrives, which would leave the pinch spent for good.
    f.lose(1)
    pinch(
      f,
      [
        { x: 350, y: 200 },
        { x: 450, y: 200 },
      ],
      [
        { x: 325, y: 200 },
        { x: 475, y: 200 },
      ]
    )
    expect(pages.style.transform).toContain('scale(')
    f.up(1, { x: 325, y: 200 })
    expect(viewport.zoom.get()).toBe(3)
  })

  it('a two-finger tap keeps fit-width', async () => {
    const { pages, viewport, updates, f } = await setup({ zoom: 'fit-width' })
    await settle()
    updates.count = 0
    f.down(1, { x: 350, y: 200 })
    f.down(2, { x: 450, y: 200 })
    f.up(2, { x: 450, y: 200 })
    f.up(1, { x: 350, y: 200 })
    expect(viewport.zoom.get()).toBe('fit-width')
    expect(updates.count).toBe(0)
    expect(pages.style.transform).toBe('')
  })

  it('destroy mid-pinch leaves no transform and commits nothing', async () => {
    const { pages, viewport, updates, f } = await setup()
    await settle()
    updates.count = 0
    pinch(
      f,
      [
        { x: 350, y: 200 },
        { x: 450, y: 200 },
      ],
      [
        { x: 300, y: 200 },
        { x: 500, y: 200 },
      ]
    )
    expect(pages.style.transform).toContain('scale(')
    viewport.destroy()
    expect(pages.style.transform).toBe('')
    expect(pages.style.transformOrigin).toBe('')
    f.up(2, { x: 500, y: 200 })
    expect(viewport.zoom.get()).toBe(1)
    expect(updates.count).toBe(0)
  })
})

/** Dispatches `count` ctrl+wheel events 16 ms apart at `at` (container-relative). */
async function wheelRun(
  container: HTMLElement,
  at: Point,
  count: number,
  init: WheelEventInit = {}
): Promise<WheelEvent[]> {
  const r = container.getBoundingClientRect()
  const events: WheelEvent[] = []
  for (let i = 0; i < count; i++) {
    const e = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -20,
      clientX: r.left + container.clientLeft + at.x,
      clientY: r.top + container.clientTop + at.y,
      ...init,
    })
    container.dispatchEvent(e)
    events.push(e)
    if (i < count - 1) await new Promise((res) => setTimeout(res, 16))
  }
  return events
}

describe('trackpad pinch zoom', () => {
  it('ctrl+wheel is prevented and commits one setZoom after 150 ms idle', async () => {
    const { container, viewport, pages } = await setup({ zoom: 0.5 })
    const zooms: ZoomValue[] = []
    cleanup.push(viewport.zoom.subscribe((z) => zooms.push(z)))
    const events = await wheelRun(container, { x: 400, y: 300 }, 5)
    expect(events.every((e) => e.defaultPrevented)).toBe(true)
    expect(viewport.zoom.get()).toBe(0.5)
    expect(pages.style.transform).toContain('scale(')
    await vi.waitFor(() => expect(viewport.zoom.get()).toBeCloseTo(0.5 * Math.exp(1), 6))
    expect(pages.style.transform).not.toContain('scale(')
    await new Promise((res) => setTimeout(res, 250))
    expect(zooms).toHaveLength(1)
  })

  it('a mouse wheel notch with ctrl zooms one small step', async () => {
    const { container, viewport } = await setup({ zoom: 1 })
    await wheelRun(container, { x: 400, y: 300 }, 1, { deltaY: -100 })
    await vi.waitFor(() => expect(viewport.zoom.get()).toBeCloseTo(1.1, 6))
  })

  it('a plain wheel during a run commits it at once, keeping the point under the cursor', async () => {
    const { container, viewport, pages } = await setup({ zoom: 0.5 })
    const at = { x: 300, y: 250 }
    const before = userPointAt(viewport, container, at)
    await wheelRun(container, at, 5)
    expect(viewport.zoom.get()).toBe(0.5)
    await wheelRun(container, at, 1, { ctrlKey: false, deltaY: 10 })
    expect(viewport.zoom.get()).toBeCloseTo(0.5 * Math.exp(1), 6)
    expect(pages.style.transform).not.toContain('scale(')
    const after = containerPointOf(viewport, container, before.page, before.point)
    expect(Math.abs(after.x - at.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(after.y - at.y)).toBeLessThanOrEqual(1)
  })

  it('a scroll during a run commits it at once', async () => {
    const { container, viewport } = await setup({ zoom: 0.5 })
    await wheelRun(container, { x: 300, y: 250 }, 3)
    container.dispatchEvent(new Event('scroll'))
    expect(viewport.zoom.get()).toBeCloseTo(0.5 * Math.exp(0.6), 6)
  })

  it('the point under the cursor stays put', async () => {
    const { container, viewport } = await setup({ zoom: 0.5 })
    const at = { x: 300, y: 250 }
    const before = userPointAt(viewport, container, at)
    await wheelRun(container, at, 5)
    await vi.waitFor(() => expect(viewport.zoom.get()).toBeGreaterThan(0.5))
    const after = containerPointOf(viewport, container, before.page, before.point)
    expect(Math.abs(after.x - at.x)).toBeLessThan(1)
    expect(Math.abs(after.y - at.y)).toBeLessThan(1)
  })

  it('plain wheel scrolls as before', async () => {
    const { container, viewport } = await setup()
    const events = await wheelRun(container, { x: 400, y: 300 }, 2, { ctrlKey: false })
    expect(events.some((e) => e.defaultPrevented)).toBe(false)
    await new Promise((res) => setTimeout(res, 250))
    expect(viewport.zoom.get()).toBe(1)
  })

  it('pinchZoom false ignores ctrl+wheel', async () => {
    const { container, viewport } = await setup({ pinchZoom: false })
    const events = await wheelRun(container, { x: 400, y: 300 }, 2)
    expect(events.some((e) => e.defaultPrevented)).toBe(false)
    await new Promise((res) => setTimeout(res, 250))
    expect(viewport.zoom.get()).toBe(1)
  })
})

/** Safari's gesture events: a plain event carrying the scale and the pointer position. */
function gesture(container: HTMLElement, type: string, scale: number, at: Point): Event {
  const r = container.getBoundingClientRect()
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(e, {
    scale,
    clientX: r.left + container.clientLeft + at.x,
    clientY: r.top + container.clientTop + at.y,
  })
  container.dispatchEvent(e)
  return e
}

describe('gesture events', () => {
  // Gesture listeners are attached only where the browser has them, so stand one in.
  function withGestureEvents(): void {
    vi.stubGlobal('GestureEvent', class extends UIEvent {})
    cleanup.push(() => vi.unstubAllGlobals())
  }

  it('a trackpad gesture commits once at its scale and ctrl+wheel meanwhile counts for nothing', async () => {
    withGestureEvents()
    const { container, viewport, pages } = await setup({ zoom: 1 })
    const zooms: ZoomValue[] = []
    cleanup.push(viewport.zoom.subscribe((z) => zooms.push(z)))
    const at = { x: 400, y: 300 }
    expect(gesture(container, 'gesturestart', 1, at).defaultPrevented).toBe(true)
    gesture(container, 'gesturechange', 1.5, at)
    expect(pages.style.transform).toContain('scale(1.5)')
    const wheels = await wheelRun(container, at, 2, { deltaY: -100 })
    gesture(container, 'gesturechange', 2, at)
    gesture(container, 'gestureend', 2, at)
    expect(viewport.zoom.get()).toBe(2)
    await new Promise((res) => setTimeout(res, 250))
    expect(wheels.some((e) => e.defaultPrevented)).toBe(false)
    expect(zooms).toEqual([2])
  })

  it('gesture events during a touch pinch are ignored: the touch pinch commits once', async () => {
    withGestureEvents()
    const { container, viewport, pages, f } = await setup({ zoom: 1 })
    await settle()
    const zooms: ZoomValue[] = []
    cleanup.push(viewport.zoom.subscribe((z) => zooms.push(z)))
    f.down(1, { x: 350, y: 200 })
    f.down(2, { x: 450, y: 200 })
    gesture(container, 'gesturestart', 1, { x: 400, y: 200 })
    f.move(1, { x: 300, y: 200 })
    f.move(2, { x: 500, y: 200 })
    gesture(container, 'gesturechange', 3, { x: 400, y: 200 })
    expect(pages.style.transform).toContain('scale(2)')
    f.up(2, { x: 500, y: 200 })
    gesture(container, 'gestureend', 3, { x: 400, y: 200 })
    f.up(1, { x: 300, y: 200 })
    await new Promise((res) => setTimeout(res, 250))
    expect(zooms).toEqual([2])
    expect(pages.style.transform).not.toContain('scale(')
  })
})
