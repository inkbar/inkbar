import { afterEach, describe, expect, it } from 'vitest'

import { fitZoomCss, visibleRangeCss } from './layout'
import { mountContainer, openFixtureInBrowser, settle, until } from './test-utils'
import { createPageTransform } from './transform'
import { createViewport, type Viewport, type ZoomValue } from './viewport'

import type { Point } from '../model/geometry'
import type { FixtureName } from '@inkbar/fixtures/urls'

const GAP = 16
const BUFFER = 1

let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((f) => f())
  cleanup = []
})

async function setup(name: FixtureName = 'text-simple', zoom: ZoomValue = 1) {
  const doc = await openFixtureInBrowser(name)
  const container = mountContainer(800, 600)
  const mounted = new Map<number, HTMLElement>()
  const viewport: Viewport = createViewport({
    container,
    document: doc,
    zoom,
    gap: GAP,
    buffer: BUFFER,
    onMount: (page, host) => mounted.set(page, host),
    onUpdate: () => undefined,
    onUnmount: (page) => mounted.delete(page),
  })
  cleanup.push(() => {
    viewport.destroy()
    doc.destroy()
    container.remove()
  })
  return { doc, container, viewport, mounted }
}

/** The page and user-space point under `anchor`, which is relative to the container's top-left. */
function userPointAt(viewport: Viewport, container: HTMLElement, anchor: Point) {
  const c = container.getBoundingClientRect()
  const hit = viewport.pageAtCss(c.left + anchor.x, c.top + anchor.y)
  if (!hit) throw new Error('no page under the anchor')
  const h = hit.host.getBoundingClientRect()
  const point = hit.transform.fromCss({
    x: c.left + anchor.x - h.left,
    y: c.top + anchor.y - h.top,
  })
  return { page: hit.page, point }
}

