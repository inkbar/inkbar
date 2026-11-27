// Draws turned pages and regions of a page, as the loupe draws one, and checks the engine against
// itself: a region drawn alone must be the same pixels as that area cut from the whole page drawn
// at the same turn. The baselines hold whole pages at their own /Rotate only, so a turn or a
// region placed wrongly would pass them.
import { createPageTransform, normalizeRotation } from '@inkbar/core/dom'
import { describe, expect, it } from 'vitest'

import { reporting, writePng } from './baselines'
import { describePixels, differenceImage, pixelDifference } from './differences'
import { openFixture } from './draw'

import type { InkDocument, PageInfo, Rect } from '@inkbar/core'
import type { FixtureName } from '@inkbar/fixtures/urls'

type Turn = 0 | 90 | 180 | 270

/** Pixels per unit the cases are drawn at, so a region's half-point corners fall on whole pixels. */
const SCALE = 2

/**
 * A rectangle in user space over two lines of each page's text, clear of the page's edges. Its
 * corners are at half points, between whole points but on whole pixels at `SCALE`; one case moves
 * them a quarter point, between two pixels.
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
 * CSS pixels per point for each fixture: `SCALE` over its /UserUnit, so every page is drawn at
 * `SCALE` px per unit; the zoom still goes through the user unit, so dropping it is caught.
 */
const zoomOf = (info: PageInfo) => SCALE / info.userUnit

const FIXTURES = Object.keys(REGIONS) as FixtureName[]

/** Where `region` lies on the whole page drawn at `zoom` and view turn `view`, in pixels. */
function regionBox(info: PageInfo, region: Rect, zoom: number, view: Turn) {
  const t = createPageTransform(info, zoom, view)
  const a = t.toCss({ x: region.x, y: region.y })
  const b = t.toCss({ x: region.x + region.width, y: region.y + region.height })
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    // As the loupe sizes a region's canvas (`regionCanvasSize` in core's
    // `dom/draw-request.ts`, which core does not export): rounded, at least 1.
    width: Math.max(1, Math.round(Math.abs(b.x - a.x))),
    height: Math.max(1, Math.round(Math.abs(b.y - a.y))),
  }
}

/** Page 0 of `doc` drawn on white at `zoom`, view turn `view` and pixel ratio 1. */
async function draw(
  doc: InkDocument,
  info: PageInfo,
  zoom: number,
  view: Turn,
  region?: Rect
): Promise<ImageData> {
  const t = createPageTransform(info, zoom, view)
  const size = region
    ? regionBox(info, region, zoom, view)
    : { width: Math.round(t.cssWidth), height: Math.round(t.cssHeight) }
  const canvas = document.createElement('canvas')
  await doc._reader.draw(
    {
      page: 0,
      pixelRatio: 1,
      hide: [],
      zoom,
      rotation: normalizeRotation(info.rotate + view),
      width: size.width,
      height: size.height,
      ...(region && { region }),
    },
    canvas
  )
  expect([canvas.width, canvas.height]).toEqual([size.width, size.height])
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  canvas.width = canvas.height = 0
  return data
}

/** The `width` × `height` pixels of `img` from (`x`, `y`). */
function cut(img: ImageData, x: number, y: number, width: number, height: number) {
  const out = new ImageData(width, height)
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * img.width + x) * 4
    out.data.set(img.data.subarray(from, from + width * 4), row * width * 4)
  }
  return out
}

/** Share of pixels with any channel under 250. */
function inked(img: ImageData): number {
  let n = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i]! < 250 || img.data[i + 1]! < 250 || img.data[i + 2]! < 250) n++
  }
  return n / (img.width * img.height)
}

/**
 * Draws `region` of `name`'s first page alone and the whole page, both at view turn `view`, and
 * gives the region and the same area cut from the page. `shift` moves the region drawn alone.
 */
async function regionAndCut(
  name: FixtureName,
  view: Turn,
  region: Rect,
  shift: Partial<Rect> = {}
): Promise<{ alone: ImageData; fromPage: ImageData }> {
  const doc = await openFixture(name)
  try {
    const info = await doc._reader.pageInfo(0)
    const zoom = zoomOf(info)
    const page = await draw(doc, info, zoom, view)
    const alone = await draw(doc, info, zoom, view, { ...region, ...shift })
    const box = regionBox(info, region, zoom, view)
    const fromPage = cut(
      page,
      Math.round(box.x),
      Math.round(box.y),
      alone.width,
      alone.height
    )
    return { alone, fromPage }
  } finally {
    doc.destroy()
  }
}

describe.each(FIXTURES)('%s', (name) => {
  it.each([0, 90, 270] as const)(
    'draws a region with the page turned a further %i degrees as the whole page draws it',
    async (view) => {
      const { alone, fromPage } = await regionAndCut(name, view, REGIONS[name]!)
      expect(inked(fromPage), 'the area cut from the page is blank').toBeGreaterThan(0.01)
      const difference = pixelDifference(fromPage, alone)
      if (difference.count > 0 && reporting) {
        const stem = `.report/placement/${name}-turned-${view}`
        await writePng(`${stem}-page.png`, fromPage)
        await writePng(`${stem}-region.png`, alone)
        await writePng(`${stem}-diff.png`, differenceImage(fromPage, alone))
      }
      expect(difference.count, describePixels(difference)).toBe(0)
    }
  )

  // The engine places a page in its bitmap at whole pixels, so a region whose corner falls between
  // two pixels is drawn as the area cut from the page at the nearest whole pixel, half rounded up.
  it('draws a region whose corner falls between two pixels as the page does', async () => {
    const region = REGIONS[name]!
    const { alone, fromPage } = await regionAndCut(name, 0, {
      ...region,
      x: region.x + 0.25,
      y: region.y - 0.25,
    })
    const difference = pixelDifference(fromPage, alone)
    expect(difference.count, describePixels(difference)).toBe(0)
  })

  it('tells a region drawn 1 pt off from the area cut from the page', async () => {
    const region = REGIONS[name]!
    const { alone, fromPage } = await regionAndCut(name, 0, region, {
      x: region.x + 1,
    })
    expect(pixelDifference(fromPage, alone).count).toBeGreaterThan(0)
  })
})
