import { browserAssets, fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { readerKind } from '../reader/select'
import { stoppableEngines } from '../test-support/stoppable-engines'

import { mountContainer, settle, until } from './test-utils'
import { createThumbnails } from './thumbnails/list'
import {
  createViewer,
  type CreateViewerOptions,
  type Viewer,
} from './viewer/create-viewer'

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = `${themeCss}\n.ink-scroll { height: 500px; }`
  document.head.append(style)
})

let cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.forEach((f) => f())
  cleanup = []
})

/** Engines the test can stop, as the document's, until the test ends. */
function engines() {
  const made = stoppableEngines()
  cleanup.push(() => made.restore())
  return made
}

function make(
  name: FixtureName = 'text-simple',
  opts: Partial<CreateViewerOptions> = {}
) {
  const host = mountContainer(800, 600)
  const viewer = createViewer(host, {
    source: fixtureUrl(name),
    assets: browserAssets(),
    zoom: 1,
    buffer: 0,
    ...opts,
  })
  cleanup.push(() => {
    viewer.destroy()
    host.remove()
  })
  return viewer
}

async function ready(viewer: Viewer) {
  await until(() => viewer.status.get().state === 'ready' && viewer.engine.get() !== null)
  const doc = viewer.document.get()!
  const scroll = viewer.element.querySelector<HTMLElement>('[data-ink-scroll]')!
  const page = (n: number) =>
    scroll.querySelector<HTMLElement>(`.ink-page[data-page="${n}"]`)
  const drawnOn = (n: number) => page(n)?.querySelector('canvas[data-ink-canvas]') ?? null
  await until(() => drawnOn(0) !== null)
  return { doc, scroll, page, drawnOn }
}

const notice = (viewer: Viewer) =>
  viewer.element.querySelector<HTMLElement>('[data-ink-engine-notice]')
const retry = (viewer: Viewer) =>
  viewer.element.querySelector<HTMLButtonElement>('[data-ink-engine-retry]')

const STOPPED = 'The viewer stopped working. Your changes are kept.'

