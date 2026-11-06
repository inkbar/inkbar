import { afterEach, describe, expect, it } from 'vitest'

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
  return { doc, container, viewport, pages, updates }
}

/** Dispatches a touch pointer event at `p`, relative to the container inside its border. */
function touch(container: HTMLElement, type: string, id: number, p: Point): void {
  const r = container.getBoundingClientRect()
  container.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: id,
      pointerType: 'touch',
      isPrimary: id === 1,
      clientX: r.left + container.clientLeft + p.x,
      clientY: r.top + container.clientTop + p.y,
    })
  )
}

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
  container: HTMLElement,
  [a, b]: [Point, Point],
  [a2, b2]: [Point, Point],
  steps = 3
): void {
  touch(container, 'pointerdown', 1, a)
  touch(container, 'pointerdown', 2, b)
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    touch(container, 'pointermove', 1, {
      x: a.x + (a2.x - a.x) * t,
      y: a.y + (a2.y - a.y) * t,
    })
    touch(container, 'pointermove', 2, {
      x: b.x + (b2.x - b.x) * t,
      y: b.y + (b2.y - b.y) * t,
    })
  }
}

describe('touch pinch zoom', () => {
  it('sets touch-action pan-x pan-y and restores it on destroy', async () => {
    const { container, viewport } = await setup({ touchAction: 'manipulation' })
    expect(container.style.touchAction).toBe('pan-x pan-y')
    viewport.destroy()
    expect(container.style.touchAction).toBe('manipulation')
  })

  it('pinchZoom false leaves touch-action and zoom alone', async () => {
    const { container, viewport, pages } = await setup({
      touchAction: 'manipulation',
      pinchZoom: false,
    })
    expect(container.style.touchAction).toBe('manipulation')
    pinch(
      container,
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
    touch(container, 'pointerup', 2, { x: 500, y: 200 })
    touch(container, 'pointerup', 1, { x: 300, y: 200 })
    expect(viewport.zoom.get()).toBe(1)
  })

  it('previews with a transform and no relayout during a pinch', async () => {
    const { container, pages, updates, viewport } = await setup()
    await settle()
    updates.count = 0
    pinch(
      container,
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
    const { container, pages, viewport } = await setup()
    await settle()
    const start = { x: 400, y: 200 }
    const at = userPointAt(viewport, container, start)
    expect(at.page).toBe(0)
    pinch(
      container,
      [
        { x: 350, y: 200 },
        { x: 450, y: 200 },
      ],
      [
        { x: 310, y: 230 },
        { x: 510, y: 230 },
      ]
    )
    touch(container, 'pointerup', 2, { x: 510, y: 230 })
    expect(viewport.zoom.get()).toBe(2)
    expect(viewport.scale.get()).toBe(2)
    expect(pages.style.transform).toBe('')
    const now = containerPointOf(viewport, container, at.page, at.point)
    expect(Math.abs(now.x - 410)).toBeLessThanOrEqual(1)
    expect(Math.abs(now.y - 230)).toBeLessThanOrEqual(1)
  })

  it('a fit-width pinch ends in a numeric zoom', async () => {
    const { container, viewport } = await setup({ zoom: 'fit-width' })
    await settle()
    const fit = viewport.scale.get()
    pinch(
      container,
      [
        { x: 350, y: 200 },
        { x: 450, y: 200 },
      ],
      [
        { x: 325, y: 200 },
        { x: 475, y: 200 },
      ]
    )
    touch(container, 'pointerup', 1, { x: 325, y: 200 })
    expect(typeof viewport.zoom.get()).toBe('number')
    expect(viewport.zoom.get()).toBeCloseTo(fit * 1.5, 6)
  })

  it('a lifted finger that keeps moving starts nothing', async () => {
    const { container, pages, viewport } = await setup()
    await settle()
    pinch(
      container,
      [
        { x: 350, y: 200 },
        { x: 450, y: 200 },
      ],
      [
        { x: 300, y: 200 },
        { x: 500, y: 200 },
      ]
    )
    touch(container, 'pointerup', 2, { x: 500, y: 200 })
    expect(viewport.zoom.get()).toBe(2)
    touch(container, 'pointermove', 1, { x: 250, y: 220 })
    touch(container, 'pointermove', 1, { x: 200, y: 240 })
    // A new second finger while the first is still down does not restart a pinch either.
    touch(container, 'pointerdown', 3, { x: 400, y: 240 })
    touch(container, 'pointermove', 3, { x: 500, y: 240 })
    touch(container, 'pointermove', 1, { x: 100, y: 240 })
    expect(pages.style.transform).toBe('')
    touch(container, 'pointerup', 3, { x: 500, y: 240 })
    touch(container, 'pointerup', 1, { x: 100, y: 240 })
    expect(viewport.zoom.get()).toBe(2)
    expect(pages.style.transform).toBe('')
  })

  it('pinch after a scroll still zooms the document', async () => {
    const { container, viewport } = await setup()
    container.scrollTop = 800
    await settle()
    const start = { x: 400, y: 300 }
    const at = userPointAt(viewport, container, start)
    pinch(
      container,
      [
        { x: 350, y: 300 },
        { x: 450, y: 300 },
      ],
      [
        { x: 300, y: 300 },
        { x: 500, y: 300 },
      ]
    )
    touch(container, 'pointercancel', 1, { x: 300, y: 300 })
    expect(viewport.zoom.get()).toBe(2)
    const now = containerPointOf(viewport, container, at.page, at.point)
    expect(Math.abs(now.x - start.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(now.y - start.y)).toBeLessThanOrEqual(1)
  })

  it('eases out what the scroll edge keeps the commit from reaching, then drops the transform', async () => {
    const { container, pages, viewport } = await setup()
    await settle()
    // Dragging the midpoint 250 px down at the top of the document asks for a scroll above 0,
    // which the browser clamps, so the pages slide the rest of the way.
    pinch(
      container,
      [
        { x: 350, y: 200 },
        { x: 450, y: 200 },
      ],
      [
        { x: 300, y: 450 },
        { x: 500, y: 450 },
      ]
    )
    touch(container, 'pointerup', 2, { x: 500, y: 450 })
    expect(viewport.zoom.get()).toBe(2)
    expect(container.scrollTop).toBe(0)
    expect(pages.style.transform).toMatch(/^translate\(/)
    await nextFrame()
    expect(pages.style.transition).toContain('150ms')
    await until(() => pages.style.transition === '', 1000)
    expect(pages.style.transform).toBe('')
  })

  it('pinching out below fit width previews centred pages and does not settle horizontally', async () => {
    const { container, pages, viewport } = await setup()
    await settle()
    // From the left of the page to half the zoom: the committed layout centres the page.
    pinch(
      container,
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
    touch(container, 'pointerup', 2, { x: 225, y: 100 })
    expect(viewport.zoom.get()).toBe(0.5)
    const settled = /translate\((-?[\d.e-]+)px(?:, (-?[\d.e-]+)px)?\)/.exec(
      pages.style.transform
    )
    const dx = settled ? Number(settled[1]) : 0
    expect(Math.abs(dx)).toBeLessThanOrEqual(1)
  })

  it('a two-finger tap keeps fit-width', async () => {
    const { container, pages, viewport, updates } = await setup({ zoom: 'fit-width' })
    await settle()
    updates.count = 0
    touch(container, 'pointerdown', 1, { x: 350, y: 200 })
    touch(container, 'pointerdown', 2, { x: 450, y: 200 })
    touch(container, 'pointerup', 2, { x: 450, y: 200 })
    touch(container, 'pointerup', 1, { x: 350, y: 200 })
    expect(viewport.zoom.get()).toBe('fit-width')
    expect(updates.count).toBe(0)
    expect(pages.style.transform).toBe('')
  })

  it('destroy mid-pinch leaves no transform and commits nothing', async () => {
    const { container, pages, viewport, updates } = await setup()
    await settle()
    updates.count = 0
    pinch(
      container,
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
    touch(container, 'pointerup', 2, { x: 500, y: 200 })
    expect(viewport.zoom.get()).toBe(1)
    expect(updates.count).toBe(0)
  })
})
