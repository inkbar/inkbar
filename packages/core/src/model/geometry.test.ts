import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  applyMatrix,
  approxEqual,
  invertMatrix,
  multiplyMatrix,
  quadFromRect,
  quadsFromFlat,
  quadsFromRect,
  rectContainsPoint,
  rectFromPoints,
  rectFromQuad,
  rectFromQuads,
  rectsIntersect,
  translateRect,
  unionRects,
  type Matrix,
  type Point,
} from './geometry'

const point = fc.record({
  x: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
  y: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
})
const coeff = fc.double({ min: -10, max: 10, noNaN: true })
const offset = fc.double({ min: -1e3, max: 1e3, noNaN: true })
/** Full affine matrices (rotation, skew, scale, translate); near-singular ones are excluded. */
const matrix = fc
  .tuple(coeff, coeff, coeff, coeff, offset, offset)
  .filter(([a, b, c, d]) => Math.abs(a * d - b * c) > 1) as fc.Arbitrary<Matrix>

/** Tolerance scales with magnitude: 1e-9 relative, floored at 1e-6 absolute. */
const near = (a: number, b: number): boolean =>
  approxEqual(a, b, Math.max(1e-6, 1e-9 * Math.max(Math.abs(a), Math.abs(b))))

describe('geometry', () => {
  it('rectFromPoints normalises any two corners', () => {
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 0, y: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 20,
    })
  })

  it('quad and rect round-trip', () => {
    const r = { x: 72, y: 695, width: 228, height: 20 }
    expect(rectFromQuad(quadFromRect(r))).toEqual(r)
    expect(quadFromRect(r)).toEqual({
      p1: { x: 72, y: 715 },
      p2: { x: 300, y: 715 },
      p3: { x: 72, y: 695 },
      p4: { x: 300, y: 695 },
    })
  })

  it('quadsFromFlat reads PDF.js flat QuadPoints', () => {
    const flat = new Float32Array([
      72, 715, 300, 715, 72, 695, 300, 695, 0, 10, 10, 10, 0, 0, 10, 0,
    ])
    const quads = quadsFromFlat(flat)
    expect(quads).toHaveLength(2)
    expect(rectFromQuad(quads[1]!)).toEqual({ x: 0, y: 0, width: 10, height: 10 })
  })

  it('unionRects spans all inputs and rejects empty input', () => {
    expect(
      unionRects([
        { x: 0, y: 0, width: 1, height: 1 },
        { x: 5, y: 5, width: 1, height: 1 },
      ])
    ).toEqual({ x: 0, y: 0, width: 6, height: 6 })
    expect(() => unionRects([])).toThrow(RangeError)
  })

  it('intersection and containment', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 }
    expect(rectsIntersect(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true)
    expect(rectsIntersect(a, { x: 10, y: 0, width: 1, height: 1 })).toBe(false)
    expect(rectContainsPoint(a, { x: 10, y: 10 })).toBe(true)
    expect(rectContainsPoint(a, { x: 10.01, y: 0 })).toBe(false)
    expect(translateRect(a, 1, -1)).toEqual({ x: 1, y: -1, width: 10, height: 10 })
  })

  it('matrix inverse undoes apply', () => {
    fc.assert(
      fc.property(matrix, point, (m, p) => {
        const back = applyMatrix(invertMatrix(m), applyMatrix(m, p))
        return near(back.x, p.x) && near(back.y, p.y)
      })
    )
  })

  it('a matrix times its inverse is the identity', () => {
    fc.assert(
      fc.property(matrix, (m) => {
        const id = multiplyMatrix(m, invertMatrix(m))
        return [1, 0, 0, 1, 0, 0].every((v, i) => near(id[i]!, v))
      })
    )
  })

  it('applying a product equals applying a then b', () => {
    fc.assert(
      fc.property(matrix, matrix, point, (a, b, p) => {
        const direct = applyMatrix(multiplyMatrix(a, b), p)
        const stepwise = applyMatrix(b, applyMatrix(a, p))
        return near(direct.x, stepwise.x) && near(direct.y, stepwise.y)
      })
    )
  })

  it('multiplyMatrix composes left to right', () => {
    const scale: Matrix = [2, 0, 0, 2, 0, 0]
    const move: Matrix = [1, 0, 0, 1, 10, 5]
    const p: Point = { x: 1, y: 1 }
    expect(applyMatrix(multiplyMatrix(scale, move), p)).toEqual({ x: 12, y: 7 })
    const rotate90: Matrix = [0, 1, -1, 0, 0, 0]
    expect(applyMatrix(multiplyMatrix(rotate90, move), { x: 1, y: 0 })).toEqual({
      x: 10,
      y: 6,
    })
  })
})

describe('quadsFromRect and rectFromQuads', () => {
  it('builds one quad in the sandbox line() corner order', () => {
    const left = 383
    const bottom = 246.9
    const right = 443.35
    const top = 258.91
    expect(
      quadsFromRect({ x: left, y: bottom, width: right - left, height: top - bottom })
    ).toEqual([
      {
        p1: { x: left, y: top },
        p2: { x: right, y: top },
        p3: { x: left, y: bottom },
        p4: { x: right, y: bottom },
      },
    ])
  })

  it('round-trips a rect', () => {
    const r = { x: 383, y: 246.9, width: 60.35, height: 12.01 }
    const back = rectFromQuads(quadsFromRect(r))
    // x + width - x is not exact in floating point.
    expect(back.x).toBe(r.x)
    expect(back.y).toBe(r.y)
    expect(back.width).toBeCloseTo(r.width, 9)
    expect(back.height).toBeCloseTo(r.height, 9)
  })

  it('gives the union of several quads', () => {
    const quads = [
      ...quadsFromRect({ x: 0, y: 0, width: 10, height: 5 }),
      ...quadsFromRect({ x: 20, y: 10, width: 5, height: 5 }),
    ]
    expect(rectFromQuads(quads)).toEqual({ x: 0, y: 0, width: 25, height: 15 })
  })
})
