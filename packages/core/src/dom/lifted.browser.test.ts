import { afterEach, describe, expect, it } from 'vitest'

import { withoutReplies } from '../model/annotations/threads'
import { writable } from '../model/readable'
import { renderRegion } from '../pdfjs/render-region'

import { createLoupeLayer } from './loupe-layer'
import { createOverlay } from './overlay'
import { createPageMount } from './page-mount'
import { createPageRenderer } from './page-renderer'
import { mountContainer, openFixtureInBrowser, until } from './test-utils'
import { createThumbnailPainter } from './thumbnails/thumbnail'
import { createPageTransform } from './transform'

import type { Annotation, LoupeAnnotation } from '../model/annotations/types'
import type { InkDocument } from '../model/document'
import type { PdfjsPage } from '../pdfjs/types'

const cleanup: (() => void)[] = []
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((f) => f())
)

async function open(name: 'saved-annotations' | 'text-simple'): Promise<InkDocument> {
  const doc = await openFixtureInBrowser(name)
  cleanup.push(() => doc.destroy())
  return doc
}

const pixels = (c: HTMLCanvasElement) =>
  c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data

/** Mean absolute difference per channel between two same-sized canvases, 0 to 255. */
function meanDiff(a: HTMLCanvasElement, b: HTMLCanvasElement): number {
  expect([a.width, a.height]).toEqual([b.width, b.height])
  const pa = pixels(a)
  const pb = pixels(b)
  let sum = 0
  for (let i = 0; i < pa.length; i++) sum += Math.abs(pa[i]! - pb[i]!)
  return sum / pa.length
}

/** The canvas comparisons' tolerance (render-region.browser.test.ts). */
const TOLERANCE = 4

/** Page 0 drawn by a page renderer, as the viewer draws it, with its overlay. */
function mountPage(doc: InkDocument) {
  const host = mountContainer(612, 792)
  const transform = createPageTransform(doc.pages[0]!, 1)
  const renderer = createPageRenderer({
    document: doc,
    page: 0,
    host,
    transform,
    devicePixelRatio: 1,
  })
  const overlay = createOverlay({ host, page: 0, store: doc.annotations, transform })
  cleanup.push(() => {
    overlay.destroy()
    renderer.destroy()
    host.remove()
  })
  const canvas = () => host.querySelector<HTMLCanvasElement>('canvas[data-ink-canvas]')!
  return { host, renderer, overlay, canvas }
}

