import { afterEach, describe, expect, it, vi } from 'vitest'

import { hiddenFromPdfjsIds, regionCanvasSize } from '../dom/draw-request'
import { openFixtureInBrowser } from '../dom/test-utils'
import {
  createPageTransform,
  normalizeRotation,
  type ViewRotation,
} from '../dom/transform'
import { canvasMeasureChar } from '../model/measure-char'

import { createPdfjsReader } from './reader'
import { hiddenAppearances } from './widget-appearance'

import type { PdfjsAnnotationData } from './types'
import type { InkDocument } from '../model/document'
import type { Rect } from '../model/geometry'
import type { TextContent } from '../model/text'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

async function open(
  name: 'text-simple' | 'text-rotated-90' | 'form-fields' | 'cropbox-offset'
): Promise<InkDocument> {
  const doc = await openFixtureInBrowser(name)
  cleanup.push(() => void doc.destroy())
  return doc
}

/**
 * Draws `region` of page 0 at `scale` device pixels per point, turned by `rotation` (the
 * page's own /Rotate when omitted), into a canvas sized to it.
 */
function drawRegion(
  doc: InkDocument,
  region: Rect,
  scale: number,
  canvas: HTMLCanvasElement,
  signal?: AbortSignal,
  rotation?: number
): Promise<void> {
  const page = doc.pages[0]!
  const turn = normalizeRotation(rotation ?? page.rotate)
  return doc._reader.draw(
    {
      page: 0,
      rotation: turn,
      zoom: scale,
      pixelRatio: 1,
      ...regionCanvasSize(page, region, scale, turn),
      region,
      hide: hiddenFromPdfjsIds(hiddenAppearances(doc)),
    },
    canvas,
    signal
  )
}

/** The whole page at `scale` and total `rotation`, as the page canvas draws it. */
async function fullRender(
  doc: InkDocument,
  scale: number,
  rotation: number
): Promise<HTMLCanvasElement> {
  const page = await doc._pdfjs.getPage(0)
  const viewport = page.getViewport({ scale, rotation })
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

const pixels = (c: HTMLCanvasElement, x: number, y: number, w: number, h: number) =>
  c.getContext('2d')!.getImageData(x, y, w, h).data

/** Mean absolute difference per channel between two same-sized pixel arrays, 0 to 255. */
function meanDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!)
  return sum / a.length
}

const darkCount = (d: Uint8ClampedArray): number => {
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (d[i]! < 128) n++
  return n
}

/** Covers the start of the first line of text on the fixtures' pages. */
const REGION: Rect = { x: 72, y: 700, width: 50, height: 50 }

