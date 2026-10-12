import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPageRenderer } from './page-renderer'
import { mountContainer, nextFrame, openFixtureInBrowser, until } from './test-utils'
import { createPageTransform } from './transform'

import type { InkDocument } from '../model/document'

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

type PdfPage = Awaited<ReturnType<InkDocument['_pdfjs']['getPage']>>
type RenderTask = ReturnType<PdfPage['render']>

/** Resolves with the first render task PDF.js starts for `page`, as soon as it starts. */
function renderStarts(page: PdfPage): Promise<RenderTask> {
  const original = page.render.bind(page)
  return new Promise((resolve) => {
    const spy = vi.spyOn(page, 'render').mockImplementation((params) => {
      const task = original(params)
      resolve(task)
      return task
    })
    cleanup.unshift(() => spy.mockRestore())
  })
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
    // blank area near the bottom-right is opaque white: pages render on a white background
    const [r0, g0, b0, alpha] = pixel(canvas, 1100, 1500)
    expect([r0, g0, b0]).toEqual([255, 255, 255])
    expect(alpha).toBe(255)
    // the first text line has its baseline at user y=700 → css y=92 → device 184; scan the band above it
    expect(darkPixels(canvas, 144, 160, 500, 24)).toBeGreaterThan(50)
  })

  it('cancels an in-flight render on update and ends with the new size', async () => {
    const doc = await openFixtureInBrowser('text-simple')
    const host = mountContainer(612, 792)
    const errors: unknown[] = []
    const started = renderStarts(await doc._pdfjs.getPage(0))
    const r = createPageRenderer({
      document: doc,
      page: 0,
      host,
      transform: createPageTransform(doc.pages[0]!, 1, 0),
      devicePixelRatio: 1,
      onError: (e) => errors.push(e),
    })
    cleanup.push(() => (r.destroy(), doc.destroy(), host.remove()))
    // Wait for the first PDF.js render task to be in flight before superseding it.
    const firstTask = await started
    const firstOutcome = firstTask.promise.then(
      () => 'completed',
      (e: unknown) => (e as { name?: string }).name
    )
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
    expect(await firstOutcome).toBe('RenderingCancelledException')
  })

  it('zeroes a canvas it replaces or drops, so its bitmap is freed at once', async () => {
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
    await r.rendered
    const first = canvasIn(host)!
    expect(first.width).toBe(612)
    r.update(createPageTransform(doc.pages[0]!, 2, 0))
    await r.rendered
    const second = canvasIn(host)!
    expect(second).not.toBe(first)
    expect([first.width, first.height]).toEqual([0, 0])
    expect(first.isConnected).toBe(false)
    expect(second.width).toBe(1224)
    r.destroy()
    expect([second.width, second.height]).toEqual([0, 0])
  })

  it('follows window.devicePixelRatio when none is given', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')
    const setDpr = (value: number) =>
      Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true })
    cleanup.push(() => {
      if (original) Object.defineProperty(window, 'devicePixelRatio', original)
      else delete (window as { devicePixelRatio?: number }).devicePixelRatio
    })
    setDpr(1)
    const doc = await openFixtureInBrowser('text-simple')
    const host = mountContainer(612, 792)
    const t = createPageTransform(doc.pages[0]!, 1, 0)
    const r = createPageRenderer({ document: doc, page: 0, host, transform: t })
    cleanup.unshift(() => (r.destroy(), doc.destroy(), host.remove()))
    await r.rendered
    expect(canvasIn(host)!.width).toBe(t.cssWidth)

    setDpr(2)
    r.update(t)
    await r.rendered
    const canvas = canvasIn(host)!
    expect(canvas.width).toBe(t.cssWidth * 2)
    expect(canvas.height).toBe(t.cssHeight * 2)
    expect(canvas.style.width).toBe(`${t.cssWidth}px`)
  })

  it('re-arms the DPR watcher when the query fires before devicePixelRatio moves', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')
    const setDpr = (value: number) =>
      Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true })
    cleanup.push(() => {
      if (original) Object.defineProperty(window, 'devicePixelRatio', original)
      else delete (window as { devicePixelRatio?: number }).devicePixelRatio
    })
    // A controllable stand-in for the resolution media queries.
    const queries: { media: string; listeners: Set<() => void> }[] = []
    const matchMedia = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((media: string) => {
        const q = { media, listeners: new Set<() => void>() }
        queries.push(q)
        return {
          media,
          matches: true,
          addEventListener: (_: string, fn: () => void) => q.listeners.add(fn),
          removeEventListener: (_: string, fn: () => void) => q.listeners.delete(fn),
        } as unknown as MediaQueryList
      })
    cleanup.unshift(() => matchMedia.mockRestore())
    const armed = () => queries.filter((q) => q.listeners.size > 0).map((q) => q.media)

    setDpr(1)
    const doc = await openFixtureInBrowser('text-simple')
    const host = mountContainer(612, 792)
    const t = createPageTransform(doc.pages[0]!, 1, 0)
    const r = createPageRenderer({ document: doc, page: 0, host, transform: t })
    cleanup.unshift(() => (r.destroy(), doc.destroy(), host.remove()))
    await r.rendered
    expect(armed()).toEqual(['(resolution: 1dppx)'])

    // The query fires mid-transition: devicePixelRatio still reads 1.
    const fired = queries.find((q) => q.listeners.size > 0)!
    fired.listeners.forEach((fn) => fn())
    await r.rendered
    expect(canvasIn(host)!.width).toBe(t.cssWidth)
    // Then the ratio settles at 2; no further event arrives.
    setDpr(2)
    await until(() => canvasIn(host)?.width === t.cssWidth * 2, 3000)
    await r.rendered
    expect(canvasIn(host)!.height).toBe(t.cssHeight * 2)
    expect(armed()).toEqual(['(resolution: 2dppx)'])

    r.destroy()
    expect(armed()).toEqual([])
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