describe('createViewport', () => {
  it('builds the DOM contract and mounts visible pages plus buffer', async () => {
    const { container, viewport, mounted } = await setup()
    expect(container.dataset.inkViewport).toBe('')
    const pages = container.querySelector<HTMLElement>(
      ':scope > div.ink-pages[data-ink-pages]'
    )
    expect(pages).not.toBeNull()
    const layout = viewport.layout.get()
    expect(pages!.style.height).toBe(`${layout.height}px`)
    expect(pages!.style.width).toBe(`${layout.width}px`)

    const expected = visibleRangeCss(layout, 0, container.clientHeight, BUFFER)
    expect(expected.length).toBeLessThan(viewport.layout.get().boxes.length)
    await until(() => mounted.size === expected.length)
    expect([...mounted.keys()]).toEqual(expected)
    expect(viewport.mounted.get()).toEqual(expected)

    const host = mounted.get(0)!
    const box = layout.boxes[0]!
    expect(host.matches('div.ink-page')).toBe(true)
    expect(host.parentElement).toBe(pages)
    expect(host.dataset.page).toBe('0')
    expect(host.dataset.rotation).toBe('0')
    expect(host.style.getPropertyValue('--scale-factor')).toBe('1')
    expect(host.style.getPropertyValue('--total-scale-factor')).toBe('1')
    expect(host.style.position).toBe('absolute')
    expect(host.style.left).toBe(`${box.left}px`)
    expect(host.style.top).toBe(`${box.top}px`)
    expect(host.style.width).toBe(`${box.width}px`)
    expect(host.style.height).toBe(`${box.height}px`)
    expect(viewport.hostFor(0)).toBe(host)
    expect(viewport.currentPage.get()).toBe(0)
  })

  it('unmounts pages that scroll far away and tracks the current page', async () => {
    const { container, viewport, mounted } = await setup()
    const layout = viewport.layout.get()
    const target = layout.boxes[2]!.top
    container.scrollTop = target
    container.dispatchEvent(new Event('scroll'))
    await until(() => viewport.currentPage.get() === 2)
    const expected = visibleRangeCss(
      layout,
      container.scrollTop,
      container.clientHeight,
      BUFFER
    )
    expect(expected).not.toContain(0)
    await until(() => !mounted.has(0))
    expect([...mounted.keys()].sort((a, b) => a - b)).toEqual(expected)
    expect(viewport.hostFor(0)).toBeUndefined()
  })

  it('fit-width recomputes on resize and setZoom keeps the anchor point still', async () => {
    const { doc, container, viewport } = await setup('text-simple', 'fit-width')
    const fitWidth = () =>
      fitZoomCss(
        doc.pages[0]!,
        0,
        { width: container.clientWidth, height: container.clientHeight },
        'fit-width',
        GAP
      )
    expect(viewport.scale.get()).toBeCloseTo(fitWidth(), 6)
    // The vertical scrollbar, if any, is already out of the width the fit used.
    expect(viewport.layout.get().width).toBe(container.clientWidth)

    const wide = viewport.scale.get()
    container.style.width = '400px'
    await until(() => viewport.scale.get() < wide)
    await settle()
    expect(viewport.scale.get()).toBeCloseTo(fitWidth(), 6)

    viewport.setZoom(1)
    await settle()
    expect(viewport.scale.get()).toBe(1)
    const anchor = { x: 200, y: 300 }
    const before = userPointAt(viewport, container, anchor)
    viewport.setZoom(2, anchor)
    await settle()
    expect(viewport.scale.get()).toBe(2)
    const after = userPointAt(viewport, container, anchor)
    expect(after.page).toBe(before.page)
    expect(after.point.x).toBeCloseTo(before.point.x, 0)
    expect(after.point.y).toBeCloseTo(before.point.y, 0)
  })

  it('zoomBy anchors to the viewport centre by default', async () => {
    const { container, viewport } = await setup()
    container.scrollTop = 200
    await settle()
    const centre = { x: container.clientWidth / 2, y: container.clientHeight / 2 }
    const before = userPointAt(viewport, container, centre)
    viewport.zoomBy(1.5)
    await settle()
    expect(viewport.scale.get()).toBeCloseTo(1.5, 6)
    const after = userPointAt(viewport, container, {
      x: container.clientWidth / 2,
      y: container.clientHeight / 2,
    })
    expect(after.page).toBe(before.page)
    expect(after.point.x).toBeCloseTo(before.point.x, 0)
    expect(after.point.y).toBeCloseTo(before.point.y, 0)
  })

  /** Client y of `anchor` minus the top of `page`'s host, in CSS px. */
  function offsetFromPageTop(
    viewport: Viewport,
    container: HTMLElement,
    page: number,
    y: number
  ) {
    const host = viewport.hostFor(page)
    if (!host) throw new Error(`page ${page} is not mounted`)
    return container.getBoundingClientRect().top + y - host.getBoundingClientRect().top
  }

  it('keeps the zoom anchored when the anchor is in the side margin', async () => {
    const { container, viewport } = await setup()
    const box = viewport.layout.get().boxes[1]!
    const anchor = { x: box.left / 2, y: 300 }
    expect(anchor.x).toBeGreaterThan(0)
    container.scrollTop = box.top + 200 - anchor.y
    await settle()
    const c = container.getBoundingClientRect()
    expect(viewport.pageAtCss(c.left + anchor.x, c.top + anchor.y)).toBeUndefined()
    const userY = (scale: number) =>
      viewport
        .transformFor(1)
        .fromCss({ x: 0, y: offsetFromPageTop(viewport, container, 1, anchor.y) }).y *
      scale
    const before = userY(1)

    viewport.setZoom(2, anchor)
    await settle()
    expect(viewport.scale.get()).toBe(2)
    // In CSS px at the new zoom: the point under the anchor's y has not moved.
    expect(Math.abs(userY(2) - before * 2)).toBeLessThanOrEqual(1)
    expect(offsetFromPageTop(viewport, container, 1, anchor.y)).toBeCloseTo(200 * 2, 0)
  })

  it('keeps the zoom anchored when the anchor is in the gap between pages', async () => {
    const { container, viewport } = await setup()
    const box = viewport.layout.get().boxes[1]!
    const anchor = { x: container.clientWidth / 2, y: 300 }
    const above = GAP / 4
    container.scrollTop = box.top - above - anchor.y
    await settle()
    const c = container.getBoundingClientRect()
    expect(viewport.pageAtCss(c.left + anchor.x, c.top + anchor.y)).toBeUndefined()
    expect(offsetFromPageTop(viewport, container, 1, anchor.y)).toBeCloseTo(-above, 3)

    viewport.setZoom(2, anchor)
    await settle()
    expect(viewport.scale.get()).toBe(2)
    // The same user-space point, extrapolated from page 1, is still under the anchor.
    expect(
      Math.abs(offsetFromPageTop(viewport, container, 1, anchor.y) - -above * 2)
    ).toBeLessThanOrEqual(1)
  })

  it('sizes pages inside the container padding', async () => {
    const doc = await openFixtureInBrowser('text-simple')
    const container = mountContainer(800, 600)
    container.style.padding = '16px'
    const viewport = createViewport({
      container,
      document: doc,
      zoom: 'fit-width',
      gap: GAP,
      onMount: () => undefined,
      onUpdate: () => undefined,
      onUnmount: () => undefined,
    })
    cleanup.push(() => {
      viewport.destroy()
      doc.destroy()
      container.remove()
    })
    await settle()
    expect(container.scrollWidth).toBe(container.clientWidth)
    expect(viewport.layout.get().width).toBe(container.clientWidth - 32)
    expect(viewport.scale.get()).toBeCloseTo(
      fitZoomCss(
        doc.pages[0]!,
        0,
        { width: container.clientWidth - 32, height: container.clientHeight - 32 },
        'fit-width',
        GAP
      ),
      6
    )
  })

  it('scrollToRect brings a user-space rect into view on the right page', async () => {
    const { container, viewport } = await setup()
    const rect = { x: 72, y: 100, width: 100, height: 20 }
    viewport.scrollToRect(2, rect)
    await settle()
    const box = viewport.layout.get().boxes[2]!
    const css = viewport.transformFor(2).toCssRect(rect)
    const absoluteTop = box.top + css.top
    expect(container.scrollTop).toBeGreaterThan(0)
    expect(container.scrollTop).toBeLessThanOrEqual(absoluteTop)
    expect(container.scrollTop + container.clientHeight).toBeGreaterThanOrEqual(
      absoluteTop + css.height
    )
    await until(() => viewport.hostFor(2) !== undefined)
  })

  it('scrollToPage puts the page top just below the gap', async () => {
    const { container, viewport } = await setup()
    viewport.scrollToPage(1)
    await settle()
    expect(container.scrollTop).toBe(viewport.layout.get().boxes[1]!.top - GAP)
    await until(() => viewport.currentPage.get() === 1)
  })

  it('single mode lays out only the current page', async () => {
    const { container, viewport, mounted } = await setup()
    viewport.setMode('single')
    viewport.scrollToPage(2)
    await settle()
    expect(viewport.layout.get().boxes.map((b) => b.index)).toEqual([2])
    expect(viewport.currentPage.get()).toBe(2)
    await until(() => mounted.size === 1 && mounted.has(2))
    expect(container.scrollTop).toBe(0)
  })

  it('keeps the selected page when switching from single to continuous mode', async () => {
    const { container, viewport, mounted } = await setup()
    viewport.setMode('single')
    viewport.scrollToPage(2)
    await settle()
    expect(viewport.currentPage.get()).toBe(2)
    viewport.setMode('continuous')
    expect(viewport.currentPage.get()).toBe(2)
    await settle()
    expect(viewport.currentPage.get()).toBe(2)
    expect(container.scrollTop).toBe(viewport.layout.get().boxes[2]!.top - GAP)
    await until(() => mounted.has(2))
  })

  it('lays out the current page when switching from continuous to single mode', async () => {
    const { container, viewport, mounted } = await setup()
    container.scrollTop = viewport.layout.get().boxes[2]!.top
    await until(() => viewport.currentPage.get() === 2)
    viewport.setMode('single')
    expect(viewport.currentPage.get()).toBe(2)
    expect(viewport.layout.get().boxes.map((b) => b.index)).toEqual([2])
    await until(() => mounted.size === 1)
    expect([...mounted.keys()]).toEqual([2])
    const hosts = container.querySelectorAll<HTMLElement>('div.ink-page[data-page]')
    expect([...hosts].map((h) => h.dataset.page)).toEqual(['2'])
  })

  it('uses a scroll whose frame has not run yet when switching to single mode', async () => {
    const { container, viewport } = await setup()
    // No await: the scroll handler's frame is still pending when the mode changes.
    container.scrollTop = viewport.layout.get().boxes[2]!.top
    viewport.setMode('single')
    expect(viewport.currentPage.get()).toBe(2)
    expect(viewport.layout.get().boxes.map((b) => b.index)).toEqual([2])
    await settle()
    expect(container.querySelector<HTMLElement>('div.ink-page')?.dataset.page).toBe('2')
  })

  it('sets --total-scale-factor to zoom times /UserUnit and --scale-factor to the zoom', async () => {
    const { doc, viewport, mounted } = await setup('userunit-2')
    expect(doc.pages[0]!.userUnit).toBe(2)
    await until(() => mounted.has(0))
    const host = mounted.get(0)!
    const t = viewport.transformFor(0)
    expect(t.scale).toBe(2)
    expect(host.style.getPropertyValue('--scale-factor')).toBe('1')
    expect(host.style.getPropertyValue('--total-scale-factor')).toBe('2')
    expect(host.style.width).toBe(`${t.cssWidth}px`)
    expect(t.cssWidth).toBe(doc.pages[0]!.width * 2)
  })

  it('rotation swaps page dimensions', async () => {
    const { doc, viewport, mounted } = await setup()
    const upright = createPageTransform(doc.pages[0]!, 1, 0)
    const rotated = createPageTransform(doc.pages[0]!, 1, 90)
    expect(rotated.cssWidth).toBe(upright.cssHeight)
    viewport.setRotation(90)
    await until(() => mounted.get(0)?.style.width === `${rotated.cssWidth}px`)
    expect(mounted.get(0)!.style.height).toBe(`${rotated.cssHeight}px`)
    expect(mounted.get(0)!.dataset.rotation).toBe(String(rotated.totalRotation))
    expect(viewport.rotation.get()).toBe(90)
  })

  it('clamps zoom to min and max', async () => {
    const { viewport } = await setup()
    viewport.setZoom(100)
    expect(viewport.scale.get()).toBe(8)
    viewport.setZoom(0.001)
    expect(viewport.scale.get()).toBe(0.1)
  })

  it('pageAtCss returns undefined in the gap between pages', async () => {
    const { container, viewport } = await setup()
    const c = container.getBoundingClientRect()
    const box = viewport.layout.get().boxes[0]!
    expect(viewport.pageAtCss(c.left + box.left + 10, c.top + box.top + 10)?.page).toBe(0)
    expect(viewport.pageAtCss(c.left + box.left + 10, c.top + GAP / 2)).toBeUndefined()
  })

  it('destroy removes what it created and calls onUnmount', async () => {
    const { container, viewport, mounted } = await setup()
    await until(() => mounted.size > 0)
    viewport.destroy()
    expect(mounted.size).toBe(0)
    expect(container.querySelector('[data-ink-pages]')).toBeNull()
    expect(container.dataset.inkViewport).toBeUndefined()
    expect(container.style.overflow).toBe('')
  })
})