describe('the PDF.js reader', () => {
  it('says it is the PDF.js reader', async () => {
    const doc = await open('text-simple')
    expect(doc._reader.kind).toBe('pdfjs')
    expect(doc._reader.pageCount).toBe(doc.pages.length)
  })

  it.each(['text-rotated-90', 'cropbox-offset'] as const)(
    'reads the page facts the document lists, on %s',
    async (name) => {
      const doc = await open(name)
      for (let i = 0; i < doc.pages.length; i++)
        expect(await doc._reader.pageInfo(i)).toEqual(doc.pages[i])
    }
  )

  it('draws a whole page as the page canvas always has, pixel for pixel', async () => {
    const doc = await open('text-simple')
    const zoom = 1.5
    const dpr = 2
    const t = createPageTransform(doc.pages[0]!, zoom, 0)
    const width = Math.round(t.cssWidth * dpr)
    const height = Math.round(t.cssHeight * dpr)

    // The page canvas's own PDF.js call before the reader drew it.
    const page = await doc._pdfjs.getPage(0)
    const expected = document.createElement('canvas')
    expected.width = width
    expected.height = height
    await page.render({
      canvas: expected,
      viewport: page.getViewport({ scale: zoom, rotation: t.totalRotation }),
      background: '#ffffff',
      annotationMode: doc._pdfjs.module.AnnotationMode.ENABLE,
      transform: [dpr, 0, 0, dpr, 0, 0],
    }).promise

    const canvas = document.createElement('canvas')
    await doc._reader.draw(
      {
        page: 0,
        rotation: t.totalRotation,
        zoom,
        pixelRatio: dpr,
        width,
        height,
        hide: [],
      },
      canvas
    )
    expect([canvas.width, canvas.height]).toEqual([width, height])
    const drawn = pixels(canvas, 0, 0, width, height)
    expect(darkCount(drawn)).toBeGreaterThan(100)
    // Not `toEqual`: comparing 18 million array entries one by one took over 30 s on a busy runner.
    expect(meanDiff(drawn, pixels(expected, 0, 0, width, height))).toBe(0)
  })

  it('magnifies form widgets as the file draws them', async () => {
    const doc = await open('form-fields')
    const name = doc.form.fields.get().find((f) => f.name === 'name')!.widgets[0]!
    const canvas = document.createElement('canvas')
    await drawRegion(doc, name.rect, 2, canvas)
    // The field's "Sam" and its border, which the page canvas leaves to the form layer.
    expect(darkCount(pixels(canvas, 0, 0, canvas.width, canvas.height))).toBeGreaterThan(
      20
    )
  })

  it('fills the canvas with the region, matching a full render at the same scale', async () => {
    const doc = await open('text-simple')
    const canvas = document.createElement('canvas')
    await drawRegion(doc, REGION, 4, canvas)
    expect([canvas.width, canvas.height]).toEqual([200, 200])

    const full = await fullRender(doc, 4, 0)
    // The region's top-left in the full render: x from the left, y from the top edge.
    const left = REGION.x * 4
    const top = (792 - (REGION.y + REGION.height)) * 4
    const region = pixels(canvas, 0, 0, 200, 200)
    const same = pixels(full, left, top, 200, 200)
    expect(darkCount(region)).toBeGreaterThan(100)
    expect(meanDiff(region, same)).toBeLessThan(4)
    expect(
      meanDiff(pixels(canvas, 100, 100, 1, 1), pixels(full, left + 100, top + 100, 1, 1))
    ).toBeLessThan(16)
  })

  it('places a region at a scale that does not land on whole pixels', async () => {
    // At 1.1 px per point the region's corner falls at (79.2, 46.2) in the full render. Its
    // canvas size and its offset are worked out separately; they must still agree there.
    const doc = await open('text-simple')
    const scale = 1.1
    const canvas = document.createElement('canvas')
    await drawRegion(doc, REGION, scale, canvas)
    expect([canvas.width, canvas.height]).toEqual([55, 55])

    const full = await fullRender(doc, scale, 0)
    const left = Math.round(REGION.x * scale)
    const top = Math.round((792 - (REGION.y + REGION.height)) * scale)
    const region = pixels(canvas, 0, 0, 55, 55)
    expect(darkCount(region)).toBeGreaterThan(20)
    const at = (dx: number, dy: number) =>
      meanDiff(region, pixels(full, left + dx, top + dy, 55, 55))
    const here = at(0, 0)
    // No one-pixel shift matches better than the place the region should sit.
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const)
      expect(at(dx, dy)).toBeGreaterThan(here)
  })

  it.each([
    [0, 90],
    [270, 0],
    [90, 180],
  ] as const)(
    'turns with the page on a /Rotate 90 page at view rotation %i',
    async (view: ViewRotation, total: number) => {
      const doc = await open('text-rotated-90')
      const t = createPageTransform(doc.pages[0]!, 4, view)
      expect(t.totalRotation).toBe(total)
      const canvas = document.createElement('canvas')
      await drawRegion(doc, REGION, 4, canvas, undefined, t.totalRotation)
      expect([canvas.width, canvas.height]).toEqual([200, 200])

      const full = await fullRender(doc, 4, t.totalRotation)
      const at = t.toCssRect(REGION)
      const region = pixels(canvas, 0, 0, 200, 200)
      const same = pixels(full, Math.round(at.left), Math.round(at.top), 200, 200)
      expect(darkCount(region)).toBeGreaterThan(100)
      expect(meanDiff(region, same)).toBeLessThan(4)
    }
  )

  it("turns a region with the page's own rotation", async () => {
    const doc = await open('text-rotated-90')
    const canvas = document.createElement('canvas')
    await drawRegion(doc, { x: 72, y: 700, width: 100, height: 50 }, 2, canvas)
    // Turned a quarter: the wide region is tall on the canvas.
    expect([canvas.width, canvas.height]).toEqual([100, 200])
  })

  it('rejects with the abort reason when the signal aborts', async () => {
    const doc = await open('text-simple')
    const canvas = document.createElement('canvas')
    const before = new AbortController()
    before.abort()
    await expect(drawRegion(doc, REGION, 4, canvas, before.signal)).rejects.toMatchObject(
      {
        name: 'AbortError',
      }
    )

    // Abort once the render has started, so it is the cancel that rejects, not the check
    // before rendering. PDF.js hands out one proxy per page, so the patch reaches the reader.
    const page = await doc._pdfjs.getPage(0)
    const render = page.render.bind(page)
    let started!: () => void
    const begun = new Promise<void>((resolve) => (started = resolve))
    let task: ReturnType<typeof render> | undefined
    page.render = (params) => {
      task = render(params)
      started()
      return task
    }
    const during = new AbortController()
    const pending = drawRegion(doc, REGION, 40, canvas, during.signal)
    await begun
    during.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await expect(task!.promise).rejects.toMatchObject({
      name: 'RenderingCancelledException',
    })
  })
})

