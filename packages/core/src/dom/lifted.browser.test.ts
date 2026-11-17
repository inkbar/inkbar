import { afterEach, describe, expect, it } from 'vitest'

import { withoutReplies } from '../model/annotations/threads'
import { writable } from '../model/readable'
import { renderRegion } from '../pdfjs/render-region'

import { createLoupeLayer } from './loupe-layer'
import { createOverlay } from './overlay'
import { createPageRenderer } from './page-renderer'
import { mountContainer, openFixtureInBrowser, until } from './test-utils'
import { createThumbnailPainter } from './thumbnails/thumbnail'
import { createPageTransform } from './transform'

import type { LoupeAnnotation } from '../model/annotations/types'
import type { InkDocument } from '../model/document'

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
})
