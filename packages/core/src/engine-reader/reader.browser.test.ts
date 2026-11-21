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
import { searchableText } from '../model/search-text'

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

/** A page's text joined as search joins it, with its whitespace collapsed. */
async function joinedText(doc: InkDocument, page: number): Promise<string> {
  const content = await doc._reader.text(page, { glyphs: false })
  return searchableText(content).raw.replace(/\s+/gu, ' ').trim()
}

describe("the engine reader's text", () => {
  it.each([
    ['text-simple', 0],
    ['text-simple', 1],
    ['text-simple', 2],
    ['text-search', 0],
  ] as const)('reads the same words as PDF.js, on %s page %i', async (name, page) => {
    const doc = await open(name)
    expect(doc._reader.kind).toBe('engine')
    delete flag.__INKBAR_READER__
    const plain = await open(name)
    expect(plain._reader.kind).toBe('pdfjs')
    const text = await joinedText(doc, page)
    expect(text).not.toBe('')
    expect(text).toBe(await joinedText(plain, page))
  })

  it.each([0, 1, 2])(
    'places each item of text-simple page %i where PDF.js places it',
    async (page) => {
      const doc = await open('text-simple')
      delete flag.__INKBAR_READER__
      const plain = await open('text-simple')
      const engine = (await doc._reader.text(page, { glyphs: true })).items
      const pdfjs = (await plain._reader.text(page, { glyphs: true })).items
      expect(engine.length).toBeGreaterThan(0)
      expect(engine.map((i) => i.str)).toEqual(pdfjs.map((i) => i.str))
      const edges = (r: Rect) => [r.x, r.y, r.x + r.width, r.y + r.height]
      engine.forEach((item, k) => {
        const other = pdfjs[k]!
        const a = edges(item.rect)
        const b = edges(other.rect)
        // Left, bottom and right agree within a point. The top does not: the engine's loose box
        // reaches the font's bounding box, 13.23 pt above the baseline at 14 pt, where PDF.js
        // stops at Helvetica's ascent, 10.05 pt. The difference is pinned here.
        expect(Math.abs(a[0]! - b[0]!)).toBeLessThanOrEqual(1)
        expect(Math.abs(a[1]! - b[1]!)).toBeLessThanOrEqual(1)
        expect(Math.abs(a[2]! - b[2]!)).toBeLessThanOrEqual(1)
        expect(a[3]! - b[3]!).toBeCloseTo(3.18, 2)
        if (other.advances) {
          expect(item.advances).toHaveLength(other.advances.length)
          item.advances!.forEach((t, i) => expect(t).toBeCloseTo(other.advances![i]!, 2))
        }
      })
      // PDF.js gives page glyph boundaries for these lines, so the advances were compared.
      expect(pdfjs.every((i) => i.advances)).toBe(true)
    }
  )

  it('stops a text read whose signal aborts, and reads the page in full after', async () => {
    const doc = await open('text-simple')
    const reason = new Error('moved on')
    const c = new AbortController()
    const reading = doc._reader.text(0, { glyphs: false, signal: c.signal })
    c.abort(reason)
    await expect(reading).rejects.toBe(reason)
    const { items } = await doc._reader.text(0, { glyphs: false })
    expect(items.map((i) => i.str).join(' ')).toContain('Page 1')
  })

  it('finds a word hyphenated over a line break on text-search, as PDF.js does', async () => {
    const hitsOf = async (doc: InkDocument) => {
      const hits = []
      for await (const hit of doc.search('document')) hits.push(hit)
      return hits
    }
    const engine = await hitsOf(await open('text-search'))
    delete flag.__INKBAR_READER__
    const pdfjs = await hitsOf(await open('text-search'))
    expect(pdfjs).toHaveLength(1)
    expect(engine).toHaveLength(pdfjs.length)
    const [a, b] = [engine[0]!, pdfjs[0]!]
    expect(a.text).toBe(b.text)
    expect(a.quads).toHaveLength(b.quads.length)
    // The tolerance of the item comparison above: within a point, but for the top, which stands
    // 3.18 pt higher on the engine's boxes.
    a.quads.forEach((quad, q) => {
      const other = b.quads[q]!
      for (const corner of ['p1', 'p2', 'p3', 'p4'] as const)
        expect(Math.abs(quad[corner].x - other[corner].x)).toBeLessThanOrEqual(1)
      for (const corner of ['p3', 'p4'] as const)
        expect(Math.abs(quad[corner].y - other[corner].y)).toBeLessThanOrEqual(1)
      for (const corner of ['p1', 'p2'] as const)
        expect(quad[corner].y - other[corner].y).toBeCloseTo(3.18, 2)
    })
  })

  // The text layer puts one span per item and nothing between them, so each line's strings
  // joined as they stand must keep their spaces: across a font change, a gap and two columns.
  it('keeps the space between items on one line, as PDF.js does, on text-search', async () => {
    const lines = async (doc: InkDocument) => {
      const { items } = await doc._reader.text(0, { glyphs: false })
      const byLine = new Map<number, string>()
      for (const item of items) {
        const y = Math.round(item.quad.p3.y / 4)
        byLine.set(y, (byLine.get(y) ?? '') + item.str)
      }
      return [...byLine.values()].map((line) => line.trimEnd())
    }
    const engine = await lines(await open('text-search'))
    delete flag.__INKBAR_READER__
    const pdfjs = await lines(await open('text-search'))
    expect(engine).toEqual(pdfjs)
    expect(engine).toContain('Invoice')
    expect(engine).toContain('Hello World')
    expect(engine).toContain('left column right column')
  })

  // On a page turned 90 degrees the engine reads its lines in the order they stand on screen,
  // left to right, which puts the last line of the file first. PDF.js reads them in the order the
  // file writes them. Each line is the same; their order is what the engine gives.
  it('reads the lines of text-rotated-90 in the order they stand on screen', async () => {
    const doc = await open('text-rotated-90')
    await expect(joinedText(doc, 0)).resolves.toBe(
      'The quick brown fox jumps over the lazy dog. Email: sam.hargreaves@hargreaves-mott.example National Insurance number QQ123456C appears here. Hello Inkbar. This document exercises text selection. Rotated 90'
    )
    delete flag.__INKBAR_READER__
    const plain = await open('text-rotated-90')
    expect(await joinedText(plain, 0)).toBe(
      'Rotated 90 Hello Inkbar. This document exercises text selection. National Insurance number QQ123456C appears here. Email: sam.hargreaves@hargreaves-mott.example The quick brown fox jumps over the lazy dog.'
    )
  })

  // The engine reads the Hebrew in reading order, though the file draws it last letter first.
  it.each([
    ['text-rtl', 'שלום עולם abc שלום 123 Latin line in Helvetica'],
    ['text-vertical', '日本語のテキスト Horizontal line beside the column'],
  ] as const)('reads %s in reading order', async (name, expected) => {
    const doc = await open(name)
    await expect(joinedText(doc, 0)).resolves.toBe(expected)
  })

  it('reads right-to-left and vertical runs with their directions', async () => {
    const rtl = await open('text-rtl')
    const rtlItems = (await rtl._reader.text(0, { glyphs: false })).items
    expect(rtlItems.map((i) => [i.str, i.dir])).toEqual([
      ['שלום עולם', 'rtl'],
      ['abc ', 'ltr'],
      ['שלום', 'rtl'],
      [' 123', 'ltr'],
      ['Latin line in Helvetica', 'ltr'],
    ])
    const vertical = await open('text-vertical')
    const verticalItems = (await vertical._reader.text(0, { glyphs: false })).items
    expect(verticalItems.map((i) => [i.str, i.dir])).toEqual([
      ['日本語のテキスト', 'ttb'],
      ['Horizontal line beside the column', 'ltr'],
    ])
  })

  it.each([
    'text-simple',
    'text-search',
    'text-rotated-90',
    'text-rtl',
    'text-vertical',
  ] as const)('keeps every item inside the page box, on %s', async (name) => {
    const doc = await open(name)
    for (const info of doc.pages) {
      const { items } = await doc._reader.text(info.index, { glyphs: false })
      expect(items.length).toBeGreaterThan(0)
      const { box } = info
      for (const { rect } of items) {
        expect(rect.x).toBeGreaterThanOrEqual(box.x)
        expect(rect.y).toBeGreaterThanOrEqual(box.y)
        expect(rect.x + rect.width).toBeLessThanOrEqual(box.x + box.width)
        expect(rect.y + rect.height).toBeLessThanOrEqual(box.y + box.height)
      }
    }
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
