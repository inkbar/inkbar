import { expect, test } from 'vitest'

import { arcToCubics } from './arc'

test('a quarter circle becomes one cubic with the usual control distance', () => {
  const [c] = arcToCubics(
    { x: 1, y: 0 },
    { op: 'A', rx: 1, ry: 1, largeArc: false, sweep: true, to: { x: 0, y: 1 } }
  )
  expect(c!.to).toEqual({ x: 0, y: 1 })
  expect(c!.c1.x).toBeCloseTo(1, 3)
  expect(c!.c1.y).toBeCloseTo(0.5523, 3)
  expect(c!.c2.x).toBeCloseTo(0.5523, 3)
  expect(c!.c2.y).toBeCloseTo(1, 3)
})

test('a half circle becomes two cubics ending on the target', () => {
  const cs = arcToCubics(
    { x: 1, y: 0 },
    { op: 'A', rx: 1, ry: 1, largeArc: false, sweep: true, to: { x: -1, y: 0 } }
  )
  expect(cs).toHaveLength(2)
  expect(cs[1]!.to.x).toBeCloseTo(-1, 6)
  expect(cs[0]!.to.y).toBeCloseTo(1, 3)
})

test('radii too small for the chord are scaled up, as SVG does', () => {
  const cs = arcToCubics(
    { x: 0, y: 0 },
    { op: 'A', rx: 1, ry: 1, largeArc: false, sweep: true, to: { x: 10, y: 0 } }
  )
  expect(cs.at(-1)!.to).toEqual({ x: 10, y: 0 })
  expect(cs.every((c) => Number.isFinite(c.c1.x + c.c1.y + c.c2.x + c.c2.y))).toBe(true)
})

test('a zero-length arc gives no cubics', () => {
  expect(
    arcToCubics(
      { x: 3, y: 3 },
      { op: 'A', rx: 1, ry: 1, largeArc: false, sweep: true, to: { x: 3, y: 3 } }
    )
  ).toEqual([])
})

test('a zero radius gives one straight cubic', () => {
  expect(
    arcToCubics(
      { x: 0, y: 0 },
      { op: 'A', rx: 0, ry: 5, largeArc: false, sweep: true, to: { x: 4, y: 2 } }
    )
  ).toEqual([{ op: 'C', c1: { x: 0, y: 0 }, c2: { x: 4, y: 2 }, to: { x: 4, y: 2 } }])
})

test('sweep false goes the other way round', () => {
  const [c] = arcToCubics(
    { x: 1, y: 0 },
    { op: 'A', rx: 1, ry: 1, largeArc: false, sweep: false, to: { x: 0, y: 1 } }
  )
  // The centre is (1,1), so the arc bulges towards the origin.
  expect(c!.c1.x).toBeCloseTo(0.4477, 3)
  expect(c!.c1.y).toBeCloseTo(0, 3)
  expect(c!.c2.x).toBeCloseTo(0, 3)
  expect(c!.c2.y).toBeCloseTo(0.4477, 3)
})

test('a large arc goes three quarters of the way round the other centre', () => {
  const cs = arcToCubics(
    { x: 1, y: 0 },
    { op: 'A', rx: 1, ry: 1, largeArc: true, sweep: true, to: { x: 0, y: 1 } }
  )
  expect(cs).toHaveLength(3)
  expect(cs[0]!.to.x).toBeCloseTo(2, 3)
  expect(cs[0]!.to.y).toBeCloseTo(1, 3)
  expect(cs[2]!.to).toEqual({ x: 0, y: 1 })
})
