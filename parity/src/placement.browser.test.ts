// Draws turned pages and regions with both readers and holds them to the suite's measure. The
// main suite draws whole pages at their own /Rotate only, so a turn or a region placed wrongly by
// one reader would pass it. Independent of parity.json: every case here must be the same.
import { createPageTransform, normalizeRotation } from '@inkbar/core/dom'
import { describe, expect, it } from 'vitest'

import { compare, type Comparison } from './compare'
import { geometryDifference, openWith, PIXELS_PER_POINT } from './draw'

import type { InkDocument, PageInfo, Rect } from '@inkbar/core'
import type { FixtureName } from '@inkbar/fixtures/urls'

type Turn = 0 | 90 | 180 | 270

/**
 * A rectangle in user space over two lines of each page's text, clear of the page's edges. Its
 * corners are at half points, between whole points but on whole pixels at 2 px per unit, so a
 * reader that misplaces the region by a point or more is caught whatever the turn. A region
 * whose top edge falls between two pixels is the case below that does not match.
 */
const REGIONS: Record<string, Rect> = {
  // Lines at baselines 676 and 652 from x 72, Helvetica 14.
  'text-simple': { x: 80.5, y: 640.5, width: 230, height: 49.5 },
  'text-rotated-90': { x: 80.5, y: 640.5, width: 230, height: 49.5 },
  'userunit-2': { x: 80.5, y: 640.5, width: 230, height: 49.5 },
  // The crop box is [50 50 550 750]; lines at baselines 626 and 602 from x 72.
  'cropbox-offset': { x: 80.5, y: 590.5, width: 230, height: 49.5 },
}

/**
 * CSS pixels per point for each fixture: `PIXELS_PER_POINT` over its /UserUnit, so every page is
 * drawn at 2 px per unit. At /UserUnit 2 and 4 px per point the two readers' Helvetica outlines
 * differ (parity.json records it), which would hide a placement error; the zoom still goes
 * through the user unit, so a reader that drops it is caught.
 */
const zoomOf = (info: PageInfo) => PIXELS_PER_POINT / info.userUnit

const FIXTURES = Object.keys(REGIONS) as FixtureName[]

/** The whole page's canvas size at `zoomOf(info)`, with `view` added to the page's turn. */
function pageCanvas(info: PageInfo, view: Turn): { width: number; height: number } {
  const t = createPageTransform(info, zoomOf(info), view)
  return { width: Math.round(t.cssWidth), height: Math.round(t.cssHeight) }
}

/**
 * The canvas a region fills, as the loupe sizes it (`regionCanvasSize` in core's
 * `dom/draw-request.ts`, which core does not export): the region's corners through the page
 * transform at `scale` device pixels per point and total turn `rotation`, rounded, at least 1.
 */
function regionCanvas(
  info: PageInfo,
  region: Rect,
  scale: number,
  rotation: Turn
): { width: number; height: number } {
  const t = createPageTransform(info, scale, normalizeRotation(rotation - info.rotate))
  const a = t.toCss({ x: region.x, y: region.y })
  const b = t.toCss({ x: region.x + region.width, y: region.y + region.height })
  return {
    width: Math.max(1, Math.round(Math.abs(b.x - a.x))),
    height: Math.max(1, Math.round(Math.abs(b.y - a.y))),
  }
}

interface Placement {
  zoom: number
  rotation: Turn
  width: number
  height: number
  region?: Rect
}

/** Page 0 of `doc`, drawn on white as `placement` asks, at pixel ratio 1. */
async function draw(doc: InkDocument, placement: Placement): Promise<ImageData> {
  const canvas = document.createElement('canvas')
  await doc._reader.draw({ page: 0, pixelRatio: 1, hide: [], ...placement }, canvas)
  expect([canvas.width, canvas.height]).toEqual([placement.width, placement.height])
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  canvas.width = canvas.height = 0
  return data
}

/** Share of pixels with any channel under 250. */
function inked(img: ImageData): number {
  let n = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i]! < 250 || img.data[i + 1]! < 250 || img.data[i + 2]! < 250) n++
  }
  return n / (img.width * img.height)
}

