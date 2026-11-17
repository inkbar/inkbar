import { describe, expect, test } from 'vitest'

import { GLYPHS } from './note'
import { parsePathData } from './path-data'

import type { PathCommand } from './types'

const M = (x: number, y: number): PathCommand => ({ op: 'M', to: { x, y } })
const L = (x: number, y: number): PathCommand => ({ op: 'L', to: { x, y } })
const Z: PathCommand = { op: 'Z' }

describe('parsePathData', () => {
  test('relative commands become absolute', () => {
    expect(parsePathData('M10 10l5 0v5h-5z')).toEqual([
      M(10, 10),
      L(15, 10),
      L(15, 15),
      L(10, 15),
      Z,
    ])
  })

  test('a lucide path with arcs parses', () => {
    const out = parsePathData('M17 22h-1a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h1')
    expect(out.map((c) => c.op)).toEqual(['M', 'L', 'A', 'L', 'A', 'L'])
    expect(out[2]).toEqual({
      op: 'A',
      rx: 4,
      ry: 4,
      largeArc: false,
      sweep: true,
      to: { x: 12, y: 18 },
    })
    expect(out[5]).toEqual(L(17, 2))
  })

  test('a smooth quadratic becomes cubics', () => {
    const [, first, second] = parsePathData('M0 0Q3 6 6 0T12 0')
    expect(first).toEqual({
      op: 'C',
      c1: { x: 2, y: 4 },
      c2: { x: 4, y: 4 },
      to: { x: 6, y: 0 },
    })
    // The second control point is the first's reflection through (6,0): (9,-6).
    expect(second).toEqual({
      op: 'C',
      c1: { x: 8, y: -4 },
      c2: { x: 10, y: -4 },
      to: { x: 12, y: 0 },
    })
  })

  test('a smooth cubic reflects the last control point, or starts at the current point', () => {
    const [, a, b] = parsePathData('M0 0c0 4 4 4 4 0s4-4 4 0')
    expect(a).toMatchObject({ c2: { x: 4, y: 4 } })
    expect(b).toEqual({
      op: 'C',
      c1: { x: 4, y: -4 },
      c2: { x: 8, y: -4 },
      to: { x: 8, y: 0 },
    })
    const [, c] = parsePathData('M0 0S2 2 4 0')
    expect(c).toMatchObject({ c1: { x: 0, y: 0 } })
  })

  test('numbers written without separators parse', () => {
    expect(parsePathData('M.5.5-1-1')).toEqual([M(0.5, 0.5), L(-1, -1)])
  })

  test('extra pairs after a move are lines, and Z returns to the start of the subpath', () => {
    expect(parsePathData('m1 1 2 0 0 2zl1 1')).toEqual([
      M(1, 1),
      L(3, 1),
      L(3, 3),
      Z,
      L(2, 2),
    ])
  })

  test('arc flags written without separators parse', () => {
    const [, arc] = parsePathData('M0 0a2 2 0 1120 4')
    expect(arc).toEqual({
      op: 'A',
      rx: 2,
      ry: 2,
      largeArc: true,
      sweep: true,
      to: { x: 20, y: 4 },
    })
  })

  test('an unknown command throws with its position', () => {
    expect(() => parsePathData('M0 0 X1 1')).toThrow(/unknown command X at position 5/)
  })

  test('a number with no command, and a path that does not start with a move, throw', () => {
    expect(() => parsePathData('L1 1')).toThrow(SyntaxError)
    expect(() => parsePathData('M0 0z 5')).toThrow(/position 6/)
    expect(() => parsePathData('M0')).toThrow(/expected a number/)
  })

  test('an empty path has no commands, and trailing space is ignored', () => {
    expect(parsePathData('')).toEqual([])
    expect(parsePathData('   ')).toEqual([])
    expect(parsePathData('M1 1 L2 2 \n ')).toEqual([M(1, 1), L(2, 2)])
  })

  test('S after a line starts its curve at the current point', () => {
    const [, , s] = parsePathData('M0 0L4 0S6 2 8 0')
    expect(s).toEqual({
      op: 'C',
      c1: { x: 4, y: 0 },
      c2: { x: 6, y: 2 },
      to: { x: 8, y: 0 },
    })
  })

  test('T after a cubic does not reflect its control point', () => {
    const [, , t] = parsePathData('M0 0C0 4 4 4 4 0T8 0')
    expect(t).toEqual({
      op: 'C',
      c1: { x: 4, y: 0 },
      c2: { x: 8 - 8 / 3, y: 0 },
      to: { x: 8, y: 0 },
    })
  })

  test('a relative command after Z is measured from the start of the subpath', () => {
    expect(parsePathData('M5 5l5 0 0 5zl1 1')).toEqual([
      M(5, 5),
      L(10, 5),
      L(10, 10),
      Z,
      L(6, 6),
    ])
  })
})

describe('parsePathData on long input', () => {
  test('a path of 200,000 numbers parses in under a second', () => {
    const d = 'M0 0' + 'l1 1'.repeat(100_000)
    const start = performance.now()
    expect(parsePathData(d)).toHaveLength(100_001)
    expect(performance.now() - start).toBeLessThan(1000)
  })

  test('numbers in every notation still read', () => {
    expect(parsePathData('M1e1,-.5L+2.5E-1 3.')).toEqual([
      { op: 'M', to: { x: 10, y: -0.5 } },
      { op: 'L', to: { x: 0.25, y: 3 } },
    ])
  })
})

describe('the arcs of the note glyphs', () => {
  test('a rotated arc is refused', () => {
    expect(() => parsePathData('M0 0a4 2 30 0 1 4 4')).toThrow(/rotated arc/)
  })

  test('no glyph a note draws has one', () => {
    let paths = 0
    for (const [name, node] of Object.entries(GLYPHS))
      for (const [tag, attrs] of node) {
        if (tag !== 'path') continue
        paths++
        expect(() => parsePathData(attrs['d']!), name).not.toThrow()
      }
    expect(paths).toBeGreaterThan(5)
  })
})