/**
 * The strings and boxes of page 0 of `text-search` as the document gave them before text was read
 * through the reader: `[str, x, y, width, height]`.
 */
const TEXT_SEARCH_PAGE_0 = [
  ['Inv', 72, 697.102, 18.676000000000002, 12.950000000000045],
  ['oice', 90.396, 697.102, 28.013999999999996, 12.950000000000045],
  ['', 72, 673.102, 0, 12.950000000000045],
  ['A long docu-', 72, 673.102, 78.596, 12.950000000000045],
  ['ment ends here.', 72, 657.102, 101.16399999999999, 12.950000000000045],
  ['café crème', 72, 633.102, 69.24399999999997, 12.950000000000045],
  ['“quoted” and ‘single’', 72, 609.102, 126.05600000000004, 12.950000000000045],
  ['left column', 72, 557.102, 67.69, 12.950000000000045],
  [' ', 139.69, 557.102, 180.31, 12.950000000000045],
  ['right column', 320, 557.102, 76.24400000000003, 12.950000000000045],
  ['left second line', 72, 541.102, 93.38, 12.950000000000045],
  [' ', 165.38, 541.102, 154.62, 12.950000000000045],
  ['right second line', 320, 541.102, 101.93400000000003, 12.950000000000045],
  ['widely', 72, 497.102, 43.891999999999996, 12.949999999999989],
  [' ', 115.89200000000002, 497.102, 9.891999999999996, 12.949999999999989],
  ['spaced', 125.78400000000002, 497.102, 50.135999999999996, 12.949999999999989],
  [' ', 175.92, 497.102, 9.891999999999996, 12.949999999999989],
  ['words', 185.81199999999998, 497.102, 41.337999999999994, 12.949999999999989],
  ['kerned', 72, 473.102, 48.078, 12.949999999999989],
  [' ', 120.07800000000003, 473.102, 9.891999999999996, 12.949999999999989],
  ['word', 129.97000000000003, 473.102, 33.337999999999994, 12.949999999999989],
  ['Hello World', 72, 437.102, 76.55399999999997, 12.949999999999989],
  ['half full', 72, 413.102, 31.122, 12.949999999999989],
  ['To', 72, 389.102, 14.657999999999987, 12.949999999999989],
]

const stringsAndBoxes = (content: TextContent) =>
  content.items.map((i) => [i.str, i.rect.x, i.rect.y, i.rect.width, i.rect.height])

