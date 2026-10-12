import { fixtureBytes } from '@inkbar/fixtures'
import { assert as fcAssert, constantFrom, double, property } from 'fast-check'
import { describe, expect, it } from 'vitest'

import { openDocument } from '../model/document'
import { approxEqual } from '../model/geometry'
import { nodeAssets } from '../pdfjs/node-assets'

import { createPageTransform, normalizeRotation, type ViewRotation } from './transform'

import type { PageInfo } from '../model/pages'

const ROTATIONS: ViewRotation[] = [0, 90, 180, 270]

describe('normalizeRotation', () => {
  it('maps multiples of 90 onto 0, 90, 180 or 270', () => {
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(450)).toBe(90)
    expect(normalizeRotation(360)).toBe(0)
    expect(normalizeRotation(-720)).toBe(0)
    expect(normalizeRotation(180)).toBe(180)
  })

  it('throws RangeError for anything else', () => {
    expect(() => normalizeRotation(45)).toThrow(RangeError)
    expect(() => normalizeRotation(Number.NaN)).toThrow(RangeError)
    expect(() => normalizeRotation(90.5)).toThrow(RangeError)
  })
})

describe('createPageTransform', () => {
  it.each([
    'text-simple',
    'text-rotated-90',
    'text-rotated-270',
    'cropbox-offset',
    'userunit-2',
  ] as const)('%s matches PDF.js viewport for every rotation and zoom', async (name) => {
    const doc = await openDocument(await fixtureBytes(name), { assets: nodeAssets() })
    await doc.ready
    const page = doc.pages[0]!
    if (name === 'userunit-2') expect(page.userUnit).toBe(2)
    const proxy = await doc._pdfjs.getPage(0)
    for (const rotation of ROTATIONS) {
      for (const zoom of [0.5, 1, 1.333, 3]) {
        const t = createPageTransform(page, zoom, rotation)
        const vp = proxy.getViewport({
          scale: zoom,
          rotation: (page.rotate + rotation) % 360,
        })
        expect(t.cssWidth).toBeCloseTo(vp.width, 6)
        expect(t.cssHeight).toBeCloseTo(vp.height, 6)
        t.matrix.forEach((v, i) => {
          expect(v).toBeCloseTo(vp.transform[i]!, 6)
        })
        const corners = [
          [0, 0],
          [page.box.x, page.box.y],
          [100, 200],
          [page.box.x + page.box.width, page.box.y + page.box.height],
        ] as const
        for (const [x, y] of corners) {
          const [vx, vy] = vp.convertToViewportPoint(x, y) as [number, number]
          const p = t.toCss({ x, y })
          expect(p.x).toBeCloseTo(vx, 6)
          expect(p.y).toBeCloseTo(vy, 6)
          const [px, py] = vp.convertToPdfPoint(vx, vy) as [number, number]
          const back = t.fromCss(p)
          expect(back.x).toBeCloseTo(px, 6)
          expect(back.y).toBeCloseTo(py, 6)
          expect(back.x).toBeCloseTo(x, 6)
          expect(back.y).toBeCloseTo(y, 6)
        }
      }
    }
    doc.destroy()
  })

  it('round-trips arbitrary points within 0.01pt, including offset boxes', () => {
    const page: PageInfo = {
      index: 0,
      box: { x: 50, y: 50, width: 500, height: 700 },
      rotate: 90,
      userUnit: 1,
      width: 500,
      height: 700,
    }
    fcAssert(
      property(
        constantFrom(...ROTATIONS),
        double({ min: 0.1, max: 8, noNaN: true }),
        double({ min: 0, max: 600, noNaN: true }),
        double({ min: 0, max: 800, noNaN: true }),
        (rotation, zoom, x, y) => {
          const t = createPageTransform(page, zoom, rotation)
          const back = t.fromCss(t.toCss({ x, y }))
          return approxEqual(back.x, x) && approxEqual(back.y, y)
        }
      )
    )
  })

  it('toCssRect returns a top-left box with positive size', () => {
    const page: PageInfo = {
      index: 0,
      box: { x: 0, y: 0, width: 612, height: 792 },
      rotate: 0,
      userUnit: 1,
      width: 612,
      height: 792,
    }
    const t = createPageTransform(page, 2, 0)
    const rect = { x: 72, y: 695, width: 228, height: 20 }
    expect(t.toCssRect(rect)).toEqual({
      left: 144,
      top: (792 - 715) * 2,
      width: 456,
      height: 40,
    })
    const r = createPageTransform(page, 1, 90).toCssRect({
      x: 0,
      y: 0,
      width: 10,
      height: 20,
    })
    expect(r.width).toBeCloseTo(20)
    expect(r.height).toBeCloseTo(10)
    expect(t.fromCssRect(t.toCssRect(rect))).toEqual(rect)
  })

  it('fromCssRect inverts toCssRect for every rotation on an offset box', () => {
    const page: PageInfo = {
      index: 0,
      box: { x: 50, y: 50, width: 500, height: 700 },
      rotate: 0,
      userUnit: 1,
      width: 500,
      height: 700,
    }
    const rect = { x: 120, y: 300, width: 80, height: 30 }
    for (const rotation of ROTATIONS) {
      const t = createPageTransform(page, 1.5, rotation)
      const back = t.fromCssRect(t.toCssRect(rect))
      expect(back.x).toBeCloseTo(rect.x, 6)
      expect(back.y).toBeCloseTo(rect.y, 6)
      expect(back.width).toBeCloseTo(rect.width, 6)
      expect(back.height).toBeCloseTo(rect.height, 6)
    }
  })

  it('toCssQuad maps each corner without re-ordering', () => {
    const page: PageInfo = {
      index: 0,
      box: { x: 0, y: 0, width: 100, height: 200 },
      rotate: 0,
      userUnit: 1,
      width: 100,
      height: 200,
    }
    const t = createPageTransform(page, 2, 0)
    const q = t.toCssQuad({
      p1: { x: 10, y: 50 },
      p2: { x: 30, y: 50 },
      p3: { x: 10, y: 40 },
      p4: { x: 30, y: 40 },
    })
    expect(q).toEqual({
      p1: { x: 20, y: 300 },
      p2: { x: 60, y: 300 },
      p3: { x: 20, y: 320 },
      p4: { x: 60, y: 320 },
    })
  })

  it('converts lengths by zoom times userUnit', () => {
    const page: PageInfo = {
      index: 0,
      box: { x: 0, y: 0, width: 100, height: 100 },
      rotate: 270,
      userUnit: 1,
      width: 100,
      height: 100,
    }
    const t = createPageTransform(page, 1.5, 90)
    expect(t.toCssLength(12)).toBe(18)
    expect(t.fromCssLength(18)).toBe(12)
    const u = createPageTransform({ ...page, userUnit: 2 }, 1.5, 0)
    expect(u.toCssLength(12)).toBe(36)
    expect(u.fromCssLength(36)).toBe(12)
    expect(u.cssWidth).toBe(300)
  })
})
