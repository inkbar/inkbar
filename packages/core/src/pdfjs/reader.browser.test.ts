import { afterEach, describe, expect, it } from 'vitest'

import { hiddenFromPdfjsIds, regionCanvasSize } from '../dom/draw-request'
import { openFixtureInBrowser } from '../dom/test-utils'
import {
  createPageTransform,
  normalizeRotation,
  type ViewRotation,
} from '../dom/transform'

import { hiddenAppearances } from './widget-appearance'

import type { InkDocument } from '../model/document'
import type { Rect } from '../model/geometry'

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
