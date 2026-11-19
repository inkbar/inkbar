import { browserAssets, fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import { fontUrls } from '@inkbar/fonts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createLoupeLayer } from '../dom/loupe-layer'
import { createPageRenderer } from '../dom/page-renderer'
import { mountContainer, openFixtureInBrowser, until } from '../dom/test-utils'
import { createThumbnailPainter } from '../dom/thumbnails/thumbnail'
import { createPageTransform } from '../dom/transform'
import { createViewer } from '../dom/viewer/create-viewer'
import { openDocument, type EngineLoader, type InkDocument } from '../model/document'
import { writable } from '../model/readable'

import type { Rect } from '../model/geometry'

const flag = globalThis as { __INKBAR_READER__?: unknown }

let cleanup: (() => void)[] = []
beforeEach(() => {
  flag.__INKBAR_READER__ = 'engine'
})
afterEach(() => {
  delete flag.__INKBAR_READER__
  vi.restoreAllMocks()
  cleanup.reverse().forEach((f) => f())
  cleanup = []
})

/** The real engine, as a host passes it. */
const realEngine = () => vi.fn<EngineLoader>(() => import('@inkbar/engine'))

/** The real engine with the fallback fonts served at /inkbar-fonts/, as the sandbox passes it. */
const withFonts = (): EngineLoader => async () => {
  const real = await import('@inkbar/engine')
  return {
    createEngine: () => real.createEngine({ fallbackFonts: fontUrls('/inkbar-fonts/') }),
  }
}

async function open(
  name: FixtureName,
  opts: { engine?: EngineLoader; password?: string } = {}
): Promise<InkDocument> {
  const doc = await openFixtureInBrowser(name, { engine: realEngine(), ...opts })
  cleanup.push(() => doc.destroy())
  return doc
}

/** Pixels darker than mid-grey in a device-pixel box of `canvas`. */
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

/** Page `page` of `doc` drawn by a page canvas at zoom 1 and pixel ratio 1. */
async function mountPage(doc: InkDocument, page = 0): Promise<HTMLCanvasElement> {
  const info = doc.pages[page]!
  const host = mountContainer(info.width, info.height)
  const renderer = createPageRenderer({
    document: doc,
    page,
    host,
    transform: createPageTransform(info, 1, 0),
    devicePixelRatio: 1,
  })
  cleanup.push(() => {
    renderer.destroy()
    host.remove()
  })
  await renderer.rendered
  return host.querySelector<HTMLCanvasElement>('canvas[data-ink-canvas]')!
}

const fallbackWarnings = (warn: { mock: { calls: unknown[][] } }) =>
  warn.mock.calls.filter((args) => String(args[0]).includes('no fallback font'))

describe('the engine reader, behind the switch', () => {
  it('draws a page through the engine', async () => {
    const doc = await open('text-simple')
    expect(doc._reader.kind).toBe('engine')
    expect(doc._reader.pageCount).toBe(3)
    const canvas = await mountPage(doc)
    expect([canvas.width, canvas.height]).toEqual([612, 792])
    // The first line of text starts at (72, 700) in user space: CSS y 42 to 92 at zoom 1.
    expect(darkPixels(canvas, 72, 42, 50, 50)).toBeGreaterThan(50)
    // The margin above it is paper.
    expect(darkPixels(canvas, 0, 0, 612, 30)).toBe(0)
  })

  it.each([
    'text-simple',
    'text-rotated-90',
    'text-rotated-180',
    'text-rotated-270',
    'cropbox-offset',
    'userunit-2',
  ] as const)('lists the same page facts as PDF.js, on %s', async (name) => {
    const doc = await open(name)
    expect(doc._reader.kind).toBe('engine')
    delete flag.__INKBAR_READER__
    const plain = await open(name)
    expect(plain._reader.kind).toBe('pdfjs')
    expect(doc.pages).toEqual(plain.pages)
  })

  it('a thumbnail and a loupe paint through the engine', async () => {
    const doc = await open('text-simple')
    const draw = vi.spyOn(doc._reader, 'draw')

    const el = document.createElement('div')
    document.body.prepend(el)
    const painter = createThumbnailPainter(el, { document: writable(doc) }, { page: 0 })
    cleanup.push(() => {
      painter.destroy()
      el.remove()
    })
    await until(() => el.querySelector('canvas') !== null, 10_000)
    expect(draw).toHaveBeenCalled()
    await expect(draw.mock.results[0]!.value).resolves.toBeUndefined()

    draw.mockClear()
    const layer = createLoupeLayer({ document: doc, devicePixelRatio: 1 })
    cleanup.push(() => layer.destroy())
    const rect: Rect = { x: 72, y: 690, width: 120, height: 60 }
    const a = doc.annotations.add({ type: 'loupe', page: 0, rect })
    if (a.type !== 'loupe') throw new Error('not a loupe')
    const lens = document.createElement('div')
    layer.attach(lens, a, createPageTransform(doc.pages[0]!, 2, 0))
    await until(() => draw.mock.calls.length > 0)
    const [request] = draw.mock.calls[0]!
    expect(request.region).toBeDefined()
    await draw.mock.results[0]!.value
    const canvas = lens.querySelector('canvas')!
    await until(() => canvas.width > 0)
    expect(darkPixels(canvas, 0, 0, canvas.width, canvas.height)).toBeGreaterThan(50)
  })

  it('opens an encrypted file with its password and draws it', async () => {
    const doc = await open('encrypted-aes', { password: 'inkbar' })
    expect(doc._reader.kind).toBe('engine')
    const canvas = await mountPage(doc)
    expect(darkPixels(canvas, 0, 0, canvas.width, canvas.height)).toBeGreaterThan(50)
  })

  it('needs the engine option', async () => {
    const doc = await openDocument(fixtureUrl('text-simple'), { assets: browserAssets() })
    cleanup.push(() => doc.destroy())
    await expect(doc.ready).rejects.toMatchObject({ code: 'EngineUnavailable' })
  })

  it('with the switch off, reads with PDF.js and does not load the engine at open', async () => {
    delete flag.__INKBAR_READER__
    const loader = realEngine()
    const doc = await open('text-simple', { engine: loader })
    expect(doc._reader.kind).toBe('pdfjs')
    expect(loader).not.toHaveBeenCalled()
  })

  it('draws unembedded Japanese with the fallback fonts, and warns once without them', async () => {
    // Kept out of the test output: the warning is expected and checked below.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // The two Japanese lines sit at baselines 790 and 740 on an A4 page: CSS y 52 to 152.
    const band = (canvas: HTMLCanvasElement) => darkPixels(canvas, 72, 52, 328, 100)

    const doc = await open('unembedded-japanese', { engine: withFonts() })
    expect(band(await mountPage(doc))).toBeGreaterThan(500)
    expect(fallbackWarnings(warn)).toEqual([])

    const bare = await open('unembedded-japanese')
    await mountPage(bare)
    await mountPage(bare)
    expect(fallbackWarnings(warn)).toEqual([
      [
        'Inkbar: no fallback font for "japanese" text; some text on this page is drawn with a substitute.',
      ],
    ])
  })
})

describe('reopening after applying redactions', () => {
  it('opens the redacted bytes in a new engine reader and destroys the old one', async () => {
    const host = mountContainer(800, 600)
    const viewer = createViewer(host, {
      source: fixtureUrl('redact-text'),
      assets: browserAssets(),
      zoom: 1,
      engine: realEngine(),
      redactionConfirm: false,
    })
    cleanup.push(() => {
      viewer.destroy()
      host.remove()
    })
    await until(
      () => viewer.status.get().state === 'ready' && viewer.engine.get() !== null
    )
    const doc = viewer.document.get()!
    const old = doc._reader
    expect(old.kind).toBe('engine')
    const destroyOld = vi.spyOn(old, 'destroy')
    const mark: Rect = { x: 45, y: 190, width: 170, height: 35 }

    /** The mark's place, drawn by `reader` at 2 px per point. */
    const drawMark = async (d: InkDocument): Promise<HTMLCanvasElement> => {
      const canvas = document.createElement('canvas')
      await d._reader.draw(
        {
          page: 0,
          rotation: 0,
          zoom: 2,
          pixelRatio: 1,
          width: 340,
          height: 70,
          region: mark,
          hide: [],
        },
        canvas
      )
      return canvas
    }
    const before = darkPixels(await drawMark(doc), 0, 0, 340, 70)

    doc.annotations.add({ type: 'redact', page: 0, rect: mark })
    await expect(viewer.applyRedactions()).resolves.toMatchObject({ marks: 1 })
    await until(
      () =>
        viewer.document.get() !== doc &&
        viewer.status.get().state === 'ready' &&
        viewer.engine.get() !== null,
      15_000
    )
    const next = viewer.document.get()!
    expect(next._reader.kind).toBe('engine')
    expect(next._reader).not.toBe(old)
    expect(destroyOld).toHaveBeenCalledTimes(1)
    // The new reader draws the redacted file: the box left in the mark's place.
    const after = darkPixels(await drawMark(next), 0, 0, 340, 70)
    expect(after).toBeGreaterThan(before)
    expect(after).toBeGreaterThan(340 * 70 * 0.9)
  })
})
