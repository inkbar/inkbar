import { afterEach, describe, expect, it, vi } from 'vitest'

import { openFixtureInBrowser } from '../dom/test-utils'

import { mountPdfjsTextLayer } from './text-layer'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

describe('mountPdfjsTextLayer', () => {
  it('drops a failed layer from the shared signal, so retries keep only the live one', async () => {
    const doc = await openFixtureInBrowser('text-simple')
    cleanup.push(() => doc.destroy())
    const pdfPage = await doc._pdfjs.getPage(0)
    const container = document.createElement('div')
    document.body.append(container)
    cleanup.push(() => container.remove())
    const viewport = pdfPage.getViewport({ scale: 1, rotation: 0 })

    // One signal for every attempt, as the DOM text layer uses for a page.
    const controller = new AbortController()
    const { signal } = controller
    const live = new Set<EventListenerOrEventListenerObject>()
    const add = signal.addEventListener.bind(signal)
    const remove = signal.removeEventListener.bind(signal)
    vi.spyOn(signal, 'addEventListener').mockImplementation((type, fn, options) => {
      if (type === 'abort' && fn) live.add(fn)
      add(type, fn, options)
    })
    vi.spyOn(signal, 'removeEventListener').mockImplementation((type, fn, options) => {
      if (type === 'abort' && fn) live.delete(fn)
      remove(type, fn, options)
    })
    const cancel = vi.spyOn(doc._pdfjs.module.TextLayer.prototype, 'cancel')
    cleanup.push(() => cancel.mockRestore())

    const stream = pdfPage.streamTextContent.bind(pdfPage)
    let failures = 2
    vi.spyOn(pdfPage, 'streamTextContent').mockImplementation((params) => {
      if (failures-- > 0)
        return new ReadableStream({
          start: (c) => c.error(new Error('No text from the engine')),
        })
      return stream(params)
    })
    const attempt = () =>
      mountPdfjsTextLayer({
        module: doc._pdfjs.module,
        pdfPage,
        container,
        viewport,
        signal,
      })

    await expect(attempt()).rejects.toThrow('No text from the engine')
    await expect(attempt()).rejects.toThrow('No text from the engine')
    expect(cancel).toHaveBeenCalledTimes(2)
    expect(live.size).toBe(0)
    const mounted = await attempt()
    expect(live.size).toBe(1)
    expect(container.querySelectorAll('span').length).toBeGreaterThan(0)

    // Aborting the shared signal cancels the live layer only.
    controller.abort()
    expect(cancel).toHaveBeenCalledTimes(3)
    mounted.cancel()
  })
})
