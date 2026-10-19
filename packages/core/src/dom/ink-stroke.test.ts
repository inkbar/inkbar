import { describe, expect, it } from 'vitest'

import { JOIN_GAP_MS, outlinePath, strokeOutline } from './ink-stroke'

import type { Point } from '../model/geometry'

const line: Point[] = Array.from({ length: 41 }, (_, i) => ({ x: i * 5, y: 0 }))

/** Vertical distance from the stroke's axis to the outline, above it, near `x`. */
function halfWidthAt(outline: Point[], x: number): number {
  const near = outline.filter((p) => Math.abs(p.x - x) < 2.6)
  return Math.max(...near.map((p) => Math.abs(p.y)))
}

describe('strokeOutline', () => {
  it('returns a polygon around the stroke', () => {
    const outline = strokeOutline(line, undefined, 4)
    expect(outline.length).toBeGreaterThan(line.length)
  })

  it('has an even width along a stroke without pressure', () => {
    const outline = strokeOutline(line, undefined, 4)
    const [a, b, c] = [50, 100, 150].map((x) => halfWidthAt(outline, x))
    expect(a).toBeGreaterThan(0)
    expect(Math.abs(b! - a!) / a!).toBeLessThan(0.05)
    expect(Math.abs(c! - a!) / a!).toBeLessThan(0.05)
  })

  it('is wider at the heavy end when pressure grows', () => {
    const outline = strokeOutline(
      line,
      line.map((_, i) => 0.1 + (0.9 * i) / (line.length - 1)),
      4
    )
    const span = (from: number, to: number): number =>
      Math.max(
        ...outline.filter((p) => p.x >= from && p.x <= to).map((p) => Math.abs(p.y))
      )
    expect(span(150, 200)).toBeGreaterThan(span(0, 50))
  })

  it('draws a dot for a single point', () => {
    expect(strokeOutline([{ x: 5, y: 5 }], undefined, 4).length).toBeGreaterThan(2)
  })
})

describe('outlinePath', () => {
  it('is a closed SVG path', () => {
    const d = outlinePath(strokeOutline(line, undefined, 4))
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
  })

  it('is empty for an empty outline', () => {
    expect(outlinePath([])).toBe('')
  })
})

describe('JOIN_GAP_MS', () => {
  it('is one second', () => {
    expect(JOIN_GAP_MS).toBe(1000)
  })
})