/** Page 0 as PDF.js draws it with every annotation the file holds. */
async function plainRender(doc: InkDocument): Promise<HTMLCanvasElement> {
  const page = await doc._pdfjs.getPage(0)
  const viewport = page.getViewport({ scale: 1 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  await page.render({
    canvas,
    viewport,
    background: '#ffffff',
    annotationMode: doc._pdfjs.module.AnnotationMode.ENABLE,
  }).promise
  return canvas
}

describe('annotations lifted from a file Inkbar saved', () => {
  it('leave the page canvas once lifted, and the overlay draws each once', async () => {
    const saved = await open('saved-annotations')
    const plain = await open('text-simple')
    // Mounted before the lift lands: the page renders again when it does.
    const page = mountPage(saved)
    await saved._liftSettled
    await page.renderer.rendered
    const reference = mountPage(plain)
    await reference.renderer.rendered

    // The file does draw them, so a page that still did would not match.
    expect(meanDiff(await plainRender(saved), reference.canvas())).toBeGreaterThan(
      TOLERANCE
    )
    expect(meanDiff(page.canvas(), reference.canvas())).toBeLessThan(TOLERANCE)

    const shown = withoutReplies(saved.annotations.list.get()).filter((a) => a.page === 0)
    expect(shown.length).toBeGreaterThan(10)
    expect(shown.every((a) => a.source === 'session')).toBe(true)
    const drawn = [...page.overlay.element.querySelectorAll('[data-annotation]')].map(
      (e) => e.getAttribute('data-annotation')
    )
    expect([...drawn].sort()).toEqual(shown.map((a) => a.id).sort())
  })

  it('leave the thumbnail canvas', async () => {
    const saved = await open('saved-annotations')
    const plain = await open('text-simple')
    const thumb = (doc: InkDocument) => {
      const el = document.createElement('div')
      document.body.prepend(el)
      const painter = createThumbnailPainter(
        el,
        { document: writable<InkDocument | null>(doc) },
        { page: 0, width: 306, annotations: false, marks: false }
      )
      cleanup.push(() => {
        painter.destroy()
        el.remove()
      })
      return () => el.querySelector<HTMLCanvasElement>('canvas')
    }
    const savedCanvas = thumb(saved)
    const plainCanvas = thumb(plain)
    await saved._liftSettled
    await until(() => plainCanvas() !== null)
    await until(() => {
      const c = savedCanvas()
      return c !== null && meanDiff(c, plainCanvas()!) < TOLERANCE
    }, 10_000)
    expect(meanDiff(savedCanvas()!, plainCanvas()!)).toBeLessThan(TOLERANCE)
  })

  it('leave a region render over one of them', async () => {
    const saved = await open('saved-annotations')
    const plain = await open('text-simple')
    await saved._liftSettled
    const square = saved.annotations.list
      .get()
      .find((a) => a.type === 'square' && a.page === 0)!
    const region = {
      x: square.rect.x - 10,
      y: square.rect.y - 10,
      width: square.rect.width + 20,
      height: square.rect.height + 20,
    }
    const [mine, theirs] = [
      document.createElement('canvas'),
      document.createElement('canvas'),
    ]
    await renderRegion(saved, 0, region, 2, mine)
    await renderRegion(plain, 0, region, 2, theirs)
    expect(meanDiff(mine, theirs)).toBeLessThan(TOLERANCE)
  })

  describe('render again when the lifted set changes from empty', () => {
    /** `doc` with a lifted set the test sets, empty to begin with. */
    async function withLiftedSet() {
      const saved = await open('saved-annotations')
      await saved._liftSettled
      const lifted = writable<ReadonlySet<string>>(new Set())
      const view = Object.create(saved, { _lifted: { value: lifted } }) as InkDocument
      return { saved, view, lift: () => lifted.set(saved._lifted.get()) }
    }

    it('the page renderer', async () => {
      const { view, lift } = await withLiftedSet()
      const plain = await open('text-simple')
      const page = mountPage(view)
      await page.renderer.rendered
      const reference = mountPage(plain)
      await reference.renderer.rendered
      expect(meanDiff(page.canvas(), reference.canvas())).toBeGreaterThan(TOLERANCE)
      lift()
      await page.renderer.rendered
      expect(meanDiff(page.canvas(), reference.canvas())).toBeLessThan(TOLERANCE)
    })

    it("the loupe layer's lenses", async () => {
      const { saved, view, lift } = await withLiftedSet()
      const plain = await open('text-simple')
      const loupe = saved.annotations.list
        .get()
        .find((a): a is LoupeAnnotation => a.type === 'loupe')!
      // Over the square, which the file draws.
      const square = saved.annotations.list.get().find((a) => a.type === 'square')!
      const a: LoupeAnnotation = {
        ...loupe,
        rect: { ...square.rect, width: 80, height: 80 },
      }
      const t = createPageTransform(saved.pages[0]!, 1)
      const lens = (doc: InkDocument) => {
        const layer = createLoupeLayer({ document: doc, devicePixelRatio: 1 })
        const el = document.createElement('div')
        layer.attach(el, a, t)
        cleanup.push(() => layer.destroy())
        return el.querySelector<HTMLCanvasElement>('canvas')!
      }
      const mine = lens(view)
      const theirs = lens(plain)
      await until(() => mine.width > 0 && theirs.width > 0)
      expect(meanDiff(mine, theirs)).toBeGreaterThan(TOLERANCE)
      lift()
      await until(() => meanDiff(mine, theirs) < TOLERANCE)
    })
  })

  describe('while the page repaints without the file copies, each shows once', () => {
    /** `task` with `promise` in place of its own: PDF.js's `promise` is a getter. */
    const withPromise = <T extends { promise: Promise<void> }>(
      task: T,
      promise: Promise<void>
    ): T => Object.create(task, { promise: { value: promise } }) as T

    /**
     * `saved-annotations` lifted, seen through a document whose lifted set the test sets, and
     * renders of page 0 that wait for `release` while `hold` is on.
     */
    async function gap() {
      const saved = await open('saved-annotations')
      await saved._liftSettled
      const lifted = writable<ReadonlySet<string>>(new Set())
      const view = Object.create(saved, { _lifted: { value: lifted } }) as InkDocument
      const page: PdfjsPage = await saved._pdfjs.getPage(0)
      const render = page.render.bind(page)
      let held: Promise<void> | undefined
      let release = (): void => undefined
      page.render = (params) => {
        const task = render(params)
        const wait = held
        if (!wait) return task
        // The task itself, its promise settling only once released.
        return withPromise(
          task,
          task.promise.then(() => wait)
        )
      }
      cleanup.push(() => {
        release()
        page.render = render
      })
      return {
        saved,
        view,
        /** Lifts in the view, with every render from now held until `release`. */
        lift: () => {
          held = new Promise<void>((resolve) => {
            release = () => {
              held = undefined
              resolve()
            }
          })
          lifted.set(saved._lifted.get())
        },
        release: () => release(),
      }
    }

    /** Page 0 drawn as the viewer draws it: canvas, overlay and mask layer together. */
    function mountFull(doc: InkDocument) {
      const host = mountContainer(612, 792)
      const mount = createPageMount({
        document: doc,
        page: 0,
        host,
        transform: createPageTransform(doc.pages[0]!, 1),
        store: doc.annotations,
        devicePixelRatio: 1,
      })
      cleanup.push(() => {
        mount.destroy()
        host.remove()
      })
      const canvas = () =>
        host.querySelector<HTMLCanvasElement>('canvas[data-ink-canvas]')!
      return { host, mount, canvas }
    }

    /** Whether the overlay paints `a`, rather than giving it only an invisible hit area. */
    const paints = (el: HTMLElement | undefined) =>
      el !== undefined &&
      (el.firstElementChild as HTMLElement | null)?.dataset.inkHit !== ''

    const shownOn0 = (doc: InkDocument): Annotation[] =>
      withoutReplies(doc.annotations.list.get()).filter((a) => a.page === 0)

    /** The canvas with the page's mask layer drawn over it: what the page shows of the dimming. */
    async function withMaskLayer(
      canvas: HTMLCanvasElement,
      host: HTMLElement
    ): Promise<HTMLCanvasElement> {
      const out = document.createElement('canvas')
      out.width = canvas.width
      out.height = canvas.height
      const ctx = out.getContext('2d')!
      ctx.drawImage(canvas, 0, 0)
      const svg = host.querySelector('.ink-mask-layer')
      if (svg) {
        const img = new Image()
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
          new XMLSerializer().serializeToString(svg)
        )}`
        await img.decode()
        ctx.drawImage(img, 0, 0, out.width, out.height)
      }
      return out
    }

    /** An empty stretch of page 0 away from every annotation but the mask's dimming. */
    function crop(canvas: HTMLCanvasElement): HTMLCanvasElement {
      const out = document.createElement('canvas')
      out.width = 280
      out.height = 160
      // User space x 320–600, y 20–180 on a 792 pt page at zoom 1.
      out.getContext('2d')!.drawImage(canvas, 320, 612, 280, 160, 0, 0, 280, 160)
      return out
    }

    it('on the page: the canvas paints them until its render lands, then the overlay', async () => {
      const { saved, view, lift, release } = await gap()
      const plain = await open('text-simple')
      const page = mountFull(view)
      await page.mount.renderer.rendered
      const reference = mountFull(plain)
      await reference.mount.renderer.rendered
      const fileCopies = await plainRender(saved)

      lift()
      // The render that leaves the file copies out is held: the canvas still paints them.
      const shown = shownOn0(saved)
      expect(page.mount.renderer.fileCopies.get().size).toBe(saved._lifted.get().size)
      for (const a of shown)
        expect(paints(page.mount.overlay.elementFor(a.id)), a.type).toBe(false)
      expect(meanDiff(page.canvas(), fileCopies)).toBeLessThan(TOLERANCE)
      expect(page.host.querySelector('.ink-mask-layer')).toBeNull()
      // The page is dimmed once, by the file's mask.
      const dimmed = crop(fileCopies)
      expect(meanDiff(crop(reference.canvas()), dimmed)).toBeGreaterThan(TOLERANCE)
      expect(
        meanDiff(crop(await withMaskLayer(page.canvas(), page.host)), dimmed)
      ).toBeLessThan(TOLERANCE)

      // An edit made now is the overlay's to paint at once.
      const square = shown.find((a) => a.type === 'square')!
      saved.annotations.update(square.id, { color: '#00AA00' })
      expect(paints(page.mount.overlay.elementFor(square.id))).toBe(true)
      for (const a of shown.filter((x) => x.id !== square.id))
        expect(paints(page.mount.overlay.elementFor(a.id)), a.type).toBe(false)

      release()
      await page.mount.renderer.rendered
      expect(page.mount.renderer.fileCopies.get().size).toBe(0)
      for (const a of shown)
        expect(paints(page.mount.overlay.elementFor(a.id)), a.type).toBe(true)
      expect(meanDiff(page.canvas(), reference.canvas())).toBeLessThan(TOLERANCE)
      // Dimmed once still, now by the overlay's mask.
      expect(page.host.querySelector('.ink-mask-layer')).not.toBeNull()
      expect(
        meanDiff(crop(await withMaskLayer(page.canvas(), page.host)), dimmed)
      ).toBeLessThan(TOLERANCE)
    })

    it('in the thumbnail: the canvas paints them until its render lands, then the annotations layer', async () => {
      const { saved, view, lift, release } = await gap()
      const el = document.createElement('div')
      document.body.prepend(el)
      const painter = createThumbnailPainter(
        el,
        { document: writable<InkDocument | null>(view) },
        { page: 0, width: 306, marks: false }
      )
      cleanup.push(() => {
        painter.destroy()
        el.remove()
      })
      const drawnIds = () =>
        [...el.querySelectorAll<HTMLElement>('.ink-thumbnail-annotations > *')].length
      await until(() => el.querySelector('canvas') !== null)
      const shown = shownOn0(saved).length
      // Before the view lifts, the canvas has nothing to leave to the layer.
      expect(drawnIds()).toBe(shown)

      lift()
      expect(drawnIds()).toBe(0)
      release()
      await until(() => drawnIds() === shown)
    })

    it('after a failed render, the overlay paints them', async () => {
      const { saved, view, lift, release } = await gap()
      const page = mountFull(view)
      await page.mount.renderer.rendered
      const pdfPage = await saved._pdfjs.getPage(0)
      const real = pdfPage.render.bind(pdfPage)
      pdfPage.render = (params) => {
        const task = real(params)
        return withPromise(
          task,
          task.promise.then(() => {
            throw new Error('render failed')
          })
        )
      }
      lift()
      release()
      await page.mount.renderer.rendered
      expect(page.mount.renderer.fileCopies.get().size).toBe(0)
      for (const a of shownOn0(saved))
        expect(paints(page.mount.overlay.elementFor(a.id)), a.type).toBe(true)
    })
  })
})
