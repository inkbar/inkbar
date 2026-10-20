import { afterEach, describe, expect, it } from 'vitest'

import { openFixtureInBrowser } from '../dom/test-utils'
import { createPageTransform, type ViewRotation } from '../dom/transform'

import { renderRegion } from './render-region'

import type { InkDocument } from '../model/document'
import type { Rect } from '../model/geometry'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((f) => f()))

async function open(name: 'text-simple' | 'text-rotated-90'): Promise<InkDocument> {
  const doc = await openFixtureInBrowser(name)
  cleanup.push(() => void doc.destroy())
  return doc
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

describe('renderRegion', () => {
  it('fills the canvas with the region, matching a full render at the same scale', async () => {
    const doc = await open('text-simple')
    const canvas = document.createElement('canvas')
    await renderRegion(doc, 0, REGION, 4, canvas)
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
      await renderRegion(doc, 0, REGION, 4, canvas, undefined, t.totalRotation)
      expect([canvas.width, canvas.height]).toEqual([200, 200])

      const full = await fullRender(doc, 4, t.totalRotation)
      const at = t.toCssRect(REGION)
      const region = pixels(canvas, 0, 0, 200, 200)
      const same = pixels(full, Math.round(at.left), Math.round(at.top), 200, 200)
      expect(darkCount(region)).toBeGreaterThan(100)
      expect(meanDiff(region, same)).toBeLessThan(4)
    }
  )

  it("defaults to the page's own rotation", async () => {
    const doc = await open('text-rotated-90')
    const canvas = document.createElement('canvas')
    await renderRegion(doc, 0, { x: 72, y: 700, width: 100, height: 50 }, 2, canvas)
    // Turned a quarter: the wide region is tall on the canvas.
    expect([canvas.width, canvas.height]).toEqual([100, 200])
  })

  it('rejects with the abort reason when the signal aborts', async () => {
    const doc = await open('text-simple')
    const canvas = document.createElement('canvas')
    const before = new AbortController()
    before.abort()
    await expect(
      renderRegion(doc, 0, REGION, 4, canvas, before.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })

    // Abort once the render has started, so it is the cancel that rejects, not the check
    // before rendering. PDF.js hands out one proxy per page, so the patch reaches renderRegion.
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
    const pending = renderRegion(doc, 0, REGION, 40, canvas, during.signal)
    await begun
    during.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await expect(task!.promise).rejects.toMatchObject({
      name: 'RenderingCancelledException',
    })
  })
})