describe('what the PDF.js reader reads besides pixels', () => {
  /** A PDF.js reader over `doc`'s handles. */
  const readerOf = (doc: InkDocument) =>
    createPdfjsReader(doc._pdfjs, { measure: canvasMeasureChar() })

  async function openAny(
    name: 'text-search' | 'links' | 'outline' | 'annotated-markup'
  ): Promise<InkDocument> {
    const doc = await openFixtureInBrowser(name)
    cleanup.push(() => void doc.destroy())
    return doc
  }

  it('reads the text the document gave before', async () => {
    const doc = await openAny('text-search')
    const reader = readerOf(doc)
    const measured = await reader.text(0, { glyphs: false })
    expect(measured.page).toBe(0)
    expect(stringsAndBoxes(measured)).toEqual(TEXT_SEARCH_PAGE_0)
    // With glyphs, everything the document gives, boundaries included.
    expect(await reader.text(0, { glyphs: true })).toEqual(await doc.text(0))
  })

  it('stops a text read once its signal aborts, with the reason', async () => {
    const doc = await openAny('text-search')
    const reader = readerOf(doc)
    const reason = new Error('moved on')
    await expect(
      reader.text(0, { glyphs: false, signal: AbortSignal.abort(reason) })
    ).rejects.toBe(reason)
    const c = new AbortController()
    const reading = reader.text(0, { glyphs: true, signal: c.signal })
    c.abort(reason)
    await expect(reading).rejects.toBe(reason)
    // A signal that does not abort changes nothing.
    expect(
      await reader.text(0, { glyphs: true, signal: new AbortController().signal })
    ).toEqual(await reader.text(0, { glyphs: true }))
  })

  it('reads the links the document gives', async () => {
    const doc = await openAny('links')
    const links = await readerOf(doc).links(0)
    expect(links).toHaveLength(8)
    expect(links.map((l) => [l.id, l.order])).toEqual([
      ['pdf:0:11R', 0],
      ['pdf:0:12R', 1],
      ['pdf:0:13R', 2],
      ['pdf:0:14R', 3],
      ['pdf:0:15R', 4],
      ['pdf:0:16R', 5],
      ['pdf:0:17R', 6],
      ['pdf:0:18R', 7],
    ])
    expect(links[0]).toMatchObject({
      page: 0,
      rect: { x: 68, y: 696, width: 70, height: 18 },
    })
    expect(links.map((l) => l.target)).toEqual([
      { kind: 'dest', raw: [{ num: 6, gen: 0 }, { name: 'XYZ' }, 72, 600, null] },
      { kind: 'dest', raw: 'chapter-3' },
      { kind: 'url', url: 'https://example.com/a', newWindow: false },
      { kind: 'unsupported', reason: 'unsafe-url' },
      { kind: 'named', action: 'NextPage' },
      { kind: 'unsupported', reason: 'remote' },
      { kind: 'unsupported', reason: 'launch' },
      { kind: 'url', url: 'https://example.com/wrapped', newWindow: false },
    ])
    expect(links[7]!.quads).toHaveLength(2)
    expect(links).toEqual(doc.links(0))
  })

  it('reads the outline the document gives', async () => {
    const doc = await openAny('outline')
    const outline = await readerOf(doc).outline()
    type Item = (typeof outline)[number]
    const titles = (items: readonly Item[]): unknown[] =>
      items.map((i) => (i.children.length > 0 ? [i.title, titles(i.children)] : i.title))
    expect(titles(outline)).toEqual([
      'Cover',
      ['Part One', ['Chapter 1', 'Chapter 2']],
      ['Part Two', ['Section A', 'Section B']],
      'Appendix',
      'Website',
      'Next page',
      'Broken',
    ])
    expect(outline[1]!.children[1]!.target).toEqual({
      kind: 'resolved',
      dest: { page: 1, fit: 'xyz', left: 72, top: 500, zoom: undefined },
    })
    expect(outline[2]!.children[0]!.target).toEqual({
      kind: 'resolved',
      dest: { page: 3, fit: 'fitr', rect: { x: 72, y: 100, width: 228, height: 300 } },
    })
    expect(outline).toEqual(await doc.outline())
  })

  it('resolves a named destination as the document does', async () => {
    const doc = await openAny('outline')
    const dest = await readerOf(doc).resolveDestination('chapter-2')
    expect(dest).toEqual({ page: 1, fit: 'xyz', left: 72, top: 500, zoom: undefined })
    expect(dest).toEqual(await doc.resolveDestination('chapter-2'))
  })

  it("reads the file's facts the document gives", async () => {
    const doc = await openAny('text-search')
    expect(await readerOf(doc).facts()).toEqual({
      title: 'Inkbar fixture',
      author: 'Inkbar',
      encrypted: false,
    })
  })

  it('carries on without the metadata when PDF.js cannot read it', async () => {
    const doc = await openAny('text-search')
    vi.spyOn(doc._pdfjs.proxy, 'getMetadata').mockRejectedValue(new Error('bad XMP'))
    expect(await readerOf(doc).facts()).toEqual({ encrypted: false })
  })

  it("reads a page's annotations in core's shape, in PDF.js's order", async () => {
    const doc = await openAny('annotated-markup')
    const annotations = await readerOf(doc).annotations(0)
    expect(annotations.map((a) => a.subtype)).toEqual([
      'Highlight',
      'Underline',
      'StrikeOut',
      'Squiggly',
    ])
    expect(annotations[0]).toMatchObject({
      id: '7R',
      author: 'Ed',
      contents: 'highlighted',
      color: [255, 255, 0],
      opacity: 0.5,
    })
  })

  it('reads a page again after a read that rejected', async () => {
    const doc = await openAny('annotated-markup')
    const getPage = vi.spyOn(doc._pdfjs, 'getPage')
    getPage.mockRejectedValueOnce(new Error('page gone'))
    const reader = readerOf(doc)
    await expect(reader.annotations(0)).rejects.toThrow('page gone')
    expect(await reader.annotations(0)).toHaveLength(4)
    // A page read is kept: a second read asks for the page no more.
    await reader.annotations(0)
    expect(getPage).toHaveBeenCalledTimes(2)
  })

  it("reads each page's annotations once while it opens, for its own use and the reader's links", async () => {
    // Every page proxy shares one prototype: spying on it sees each document's pages.
    const first = await openAny('links')
    const proto = Object.getPrototypeOf(await first._pdfjs.getPage(0)) as {
      getAnnotations(): Promise<PdfjsAnnotationData[]>
    }
    const spy = vi.spyOn(proto, 'getAnnotations')
    cleanup.push(() => spy.mockRestore())
    const pagesRead = () =>
      spy.mock.contexts
        .map((page) => (page as { pageNumber: number }).pageNumber)
        .sort((a, b) => a - b)
    const doc = await openAny('links')
    const each = Array.from({ length: doc.pages.length }, (_, i) => i + 1)
    expect(pagesRead()).toEqual(each)
    // The open does not keep what it read, so links asked for after it read the page again.
    for (let i = 0; i < doc.pages.length; i++)
      expect(await doc._reader.links(i)).toEqual(doc.links(i))
    expect(pagesRead()).toEqual(each.flatMap((n) => [n, n]))
  })
})
