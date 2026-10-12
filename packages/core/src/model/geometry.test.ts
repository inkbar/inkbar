import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  applyMatrix,
  approxEqual,
  invertMatrix,
  multiplyMatrix,
  quadFromRect,
  quadsFromFlat,
  rectContainsPoint,
  rectFromPoints,
  rectFromQuad,
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
const matrix = fc.tuple(
  fc.double({ min: -10, max: 10, noNaN: true }).filter((v) => Math.abs(v) > 0.01),
  fc.constant(0),
  fc.constant(0),
  fc.double({ min: -10, max: 10, noNaN: true }).filter((v) => Math.abs(v) > 0.01),
  fc.double({ min: -1e3, max: 1e3, noNaN: true }),
  fc.double({ min: -1e3, max: 1e3, noNaN: true })
) as fc.Arbitrary<Matrix>

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
        return approxEqual(back.x, p.x, 1e-6) && approxEqual(back.y, p.y, 1e-6)
      })
    )
  })

  it('multiplyMatrix composes left to right', () => {
    const scale: Matrix = [2, 0, 0, 2, 0, 0]
    const move: Matrix = [1, 0, 0, 1, 10, 5]
    const p: Point = { x: 1, y: 1 }
    expect(applyMatrix(multiplyMatrix(scale, move), p)).toEqual({ x: 12, y: 7 })
  })
})
