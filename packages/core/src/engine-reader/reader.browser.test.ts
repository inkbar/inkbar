import manifestJson from '@inkbar/fixtures/manifest.json'
import {
  browserAssets,
  FIXTURE_NAMES,
  fixtureUrl,
  type FixtureName,
} from '@inkbar/fixtures/urls'
import { fontUrls } from '@inkbar/fonts'
import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createLoupeLayer } from '../dom/loupe-layer'
import { createPageRenderer } from '../dom/page-renderer'
import { mountContainer, openFixtureInBrowser, until } from '../dom/test-utils'
import { createThumbnailPainter } from '../dom/thumbnails/thumbnail'
import { createPageTransform } from '../dom/transform'
import { createViewer } from '../dom/viewer/create-viewer'
import { mountViewer } from '../dom/viewer-engine'
import { openDocument, type EngineLoader, type InkDocument } from '../model/document'
import { writable } from '../model/readable'
import { searchableText } from '../model/search-text'

import { expectSameLinks, linksAsSeen } from './test-utils'

import type * as ReaderModule from './reader'
import type { Point, Rect } from '../model/geometry'

const flag = globalThis as { __INKBAR_READER__?: unknown }

/** How many engine readers were made, and how many times one turned to its fallback. */
const fellBack = vi.hoisted(() => ({ made: 0, count: 0 }))
vi.mock('./reader', async (importOriginal) => {
  const real = await importOriginal<typeof ReaderModule>()
  return {
    ...real,
    createEngineReader: (options: Parameters<typeof real.createEngineReader>[0]) => {
      fellBack.made++
      return real.createEngineReader({
        ...options,
        onFallback: () => {
          fellBack.count++
          options.onFallback?.()
        },
      })
    },
  }
})

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

  it('opens a file whose facts a working engine cannot read, with no title or author', async () => {
    const failing: EngineLoader = async () => {
      const real = await import('@inkbar/engine')
      return {
        createEngine: async () => {
          const engine = await real.createEngine()
          const opening = engine.open.bind(engine)
          engine.open = async (...args) => {
            const doc = await opening(...args)
            // The engine's own failure: `engine-failure`, with the engine still working.
            doc.documentFacts = () =>
              Promise.reject(
                Object.assign(new Error('no facts'), { code: 'engine-failure' })
              )
            return doc
          }
          return engine
        },
      }
    }
    const doc = await open('text-simple', { engine: failing })
    expect(doc._reader.kind).toBe('engine')
    expect(doc.info).toMatchObject({ pageCount: 3, isEncrypted: false })
    expect(doc.info.title).toBeUndefined()
    expect(doc.info.author).toBeUndefined()
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
        // Left and right agree within a point. Bottom and top agree: both readers stand the box
        // on Helvetica's ascent and descent from PDF.js's table, 10.05 pt above the baseline and
        // 2.90 pt below it at 14 pt.
        expect(Math.abs(a[0]! - b[0]!)).toBeLessThanOrEqual(1)
        expect(a[1]!).toBeCloseTo(b[1]!, 3)
        expect(Math.abs(a[2]! - b[2]!)).toBeLessThanOrEqual(1)
        expect(a[3]!).toBeCloseTo(b[3]!, 3)
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
    // The tolerance of the item comparison above: within a point along the line, the same
    // height across it.
    a.quads.forEach((quad, q) => {
      const other = b.quads[q]!
      for (const corner of ['p1', 'p2', 'p3', 'p4'] as const) {
        expect(Math.abs(quad[corner].x - other[corner].x)).toBeLessThanOrEqual(1)
        expect(quad[corner].y).toBeCloseTo(other[corner].y, 3)
      }
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

  // The engine reads a page turned 90 degrees as it reads the page unturned, so its lines come
  // in the order the file writes them, as PDF.js reads them.
  it('reads the lines of text-rotated-90 in the order the file writes them', async () => {
    const written =
      'Rotated 90 Hello Inkbar. This document exercises text selection. National Insurance number QQ123456C appears here. Email: sam.hargreaves@hargreaves-mott.example The quick brown fox jumps over the lazy dog.'
    const doc = await open('text-rotated-90')
    await expect(joinedText(doc, 0)).resolves.toBe(written)
    delete flag.__INKBAR_READER__
    const plain = await open('text-rotated-90')
    expect(await joinedText(plain, 0)).toBe(written)
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

  // PDF.js gives a vertical run's length in its height and one em in its width; its reader
  // lays the box down the column from the top centre of the first glyph.
  it.each(['text-vertical', 'redact-text-vertical'] as const)(
    "gives PDF.js's vertical runs the column the glyphs are drawn in, on %s",
    async (name) => {
      const engine = await open(name)
      const engineItems = (await engine._reader.text(0, { glyphs: true })).items
      delete flag.__INKBAR_READER__
      const plain = await open(name)
      expect(plain._reader.kind).toBe('pdfjs')
      const items = (await plain._reader.text(0, { glyphs: true })).items.filter(
        (item) => item.dir === 'ttb' && item.str.trim() !== ''
      )
      expect(items.map((item) => item.str)).toEqual(
        engineItems.filter((item) => item.dir === 'ttb').map((item) => item.str)
      )
      const canvas = await mountPage(plain)
      // The page canvas `mountPage` draws: zoom 1, unturned, 1 device pixel per CSS pixel.
      const t = createPageTransform(plain.pages[0]!, 1, 0)
      for (const item of items) {
        const other = engineItems.find((e) => e.str === item.str)!
        expect(item.fontSize).toBe(other.fontSize)
        // Ahem's glyph boxes reach 1.28 pt past the last advance; a tenth of an em holds that.
        for (const corner of ['p1', 'p2', 'p3', 'p4'] as const) {
          const d = Math.hypot(
            item.quad[corner].x - other.quad[corner].x,
            item.quad[corner].y - other.quad[corner].y
          )
          expect(d, `${item.str} ${corner}`).toBeLessThanOrEqual(0.1 * item.fontSize)
        }
        expect(item.advances).toHaveLength(item.str.length + 1)
        // Every dark pixel half an em around the box lies within 2 pt of it, and the box holds
        // glyphs. Ahem's glyphs stand 1.28 pt lower in their cells than /DW2 puts them.
        const { rect } = item
        const pad = item.fontSize / 2
        const count = (r: Rect) => {
          const css = t.toCssRect(r)
          const left = Math.round(css.left)
          const top = Math.round(css.top)
          return darkPixels(
            canvas,
            left,
            top,
            Math.round(css.left + css.width) - left,
            Math.round(css.top + css.height) - top
          )
        }
        const inside = count({
          x: rect.x - 2,
          y: rect.y - 2,
          width: rect.width + 4,
          height: rect.height + 4,
        })
        const around = count({
          x: rect.x - pad,
          y: rect.y - pad,
          width: rect.width + 2 * pad,
          height: rect.height + 2 * pad,
        })
        expect(inside, item.str).toBeGreaterThan(100)
        expect(inside, item.str).toBe(around)
      }
    }
  )
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

describe("the engine reader's links and outline", () => {
  /** Every page's links as a host sees them, and the outline, read by the reader selected now. */
  async function read(name: FixtureName) {
    const doc = await open(name)
    const links = []
    for (let page = 0; page < doc.pages.length; page++)
      links.push(await linksAsSeen(doc, page))
    return { kind: doc._reader.kind, links, outline: await doc.outline() }
  }

  it.each(['links', 'link-targets', 'link-order', 'outline', 'corpus-annots'] as const)(
    'gives the same links and outline as PDF.js, on %s',
    async (name) => {
      const engine = await read(name)
      delete flag.__INKBAR_READER__
      const pdfjs = await read(name)
      expect([engine.kind, pdfjs.kind]).toEqual(['engine', 'pdfjs'])
      expect(engine.links.map((l) => l.length)).toEqual(pdfjs.links.map((l) => l.length))
      engine.links.forEach((links, page) => expectSameLinks(links, pdfjs.links[page]!))
      expect(engine.outline).toEqual(pdfjs.outline)
    }
  )

  it("reads link-targets' thirty-four cases as the manifest records them", async () => {
    const { links } = await read('link-targets')
    const url = (address: string, newWindow = false) => ({
      kind: 'url',
      url: address,
      newWindow,
    })
    const unsupported = (reason: string) => ({ kind: 'unsupported', reason })
    expect(links[0]!.map((l) => l.target)).toEqual([
      url('https://example.com/a'),
      url('https://example.com/doc.pdf', true),
      unsupported('remote'),
      url('https://example.com/run'),
      unsupported('launch'),
      url('https://example.com/js', true),
      url('https://example.com/open'),
      unsupported('unknown'),
      url('https://example.com/aa'),
      url('http://www.example.com/path'),
      url('https://example.com/%C3%A9'),
      unsupported('unsafe-url'),
      unsupported('unsafe-url'),
      unsupported('unsafe-url'),
      // PDF.js reports a URI it cannot parse, with no scheme and no #, as launch.
      unsupported('launch'),
      unsupported('unsafe-url'),
      { kind: 'named', action: 'NextPage' },
      unsupported('unknown'),
      // The catalog is not a page: the destination goes nowhere.
      { kind: 'dest', name: undefined, resolved: undefined },
      // A name the file writes in UTF-16BE, found in its name tree.
      { kind: 'dest', name: 'résumé', resolved: { page: 0, fit: 'fit' } },
      // Explicit destinations PDF.js refuses: a Fit with an argument, a FitH with two, an XYZ
      // with four.
      unsupported('unknown'),
      unsupported('unknown'),
      unsupported('unknown'),
      // link-generation: its object's generation is 1.
      url('https://example.com/generation'),
      // A /Dest that is a number keeps /AA out.
      unsupported('unknown'),
      // A plain /F string keeps its bytes, byte-order mark and all; a file specification's is
      // decoded.
      unsupported('launch'),
      url('https://example.com/spec'),
      // A /URI written as a name reads as /https://example.com/name.
      unsupported('launch'),
      // An XYZ with one argument, an argument written as a reference, a fit written as a string.
      unsupported('unknown'),
      unsupported('unknown'),
      unsupported('unknown'),
      // A page given as a whole number, and one that is not whole.
      { kind: 'dest', name: undefined, resolved: { page: 0, fit: 'fith', top: 500 } },
      unsupported('unknown'),
      // after-markup-no-quads.
      url('https://example.com/after-markup'),
    ])
    // link-generation, the twenty-fourth case.
    expect(links[0]![23]!.id).toMatch(/^pdf:0:\d+R1$/)
    // after-markup-no-quads, the last: the Highlight before it has no /QuadPoints, so PDF.js
    // does not count it.
    expect(links[0]![33]!.order).toBe(links[0]![32]!.order! + 1)
  })

  it('resolves the name résumé, written in UTF-16BE, to page 0 through the engine', async () => {
    const doc = await open('link-targets')
    expect(doc._reader.kind).toBe('engine')
    // dest-named-utf16, the twentieth case.
    const link = doc.links(0)[19]!
    expect(link.target).toEqual({ kind: 'dest', raw: 'résumé' })
    await expect(doc._reader.resolveDestination('résumé')).resolves.toEqual({
      page: 0,
      fit: 'fit',
    })
  })

  it.each(['links', 'link-targets'] as const)(
    "gives each destination's raw as PDF.js gives it, on %s",
    async (name) => {
      const raws = (doc: InkDocument) =>
        doc.pages.flatMap((_, page) =>
          doc
            .links(page)
            .map((l) => (l.target.kind === 'dest' ? l.target.raw : undefined))
        )
      const engine = raws(await open(name))
      delete flag.__INKBAR_READER__
      const pdfjs = raws(await open(name))
      expect(engine).toEqual(pdfjs)
      expect(engine.filter((raw) => Array.isArray(raw)).length).toBeGreaterThan(0)
    }
  )

  it('gives an explicit destination its page as a reference, { num, gen }, on links page 0', async () => {
    const doc = await open('links')
    expect(
      doc
        .links(0)
        .slice(0, 2)
        .map((l) => l.target)
    ).toEqual([
      { kind: 'dest', raw: [{ num: 6, gen: 0 }, { name: 'XYZ' }, 72, 600, null] },
      { kind: 'dest', raw: 'chapter-3' },
    ])
    await expect(
      doc.resolveDestination([{ num: 6, gen: 0 }, { name: 'XYZ' }, 72, 600, null])
    ).resolves.toEqual({ page: 1, fit: 'xyz', left: 72, top: 600, zoom: undefined })
  })

  it("orders link-order's links as PDF.js does, with the ids it gives", async () => {
    const { links } = await read('link-order')
    expect(links[0]!.map((l) => [l.id, l.order])).toEqual([
      ['pdf:0:8R', 1],
      ['pdf:0:11R', 2],
      ['pdf:0:13R', 3],
      // A Link with the Hidden flag: PDF.js keeps it.
      ['pdf:0:14R', 4],
      // A Link written as a direct object in /Annots.
      ['pdf:0:annot_p0_1', 5],
    ])
  })

  /** Where the viewer goes when `at`, in user space on page 0 of `links`, is pressed. */
  async function pressOnLinks(at: Point): Promise<unknown> {
    const style = document.createElement('style')
    style.textContent = themeCss
    document.head.append(style)
    const doc = await open('links')
    const container = mountContainer(800, 900)
    const engine = mountViewer({ container, document: doc, zoom: 1, buffer: 0 })
    try {
      await until(() => engine.pages.size > 0)
      await engine.pages.get(0)!.textLayer.ready
      const scrolled = vi.spyOn(engine.viewport, 'scrollToDestination')
      engine.tools.set('select')
      const box = engine.viewport.hostFor(0)!.getBoundingClientRect()
      const css = engine.viewport.transformFor(0).toCss(at)
      const client = { clientX: box.left + css.x, clientY: box.top + css.y }
      const target = document.elementFromPoint(client.clientX, client.clientY)!
      for (const type of ['pointerdown', 'pointerup'] as const)
        target.dispatchEvent(
          new PointerEvent(type, {
            ...client,
            bubbles: true,
            pointerId: 1,
            pointerType: 'mouse',
            button: 0,
            buttons: type === 'pointerdown' ? 1 : 0,
            isPrimary: true,
          })
        )
      await until(() => scrolled.mock.calls.length > 0)
      return scrolled.mock.calls[0]![0]
    } finally {
      engine.destroy()
      container.remove()
      style.remove()
    }
  }

  it('a press on a link on page 0 of links goes to the same place with either reader', async () => {
    // The first link is an explicit destination, the second a named one.
    const explicit = { x: 103, y: 705 }
    const named = { x: 103, y: 675 }
    const engine = [await pressOnLinks(explicit), await pressOnLinks(named)]
    delete flag.__INKBAR_READER__
    const pdfjs = [await pressOnLinks(explicit), await pressOnLinks(named)]
    expect(engine).toEqual(pdfjs)
    expect(engine).toEqual([
      { page: 1, fit: 'xyz', left: 72, top: 600, zoom: undefined },
      { page: 2, fit: 'fit' },
    ])
  })
})

/** What a reader tells the document about the file: its facts, each page's annotations and Tab order, and the form. */
interface FileRead {
  facts: unknown
  pages: { annotations: unknown[]; tabOrder: string[] }[]
  form: unknown[]
}

/** Every string anywhere in `value` passed through `map`. */
function mapStrings<T>(value: T, map: (s: string) => string): T {
  if (typeof value === 'string') return map(value) as T
  if (Array.isArray(value)) return value.map((v: unknown) => mapStrings(v, map)) as T
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, mapStrings(v, map)])
    ) as T
  return value
}

/** `read` with `change` applied to each annotation of each page. */
const eachAnnotation = (
  read: FileRead,
  change: (a: Record<string, unknown>) => Record<string, unknown>
): FileRead => ({
  ...read,
  pages: read.pages.map((page) => ({
    ...page,
    annotations: page.annotations.map((a) => change(a as Record<string, unknown>)),
  })),
})

/** A PDF of the numbered objects given, object 1 the catalog, with a cross-reference table. */
function buildPdf(objects: Record<number, string>): Uint8Array {
  const numbers = Object.keys(objects).map(Number)
  const size = Math.max(...numbers) + 1
  let out = '%PDF-1.7\n'
  const offsets = new Map<number, number>()
  for (const n of numbers) {
    offsets.set(n, out.length)
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${size}\n`
  for (let n = 0; n < size; n++) {
    const at = offsets.get(n)
    out +=
      at === undefined
        ? '0000000000 65535 f \n'
        : `${String(at).padStart(10, '0')} 00000 n \n`
  }
  out += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}

/**
 * Popups shown by their parents' flags, one whose parent is on no page, a group reply and its
 * popup, a widget `/Annots` lists twice, a widget with `/T` that `/AcroForm /Fields` does not
 * reach, and an empty `/DA` on a widget and a FreeText.
 */
const BUILT = {
  'popups-and-widgets': buildPdf({
    1: '<< /Type /Catalog /Pages 2 0 R /AcroForm 20 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Annots [4 0 R 5 0 R 6 0 R 7 0 R 8 0 R 9 0 R 10 0 R 10 0 R 11 0 R 12 0 R 13 0 R 14 0 R 15 0 R] >>',
    4: '<< /Type /Annot /Subtype /Square /Rect [10 10 50 50] /F 4 /T (Ann) /Contents (Hello) /C [1 0 0] /M (D:1) /CreationDate (D:0) /Popup 5 0 R >>',
    5: '<< /Type /Annot /Subtype /Popup /Rect [60 60 160 160] /F 32 /Parent 4 0 R >>',
    6: '<< /Type /Annot /Subtype /Popup /Rect [60 60 160 160] /F 32 /Parent 30 0 R >>',
    7: '<< /Type /Annot /Subtype /Square /Rect [10 100 50 150] /F 4 /T (Bob) /Contents (Mine) /RT /Group /IRT 4 0 R /CreationDate (D:7) >>',
    8: '<< /Type /Annot /Subtype /Popup /Rect [60 200 160 300] /Parent 7 0 R >>',
    9: '<< /Type /Annot /Subtype /Popup /Rect [60 300 160 400] /F 32 /Parent 13 0 R >>',
    10: '<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /DA () /Rect [200 10 300 30] /F 4 >>',
    11: '<< /Type /Annot /Subtype /Widget /FT /Tx /T (orphan) /Rect [200 40 300 60] /F 4 >>',
    12: '<< /Type /Annot /Subtype /FreeText /DA () /Rect [200 100 300 130] /F 4 /Contents (x) >>',
    13: '<< /Type /Annot /Subtype /Square /Rect [10 300 50 350] /F 32 >>',
    14: '<< /Type /Annot /Subtype /Popup /Rect [60 400 160 500] /F 32 /Parent 15 0 R >>',
    15: '<< /Type /Annot /Subtype /Square /Rect [10 400 50 450] /F 1 >>',
    20: '<< /Fields [10 0 R] /DA (/Helv 9 Tf 0 0 1 rg) >>',
    30: '<< /Type /Annot /Subtype /Square /Rect [10 10 50 50] /F 4 /T (Zed) /Contents (Off page) /C [0 1 0] >>',
  }),
}
type BuiltName = keyof typeof BUILT
type FileName = FixtureName | BuiltName

/** An annotation without the text, dates and colour PDF.js reads from another annotation. */
function withoutParentText(a: Record<string, unknown>): Record<string, unknown> {
  const {
    contents: _contents,
    author: _author,
    created: _created,
    modified: _modified,
    color: _color,
    ...rest
  } = a
  return rest
}

/**
 * Differences between the two readers that are known, each with its cause and the files it
 * shows on. Each is applied to both readers' reads of those files before they are compared, so
 * the rest of the read is still held equal; a file listed whose reads no longer differ fails.
 */
const EXCEPTIONS: Record<
  string,
  { cause: string; fixtures: readonly FileName[]; apply: (read: FileRead) => FileRead }
> = {
  'direct-object ids': {
    cause:
      'An annotation written as a direct object has no object number: PDF.js invents `annot_p<page>_<n>` from a counter, the engine reader gives `p<page>i<index>`, its place in /Annots.',
    fixtures: ['annot-direct', 'link-order'],
    apply: (read) =>
      mapStrings(read, (s) => (/^(annot_p\d+_\d+|p\d+i\d+)$/.test(s) ? 'direct' : s)),
  },
  'drawn FreeText text': {
    cause:
      "A FreeText with an appearance stream: PDF.js takes its font size and colour from the stream's own text operators (10 and black when it finds none), the engine reader from /DA.",
    fixtures: ['saved-annotations', 'saved-incremental'],
    apply: (read) =>
      eachAnnotation(read, (a) => {
        const da = a.defaultAppearance as { fontName?: string } | undefined
        return a.subtype === 'FreeText' && a.hasAppearance && da
          ? { ...a, defaultAppearance: { fontName: da.fontName } }
          : a
      }),
  },
  "a popup's parent on no page": {
    cause:
      "PDF.js reads a popup's text, dates and colour from its /Parent wherever it is; the engine reports only the page's own annotations, so a parent on no page gives none.",
    fixtures: ['popups-and-widgets'],
    apply: (read) =>
      eachAnnotation(read, (a) => (a.id === '6R' ? withoutParentText(a) : a)),
  },
  'group replies': {
    cause:
      'An annotation with /RT /Group shows the text, dates and colour of the one its /IRT names, and so does its popup; the engine does not report /RT.',
    fixtures: ['popups-and-widgets'],
    apply: (read) =>
      eachAnnotation(read, (a) =>
        a.id === '7R' || a.id === '8R' ? withoutParentText(a) : a
      ),
  },
}

const manifest = manifestJson as unknown as Record<
  FixtureName,
  { opens: boolean; password?: string }
>

/** Each `rect` in `engine` replaced by `pdfjs`'s where every number is within 0.01 of it. */
function withRectsFrom(engine: unknown, pdfjs: unknown): unknown {
  if (Array.isArray(engine) && Array.isArray(pdfjs))
    return engine.map((e: unknown, i) => withRectsFrom(e, pdfjs[i]))
  if (typeof engine !== 'object' || engine === null) return engine
  if (typeof pdfjs !== 'object' || pdfjs === null) return engine
  const other = pdfjs as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(engine).map(([key, value]) => {
      const theirs = other[key]
      if (
        key === 'rect' &&
        Array.isArray(value) &&
        Array.isArray(theirs) &&
        value.length === theirs.length &&
        value.every((n, i) => Math.abs((n as number) - (theirs[i] as number)) <= 0.01)
      )
        return [key, theirs]
      return [key, withRectsFrom(value, theirs)]
    })
  )
}

describe("the engine reader's file facts, annotations and form", () => {
  /** The file reads asked of the engine, by name. */
  const FILE_READS = ['documentFacts', 'pageAnnotations', 'formFields', 'structureOrder']
  let asked: string[] = []
  /** The real engine, with each file read it is asked noted in `asked`. */
  const noting: EngineLoader = async () => {
    const real = await import('@inkbar/engine')
    return {
      createEngine: async () => {
        const engine = await real.createEngine()
        const opening = engine.open.bind(engine)
        engine.open = async (...args) => {
          const doc = await opening(...args)
          const methods = doc as unknown as Record<string, (...a: unknown[]) => unknown>
          for (const name of FILE_READS) {
            const read = methods[name]!.bind(doc)
            methods[name] = (...a) => {
              asked.push(name)
              return read(...a)
            }
          }
          return doc
        }
        return engine
      },
    }
  }

  /** What the reader selected now gives for the file. */
  async function readFile(name: FileName): Promise<FileRead & { kind: string }> {
    asked = []
    let doc: InkDocument
    if (name in BUILT) {
      doc = await openDocument(BUILT[name as BuiltName].slice(), {
        assets: browserAssets(),
        engine: noting,
      })
      await doc.ready
    } else {
      const password = manifest[name as FixtureName].password
      doc = await openFixtureInBrowser(name as FixtureName, {
        engine: noting,
        ...(password === undefined ? {} : { password }),
      })
    }
    try {
      const reader = doc._reader
      const pages: FileRead['pages'] = []
      for (let page = 0; page < reader.pageCount; page++)
        pages.push({
          annotations: await reader.annotations(page),
          tabOrder: await reader.tabOrder(page),
        })
      return {
        kind: reader.kind,
        facts: await reader.facts(),
        pages,
        form: await reader.form(),
      }
    } finally {
      doc.destroy()
    }
  }

  it.each([
    ...FIXTURE_NAMES.filter((name) => manifest[name].opens),
    ...(Object.keys(BUILT) as BuiltName[]),
  ])(
    'gives the same facts, annotations, fields and tab order as PDF.js, on %s',
    async (name) => {
      fellBack.made = 0
      fellBack.count = 0
      const { kind: engineKind, ...engine } = await readFile(name)
      expect(fellBack.made, 'the engine reader is the one spied on').toBe(1)
      // The engine answered: the reads did not come from the fallback.
      expect(new Set(asked)).toEqual(new Set(FILE_READS))
      expect(fellBack.count).toBe(0)
      delete flag.__INKBAR_READER__
      const { kind: pdfjsKind, ...pdfjs } = await readFile(name)
      expect([engineKind, pdfjsKind]).toEqual(['engine', 'pdfjs'])
      const known = Object.values(EXCEPTIONS).filter((e) => e.fixtures.includes(name))
      const near = withRectsFrom(engine, pdfjs) as FileRead
      const applying = (exceptions: typeof known) => (read: FileRead) =>
        exceptions.reduce((r, e) => e.apply(r), read)
      // Each listed exception still shows: with all the others applied, the reads differ.
      for (const exception of known) {
        const others = applying(known.filter((e) => e !== exception))
        expect(others(near), `${exception.cause} still shows`).not.toStrictEqual(
          others(pdfjs)
        )
      }
      const apply = applying(known)
      expect(apply(near)).toStrictEqual(apply(pdfjs))
    }
  )
})
