import { afterEach, describe, expect, it } from 'vitest'

import { withoutReplies } from '../model/annotations/threads'
import { writable } from '../model/readable'
import { renderRegion } from '../test-support/render-region'

import { createLoupeLayer } from './loupe-layer'
import { createOverlay } from './overlay'
import { createPageMount } from './page-mount'
import { createPageRenderer } from './page-renderer'
import { mountContainer, openFixtureInBrowser, until } from './test-utils'
import { createThumbnailPainter } from './thumbnails/thumbnail'
import { createPageTransform } from './transform'

import type { Annotation, LoupeAnnotation } from '../model/annotations/types'
import type { InkDocument } from '../model/document'

const cleanup: (() => void)[] = []
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((f) => f())
)

async function open(
  name: 'saved-annotations' | 'text-simple' | 'redact-foreign-popup'
): Promise<InkDocument> {
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

/** The canvas comparisons' tolerance: the mean difference per channel allowed. */
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

/** Page 0 as the reader draws it with every annotation the file holds. */
async function plainRender(doc: InkDocument): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  const info = doc.pages[0]!
  await doc._reader.draw(
    {
      page: 0,
      rotation: info.rotate,
      zoom: 1,
      pixelRatio: 1,
      width: Math.round(info.width),
      height: Math.round(info.height),
      hide: [],
    },
    canvas
  )
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

  it('a loupe whose file copy the canvas still paints renders its lens hidden, and shows rim and lens together', async () => {
    const doc = await open('text-simple')
    const loupe = doc.annotations.add({
      type: 'loupe',
      page: 0,
      rect: { x: 300, y: 500, width: 90, height: 90 },
    })
    const host = mountContainer(612, 792)
    // The gate the page mount gives the overlay, set by hand: on while the canvas paints it.
    let onCanvas = true
    const listeners = new Set<() => void>()
    const overlay = createOverlay({
      host,
      page: 0,
      store: doc.annotations,
      transform: createPageTransform(doc.pages[0]!, 1),
      document: doc,
      devicePixelRatio: 1,
      canvasCopies: {
        onCanvas: (a) => onCanvas && a.id === loupe.id,
        subscribe: (fn) => {
          listeners.add(fn)
          return () => listeners.delete(fn)
        },
      },
    })
    cleanup.push(() => {
      overlay.destroy()
      host.remove()
    })
    const el = overlay.elementFor(loupe.id)!
    const lens = () => el.querySelector<HTMLCanvasElement>('canvas[data-ink-loupe]')

    // In the gap the overlay paints no rim, and the lens is there but not shown.
    expect((el.firstElementChild as HTMLElement).dataset.inkHit).toBe('')
    expect(lens()).not.toBeNull()
    expect(getComputedStyle(lens()!).visibility).toBe('hidden')
    // Its region renders meanwhile.
    await until(() => lens()!.width > 0)
    const rendered = lens()!

    onCanvas = false
    listeners.forEach((fn) => fn())
    // The gate has released: the rim is painted and the same lens, already drawn, shows.
    expect((el.firstElementChild as HTMLElement).dataset.inkHit).toBeUndefined()
    expect(lens()).toBe(rendered)
    expect(el.firstElementChild).toBe(rendered)
    expect(getComputedStyle(rendered).visibility).toBe('visible')
    expect(rendered.width).toBeGreaterThan(0)
    expect(el.querySelector('svg')).not.toBeNull()
  })

  describe('while the page repaints without the file copies, each shows once', () => {
    /**
     * `saved-annotations` lifted, seen through a document whose lifted set the test sets, and
     * draws that wait for `release` while `hold` is on.
     */
    async function gap() {
      const saved = await open('saved-annotations')
      await saved._liftSettled
      const lifted = writable<ReadonlySet<string>>(new Set())
      const view = Object.create(saved, { _lifted: { value: lifted } }) as InkDocument
      const reader = saved._reader
      const draw = reader.draw.bind(reader)
      let held: Promise<void> | undefined
      let release = (): void => undefined
      // The draw itself, settling only once released.
      reader.draw = (...args) => {
        const wait = held
        const drawn = draw(...args)
        return wait ? drawn.then(() => wait) : drawn
      }
      cleanup.push(() => {
        release()
        reader.draw = draw
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
      const reader = saved._reader
      const drawing = reader.draw.bind(reader)
      reader.draw = async (...args) => {
        await drawing(...args)
        throw new Error('render failed')
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

describe("another program's redaction mark", () => {
  it('an adopted mark leaves the page canvas, and the overlay draws it once', async () => {
    const doc = await open('redact-foreign-popup')
    const page = mountPage(doc)
    await doc._liftSettled
    await page.renderer.rendered
    // The mark's appearance strokes pure red along its edge, at x 46 from y 191 to 224.
    const edge = (c: HTMLCanvasElement) => {
      const t = createPageTransform(doc.pages[0]!, 1)
      const ctx = c.getContext('2d')!
      return [195, 200, 207, 215, 220].map((y) => {
        const at = t.toCss({ x: 46, y })
        return [...ctx.getImageData(Math.round(at.x), Math.round(at.y), 1, 1).data]
      })
    }
    const red = ([r, g, b]: number[]) => r! > 200 && g! < 60 && b! < 60
    // The file draws it, so a page that still did would be red there.
    expect(edge(await plainRender(doc)).every(red)).toBe(true)
    expect(edge(page.canvas()).some(red)).toBe(false)

    const [mark] = doc.annotations.list.get()
    expect(mark).toMatchObject({ type: 'redact', source: 'session' })
    const drawn = [...page.overlay.element.querySelectorAll('[data-annotation]')].map(
      (e) => e.getAttribute('data-annotation')
    )
    expect(drawn).toEqual([mark!.id])
  })
})