// With PDF.js reading the file nothing can stop: these run where the engine reads it.
describe.skipIf(readerKind() !== 'engine')(
  'the notice when the viewer has stopped',
  () => {
    it('shows while the document is stopped, over the pages, and goes once it starts again', async () => {
      const stop = engines()
      const viewer = make()
      const { doc, scroll } = await ready(viewer)
      expect(notice(viewer)).toBeNull()

      await stop.stop(doc)
      const shown = notice(viewer)!
      expect(shown).not.toBeNull()
      expect(shown.getAttribute('role')).toBe('alert')
      expect(shown.textContent).toContain(STOPPED)
      expect(retry(viewer)!.textContent).toBe('Try again')
      expect(retry(viewer)!.type).toBe('button')
      // Over the pages, outside them: they take no input meanwhile, and the notice does.
      expect(scroll.contains(shown)).toBe(false)
      expect(shown.closest('[inert]')).toBeNull()
      expect(getComputedStyle(shown).position).toBe('absolute')
      const top = shown.getBoundingClientRect().top
      expect(top).toBeLessThan(scroll.getBoundingClientRect().top + 50)
      scroll.scrollTop = 400
      await settle()
      expect(scroll.scrollTop).toBeGreaterThan(0)
      expect(shown.getBoundingClientRect().top).toBe(top)

      stop.allow()
      await userEvent.click(retry(viewer)!)
      await until(() => notice(viewer) === null)
      expect(doc.engineStopped.get()).toBe(false)
    })

    it('is busy while it starts again, and a second press does nothing', async () => {
      const stop = engines()
      const viewer = make()
      const { doc } = await ready(viewer)
      await stop.stop(doc)
      stop.allow()
      const release = stop.hold()
      const restart = vi.spyOn(doc, 'restartEngine')
      const button = retry(viewer)!
      button.click()
      expect(button.getAttribute('aria-busy')).toBe('true')
      expect(notice(viewer)!.textContent).toContain('Starting again…')
      expect(notice(viewer)!.textContent).not.toContain(STOPPED)
      button.click()
      expect(restart).toHaveBeenCalledTimes(1)

      release()
      await until(() => notice(viewer) === null)
      expect(restart).toHaveBeenCalledTimes(1)
    })

    it('stays, with its first words, when the restart fails', async () => {
      const stop = engines()
      const viewer = make()
      const { doc } = await ready(viewer)
      await stop.stop(doc)
      const release = stop.hold()
      const button = retry(viewer)!
      button.focus()
      button.click()
      await until(() => button.getAttribute('aria-busy') === 'true')
      release()
      await until(() => button.getAttribute('aria-busy') !== 'true')
      expect(notice(viewer)).not.toBeNull()
      expect(notice(viewer)!.textContent).toContain(STOPPED)
      expect(doc.engineStopped.get()).toBe(true)
      // The same button, still focused: pressing it again tries again.
      expect(retry(viewer)).toBe(button)
      expect(document.activeElement).toBe(button)
    })

    it('takes the words of a new language in place', async () => {
      const stop = engines()
      const viewer = make()
      const { doc } = await ready(viewer)
      await stop.stop(doc)
      const shown = notice(viewer)
      viewer.setMessages({
        viewer: {
          engineStopped: 'Stopped.',
          engineRetry: 'Again',
          engineRestarting: 'Starting…',
        },
      })
      expect(notice(viewer)).toBe(shown)
      expect(shown!.textContent).toContain('Stopped.')
      expect(retry(viewer)!.textContent).toBe('Again')
      const release = stop.hold()
      retry(viewer)!.click()
      expect(shown!.textContent).toContain('Starting…')
      release()
      await until(() => retry(viewer)!.getAttribute('aria-busy') !== 'true')
      expect(shown!.textContent).toContain('Stopped.')
    })

    it('takes focus from the pages, which take no input meanwhile, to its button', async () => {
      const stop = engines()
      const viewer = make()
      const { doc, scroll } = await ready(viewer)
      scroll.focus()
      expect(document.activeElement).toBe(scroll)
      await stop.stop(doc)
      expect(document.activeElement).toBe(retry(viewer))
    })

    it('leaves focus outside the pages where it is', async () => {
      const stop = engines()
      const viewer = make()
      const outside = document.createElement('button')
      document.body.append(outside)
      cleanup.push(() => outside.remove())
      const { doc } = await ready(viewer)
      outside.focus()
      await stop.stop(doc)
      expect(notice(viewer)).not.toBeNull()
      expect(document.activeElement).toBe(outside)
    })

    it('gives focus to the document when it goes while its button has focus', async () => {
      const stop = engines()
      const viewer = make()
      const { doc, scroll } = await ready(viewer)
      await stop.stop(doc)
      stop.allow()
      retry(viewer)!.focus()
      retry(viewer)!.click()
      await until(() => notice(viewer) === null)
      expect(document.activeElement).toBe(scroll)
    })

    it('draws every mounted page and thumbnail again once started, without scrolling', async () => {
      const stop = engines()
      const onPageError = vi.fn()
      const viewer = make('text-simple', { onPageError })
      const box = document.createElement('div')
      box.style.cssText = 'height:400px;width:200px;'
      document.body.prepend(box)
      cleanup.push(() => box.remove())
      const list = box.appendChild(createThumbnails(viewer))
      const { doc, scroll, page, drawnOn } = await ready(viewer)
      const thumbCanvases = () => [...list.querySelectorAll('.ink-thumbnail canvas')]
      await until(() => thumbCanvases().length > 0)
      const thumbsBefore = thumbCanvases()

      await stop.stop(doc)
      // A page that mounts while stopped: its blank placeholder, with no page error.
      scroll.scrollTop = scroll.scrollHeight
      await until(() => page(2) !== null)
      await settle(200)
      expect(drawnOn(2)).toBeNull()
      expect(page(2)!.querySelector('[data-ink-page-error]')).toBeNull()
      expect(page(2)!.hasAttribute('data-state')).toBe(false)
      expect(onPageError).not.toHaveBeenCalled()
      const pagesBefore = [...scroll.querySelectorAll('canvas[data-ink-canvas]')]

      stop.allow()
      retry(viewer)!.click()
      await until(() => notice(viewer) === null)
      // The page that missed out, and the ones drawn before: every canvas is a new one.
      await until(() => drawnOn(2) !== null)
      await until(() =>
        [...scroll.querySelectorAll('canvas[data-ink-canvas]')].every(
          (c) => !pagesBefore.includes(c)
        )
      )
      await until(() => {
        const now = thumbCanvases()
        return (
          now.length >= thumbsBefore.length && now.every((c) => !thumbsBefore.includes(c))
        )
      })
      expect(onPageError).not.toHaveBeenCalled()
    })

    it('keeps a page’s image, stretched, when it is zoomed while stopped', async () => {
      const stop = engines()
      const pageErrors: unknown[] = []
      const viewer = make('text-simple', {
        onPageError: (_page, error) => {
          if (error) pageErrors.push(error)
        },
      })
      const { doc, page, drawnOn } = await ready(viewer)
      await stop.stop(doc)
      const canvas = drawnOn(0)!
      const width = canvas.getBoundingClientRect().width
      viewer.viewport.get()!.setZoom(1.5)
      await settle(300)
      expect(drawnOn(0)).toBe(canvas)
      expect(canvas.getBoundingClientRect().width).toBeCloseTo(width * 1.5, 0)
      expect(page(0)!.querySelector('[data-ink-page-error]')).toBeNull()
      expect(pageErrors).toEqual([])
    })

    it('pauses annotating: the pages take no input, while scrolling and zoom work', async () => {
      const stop = engines()
      const viewer = make('form-fields')
      const { doc, scroll } = await ready(viewer)
      expect(scroll.inert).toBe(false)
      await stop.stop(doc)
      expect(scroll.inert).toBe(true)
      const field = scroll.querySelector<HTMLInputElement>('[data-ink-form-layer] input')
      if (field) {
        field.focus()
        expect(document.activeElement).not.toBe(field)
      }
      viewer.viewport.get()!.setZoom(2)
      expect(viewer.viewport.get()!.zoom.get()).toBe(2)
      scroll.scrollTop = 300
      expect(scroll.scrollTop).toBe(300)

      stop.allow()
      retry(viewer)!.click()
      await until(() => notice(viewer) === null)
      expect(scroll.inert).toBe(false)
    })

    it('a page error that is not the stop still shows', async () => {
      engines()
      const viewer = make()
      const { doc, page } = await ready(viewer)
      // A failure of the page's own, with the document reading: the page says so.
      vi.spyOn(doc._reader, 'draw').mockRejectedValue(new Error('broken page'))
      viewer.viewport.get()!.setZoom(1.25)
      await until(() => page(0)!.querySelector('[data-ink-page-error]') !== null)
      expect(notice(viewer)).toBeNull()
    })

    it('unmounting during a restart throws nothing and leaves nothing behind', async () => {
      const stop = engines()
      const viewer = make()
      const { doc } = await ready(viewer)
      await stop.stop(doc)
      stop.allow()
      const release = stop.hold()
      const restarting = vi.spyOn(doc, 'restartEngine')
      retry(viewer)!.click()
      const element = viewer.element
      viewer.destroy()
      expect(element.querySelector('[data-ink-engine-notice]')).toBeNull()
      expect(document.querySelector('[data-ink-engine-notice]')).toBeNull()
      release()
      await expect(restarting.mock.results[0]!.value).rejects.toMatchObject({
        code: 'DocumentDestroyed',
      })
      await settle()
    })
  }
)

// The PDF.js reader never stops: nothing shows and the pages take input.
describe.skipIf(readerKind() === 'engine')('the notice with PDF.js reading', () => {
  it('never shows', async () => {
    const viewer = make()
    const { doc, scroll } = await ready(viewer)
    expect(doc.engineStopped.get()).toBe(false)
    expect(notice(viewer)).toBeNull()
    expect(scroll.inert).toBe(false)
  })
})
