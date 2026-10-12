import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPageRenderer } from './page-renderer'
import { mountContainer, nextFrame, openFixtureInBrowser } from './test-utils'
import { createPageTransform } from './transform'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

function pixel(canvas: HTMLCanvasElement, x: number, y: number) {
  const d = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data
  return [d[0]!, d[1]!, d[2]!, d[3]!]
}

/** Counts pixels darker than mid-grey in a device-pixel box. */
function darkPixels(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const data = canvas.getContext('2d')!.getImageData(x, y, w, h).data
  let dark = 0
  for (let i = 0; i < data.length; i += 4) if (data[i]! < 128) dark++
  return dark
}

const canvasIn = (host: HTMLElement) =>
  host.querySelector<HTMLCanvasElement>('canvas[data-ink-canvas]')

describe('createPageRenderer', () => {
  it('renders the page into a DPR-sized canvas with text pixels where the text is', async () => {
    const doc = await openFixtureInBrowser('text-simple')
    const host = mountContainer(612, 792)
    const t = createPageTransform(doc.pages[0]!, 1, 0)
    const r = createPageRenderer({
      document: doc,
      page: 0,
      host,
      transform: t,
      devicePixelRatio: 2,
    })
    cleanup.push(() => (r.destroy(), doc.destroy(), host.remove()))
    await r.rendered
    const canvas = canvasIn(host)!
    expect(canvas.width).toBe(1224)
    expect(canvas.height).toBe(1584)
    expect(canvas.style.width).toBe('612px')
    expect(canvas.getAttribute('aria-hidden')).toBe('true')
    // blank area near the bottom-right is white
    expect(pixel(canvas, 1100, 1500)).toEqual([255, 255, 255, 255])
    // the first text line has its baseline at user y=700 → css y=92 → device 184; scan the band above it
    expect(darkPixels(canvas, 144, 160, 500, 24)).toBeGreaterThan(50)
  })

  it('cancels an in-flight render on update and ends with the new size', async () => {
    const doc = await openFixtureInBrowser('text-simple')
    const host = mountContainer(612, 792)
    const errors: unknown[] = []
    const r = createPageRenderer({
      document: doc,
      page: 0,
      host,
      transform: createPageTransform(doc.pages[0]!, 1, 0),
      devicePixelRatio: 1,
      onError: (e) => errors.push(e),
    })
    cleanup.push(() => (r.destroy(), doc.destroy(), host.remove()))
    const first = r.rendered
    r.update(createPageTransform(doc.pages[0]!, 2, 0))
    r.update(createPageTransform(doc.pages[0]!, 3, 90))
    await r.rendered
    // the superseded promise has settled too
    await expect(first).resolves.toBeUndefined()
    const canvases = host.querySelectorAll('canvas[data-ink-canvas]')
    expect(canvases).toHaveLength(1)
    const canvas = canvases[0] as HTMLCanvasElement
    expect(canvas.width).toBe(792 * 3)
    expect(canvas.height).toBe(612 * 3)
    expect(errors).toEqual([])
  })

  it('keeps the previous bitmap visible, CSS-scaled, until the new zoom lands', async () => {
    const doc = await openFixtureInBrowser('text-simple')
    const host = mountContainer(612, 792)
    const page = doc.pages[0]!
    const r = createPageRenderer({
      document: doc,
      page: 0,
      host,
      transform: createPageTransform(page, 1, 0),
      devicePixelRatio: 1,
    })
    cleanup.push(() => (r.destroy(), doc.destroy(), host.remove()))
    await r.rendered

    const zoomed = createPageTransform(page, 2, 0)
    r.update(zoomed)
    host.style.width = `${zoomed.cssWidth}px`
    host.style.height = `${zoomed.cssHeight}px`
    const probe = () => {
      const canvas = canvasIn(host)
      expect(canvas).not.toBeNull()
      // still the zoom-1 bitmap: first line's ink sits in device rows ~78..92
      expect(darkPixels(canvas!, 72, 76, 300, 18)).toBeGreaterThan(20)
    }
    probe() // same tick
    await nextFrame()
    probe() // next frame

    await r.rendered
    const canvas = canvasIn(host)!
    expect(canvas.width).toBe(zoomed.cssWidth)
    expect(canvas.style.width).toBe(`${zoomed.cssWidth}px`)
    // css y of baseline 700 at zoom 2 is 184; scan the band above it
    expect(darkPixels(canvas, 144, 160, 600, 24)).toBeGreaterThan(50)
  })

  it('reports render errors and keeps the previous bitmap', async () => {
    const doc = await openFixtureInBrowser('text-simple')
    const host = mountContainer(612, 792)
    const errors: unknown[] = []
    const r = createPageRenderer({
      document: doc,
      page: 0,
      host,
      transform: createPageTransform(doc.pages[0]!, 1, 0),
      devicePixelRatio: 1,
      onError: (e) => errors.push(e),
    })
    cleanup.push(() => (r.destroy(), doc.destroy(), host.remove()))
    await r.rendered
    const before = canvasIn(host)
    // Make the next page fetch fail.
    const boom = new Error('boom')
    const spy = vi.spyOn(doc._pdfjs, 'getPage').mockRejectedValueOnce(boom)
    cleanup.unshift(() => spy.mockRestore())
    r.update(createPageTransform(doc.pages[0]!, 2, 0))
    await r.rendered
    expect(errors).toEqual([boom])
    expect(canvasIn(host)).toBe(before)
  })

  it('draws embedded annotation appearances', async () => {
    const doc = await openFixtureInBrowser('annotated-shapes')
    const host = mountContainer(612, 792)
    const r = createPageRenderer({
      document: doc,
      page: 0,
      host,
      transform: createPageTransform(doc.pages[0]!, 1, 0),
      devicePixelRatio: 1,
    })
    cleanup.push(() => (r.destroy(), doc.destroy(), host.remove()))
    await r.rendered
    const canvas = canvasIn(host)!
    // the Square annotation has a red 3pt border at user x=72..200, y=500..600 → css top edge y = 792-600 = 192
    const [red, green] = pixel(canvas, 136, 193)
    expect(red).toBeGreaterThan(150)
    expect(green).toBeLessThan(120)
  })

  it('removes its element on destroy and settles rendered', async () => {
    const doc = await openFixtureInBrowser('text-simple')
    const host = mountContainer(612, 792)
    const r = createPageRenderer({
      document: doc,
      page: 0,
      host,
      transform: createPageTransform(doc.pages[0]!, 1, 0),
      devicePixelRatio: 1,
    })
    cleanup.push(() => (doc.destroy(), host.remove()))
    expect(r.element.parentElement).toBe(host)
    const pending = r.rendered
    r.destroy()
    await expect(pending).resolves.toBeUndefined()
    expect(host.querySelector('[data-ink-canvas-layer]')).toBeNull()
  })
})