const describeNumbers = (c: Comparison) =>
  `${(c.share * 100).toFixed(2)}% of pixels, worst block ${(c.worstBlock * 100).toFixed(0)}%, ` +
  `longest unmatched run ${c.unmatchedRun} px, flat ${(c.flatShare * 100).toFixed(3)}%`

describe.each(FIXTURES)('%s', (name) => {
  /** Opens both readers, checks they agree on page 0, and hands both and PDF.js's facts on. */
  async function withBoth(
    work: (pdfjs: InkDocument, engine: InkDocument, info: PageInfo) => Promise<void>
  ): Promise<void> {
    const pdfjs = await openWith(name, 'pdfjs')
    try {
      const engine = await openWith(name, 'engine')
      try {
        const info = await pdfjs._reader.pageInfo(0)
        expect(geometryDifference(info, await engine._reader.pageInfo(0))).toEqual([])
        await work(pdfjs, engine, info)
      } finally {
        engine.destroy()
      }
    } finally {
      pdfjs.destroy()
    }
  }

  /** Draws `placement` with both readers and expects the same drawing, with ink on it. */
  async function expectSame(
    pdfjs: InkDocument,
    engine: InkDocument,
    placement: Placement,
    what: string
  ): Promise<void> {
    const a = await draw(pdfjs, placement)
    const b = await draw(engine, placement)
    expect(inked(a), `${what}: PDF.js draws it blank`).toBeGreaterThan(0.001)
    const measured = compare(a, b)
    expect(measured.same, `${what} differs: ${describeNumbers(measured)}`).toBe(true)
  }

  it.each([90, 270] as const)(
    'the whole page turned a further %i degrees is the same in both readers',
    async (view) => {
      await withBoth(async (pdfjs, engine, info) => {
        const rotation = normalizeRotation(info.rotate + view)
        await expectSame(
          pdfjs,
          engine,
          { zoom: zoomOf(info), rotation, ...pageCanvas(info, view) },
          `turned ${view}`
        )
      })
    }
  )

  it.each([0, 90] as const)(
    'a region with the page turned a further %i degrees is the same in both readers',
    async (view) => {
      await withBoth(async (pdfjs, engine, info) => {
        const region = REGIONS[name]!
        const zoom = zoomOf(info)
        const rotation = normalizeRotation(info.rotate + view)
        const size = regionCanvas(info, region, zoom, rotation)
        await expectSame(
          pdfjs,
          engine,
          { zoom, rotation, region, ...size },
          `region turned ${view}`
        )
      })
    }
  )

  it('the measure sees a region placed 2 pt off', async () => {
    await withBoth(async (pdfjs, engine, info) => {
      const region = REGIONS[name]!
      const zoom = zoomOf(info)
      const size = regionCanvas(info, region, zoom, info.rotate)
      const placed = { zoom, rotation: info.rotate, ...size }
      const a = await draw(pdfjs, { ...placed, region })
      const b = await draw(engine, { ...placed, region: { ...region, x: region.x + 2 } })
      expect(compare(a, b).same).toBe(false)
    })
  })
})

// The engine places a page in its bitmap at whole pixels: the module's render takes the page's
// offset as integers. PDF.js places it at the exact fraction. A region whose top edge falls half
// a pixel between two rows is therefore drawn half a pixel apart, and on a region of dense text
// that is more than the measure allows (about 0.3% of pixels against 0.1%). Across, the same half
// pixel stays within it. Marked as failing so the day the two match, this test says so.
describe('a region whose top edge falls between two pixels', () => {
  it.fails('is the same in both readers', async () => {
    const pdfjs = await openWith('text-simple', 'pdfjs')
    const engine = await openWith('text-simple', 'engine')
    try {
      const info = await pdfjs._reader.pageInfo(0)
      // The top edge at 690.25 pt is 203.5 px from the top of the page at 2 px per point.
      const region = { x: 80, y: 640.25, width: 230, height: 50 }
      const placement = {
        zoom: PIXELS_PER_POINT,
        rotation: info.rotate,
        region,
        ...regionCanvas(info, region, PIXELS_PER_POINT, info.rotate),
      }
      const measured = compare(
        await draw(pdfjs, placement),
        await draw(engine, placement)
      )
      expect(measured.same, describeNumbers(measured)).toBe(true)
    } finally {
      pdfjs.destroy()
      engine.destroy()
    }
  })
})
