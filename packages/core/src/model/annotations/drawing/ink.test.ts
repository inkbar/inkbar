import { describe, expect, test } from 'vitest'

import { describeInk, inkOutline } from './ink'

import type { InkAnnotation } from '../types'
import type { DrawItem } from './types'

const base = {
  id: 'a',
  type: 'ink',
  page: 0,
  color: '#C0392B',
  opacity: 1,
  createdAt: '2026-10-19T12:00:00.000Z',
  modifiedAt: '2026-10-19T12:00:00.000Z',
  source: 'session',
  rect: { x: 100, y: 500, width: 100, height: 20 },
  width: 4,
} as const

const run = (y: number, n = 21) =>
  Array.from({ length: n }, (_, i) => ({ x: 100 + i * 5, y }))

const ink: InkAnnotation = { ...base, inklist: [run(510), run(540)] }

/** The path items inside the drawing's one group. */
function paths(a: InkAnnotation) {
  const group = describeInk(a).items[0]
  if (group?.kind !== 'group') throw new Error('no group')
  return group.items.map((item: DrawItem) => {
    if (item.kind !== 'path') throw new Error('not a path')
    return item
  })
}

function numbers(v: unknown): number[] {
  if (typeof v === 'number') return [v]
  if (Array.isArray(v)) return v.flatMap(numbers)
  if (v && typeof v === 'object') return Object.values(v).flatMap(numbers)
  return []
}

describe('describeInk', () => {
  test('each stroke is one closed filled outline', () => {
    const items = paths(ink)
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(item.role).toBe('stroke')
      expect(item.commands[0]!.op).toBe('M')
      expect(item.commands.at(-1)!.op).toBe('Z')
      expect(item.commands.slice(1, -1).every((c) => c.op === 'L')).toBe(true)
      expect(item.paint).toEqual({ fill: { color: '#C0392B' } })
    }
    expect(describeInk(ink)).toMatchObject({
      layer: 'annotation',
      items: [{ kind: 'group', opacity: 1 }],
    })
    expect(describeInk({ ...ink, opacity: 0.4 }).items[0]).toMatchObject({ opacity: 0.4 })
  })

  test('an outline follows its stroke in user space, as thick as the width', () => {
    const [first] = paths(ink)
    const ys = first!.commands.flatMap((c) => ('to' in c ? [c.to.y] : []))
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4, 0)
    expect(Math.min(...ys)).toBeGreaterThan(507)
    expect(Math.max(...ys)).toBeLessThan(513)
  })

  test('pressure thins and thickens the outline; no pressure keeps it even', () => {
    const ramp = run(510).map((_, i, all) => 0.1 + (0.8 * i) / (all.length - 1))
    /** The outline's height near x. */
    const heightNear = (a: InkAnnotation, x: number): number => {
      const ys = paths(a)[0]!.commands.flatMap((c) =>
        'to' in c && Math.abs(c.to.x - x) < 3 ? [c.to.y] : []
      )
      return Math.max(...ys) - Math.min(...ys)
    }
    const flat = { ...ink, inklist: [run(510)] }
    const pressed = { ...flat, pressure: [ramp] }
    expect(Math.abs(heightNear(flat, 130) - heightNear(flat, 190))).toBeLessThan(0.5)
    expect(heightNear(pressed, 190)).toBeGreaterThan(heightNear(pressed, 130) + 1)
  })

  test('the outline does not depend on any zoom', () => {
    expect(describeInk(ink)).toEqual(describeInk(structuredClone(ink)))
  })

  test('a one-point stroke describes without NaN', () => {
    const one: InkAnnotation = { ...ink, inklist: [[{ x: 150, y: 510 }]] }
    const d = describeInk(one)
    expect(numbers(d).length).toBeGreaterThan(0)
    expect(numbers(d).every(Number.isFinite)).toBe(true)
    expect(paths(one)).toHaveLength(1)
    expect(d.bounds.width).toBeGreaterThan(0)
  })

  test('an empty inklist describes with finite bounds and nothing drawn', () => {
    const d = describeInk({ ...ink, inklist: [] })
    expect(d.bounds).toEqual({ x: 100, y: 500, width: 0, height: 0 })
    expect(d.items).toEqual([{ kind: 'group', opacity: 1, items: [] }])
  })

  test('an empty stroke is a path with no commands, and does not disturb the bounds', () => {
    const d = describeInk({ ...ink, inklist: [[], run(510)] })
    expect(numbers(d).every(Number.isFinite)).toBe(true)
    expect(paths({ ...ink, inklist: [[], run(510)] })[0]!.commands).toEqual([])
    expect(d.bounds.width).toBeGreaterThan(90)
    const only = describeInk({ ...ink, inklist: [[]] })
    expect(numbers(only).every(Number.isFinite)).toBe(true)
    expect(only.bounds.width).toBe(0)
  })

  test('bounds hold every outline point', () => {
    const { bounds } = describeInk(ink)
    for (const item of paths(ink)) {
      for (const c of item.commands) {
        if (!('to' in c)) continue
        expect(c.to.x).toBeGreaterThanOrEqual(bounds.x - 1e-9)
        expect(c.to.x).toBeLessThanOrEqual(bounds.x + bounds.width + 1e-9)
        expect(c.to.y).toBeGreaterThanOrEqual(bounds.y - 1e-9)
        expect(c.to.y).toBeLessThanOrEqual(bounds.y + bounds.height + 1e-9)
      }
    }
  })
})

describe('inkOutline', () => {
  test('a one-point stroke is a round dot as wide as the stroke', () => {
    const dot = inkOutline([{ x: 150, y: 510 }], undefined, 6)
    const xs = dot.map((p) => p.x)
    const ys = dot.map((p) => p.y)
    // perfect-freehand adds a second point at +(1, 1) to a lone point: a capsule about 0.8
    // units longer than wide, unless the input is scaled up first.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6, 1)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(6, 1)
  })

  test('the outline of a one-point stroke is a circle: every point is half the width from the centre', () => {
    const at = { x: 150, y: 510 }
    const dot = inkOutline([at], undefined, 6)
    expect(dot.length).toBeGreaterThanOrEqual(8)
    const centre = {
      x: (Math.max(...dot.map((p) => p.x)) + Math.min(...dot.map((p) => p.x))) / 2,
      y: (Math.max(...dot.map((p) => p.y)) + Math.min(...dot.map((p) => p.y))) / 2,
    }
    // The dot sits on its point to a fraction of a point.
    expect(Math.hypot(centre.x - at.x, centre.y - at.y)).toBeLessThan(0.05)
    for (const p of dot)
      expect(Math.abs(Math.hypot(p.x - centre.x, p.y - centre.y) - 3)).toBeLessThan(0.05)
  })

  describe('the outline of a stroke that bends, for a fixed input', () => {
    // A bend, so the outline's tail follows the pen's smoothed path. These are the points of the
    // outline the current smoothing makes; a change of the smoothing options or of the library moves them.
    const pen = [
      { x: 100, y: 500 },
      { x: 110, y: 504 },
      { x: 120, y: 512 },
      { x: 128, y: 524 },
      { x: 132, y: 538 },
    ]
    interface Fixture {
      count: number
      /** The sums of every vertex's x and y, and the length of the closed outline, so no vertex can move unnoticed. */
      sumX: number
      sumY: number
      perimeter: number
      points: [number, number][]
    }
    const level: Fixture = {
      count: 52,
      sumX: 6132.942,
      sumY: 26961.819,
      perimeter: 108.427,
      points: [
        [100.743, 498.143],
        [106.502, 500.448],
        [115.082, 506.235],
        [129.587, 529.955],
        [99.795, 498.011],
        [100.277, 498.019],
        [100.743, 498.143],
      ],
    }
    const pressed: Fixture = {
      count: 52,
      sumX: 6136.615,
      sumY: 26961.837,
      perimeter: 102.963,
      points: [
        [100.52, 498.7],
        [106.502, 500.448],
        [115.537, 505.578],
        [129.222, 529.791],
        [99.856, 498.607],
        [100.194, 498.613],
        [100.52, 498.7],
      ],
    }
    /** The point count, the sums and perimeter over every vertex, and the first, second, third, middle and last three points. */
    const same = (got: readonly { x: number; y: number }[], want: Fixture) => {
      expect(got).toHaveLength(want.count)
      expect(
        got.reduce((sum, p) => sum + p.x, 0),
        'sum of x'
      ).toBeCloseTo(want.sumX, 2)
      expect(
        got.reduce((sum, p) => sum + p.y, 0),
        'sum of y'
      ).toBeCloseTo(want.sumY, 2)
      expect(
        got.reduce((sum, p, i) => {
          const next = got[(i + 1) % got.length]!
          return sum + Math.hypot(next.x - p.x, next.y - p.y)
        }, 0),
        'perimeter'
      ).toBeCloseTo(want.perimeter, 2)
      const at = [
        0,
        1,
        2,
        Math.floor(want.count / 2),
        want.count - 3,
        want.count - 2,
        want.count - 1,
      ]
      at.forEach((index, i) => {
        expect(got[index]!.x, `x of point ${index}`).toBeCloseTo(want.points[i]![0], 2)
        expect(got[index]!.y, `y of point ${index}`).toBeCloseTo(want.points[i]![1], 2)
      })
    }

    test('at an even width', () => {
      same(inkOutline(pen, undefined, 4), level)
    })

    test('thinned by pressure', () => {
      same(inkOutline(pen, [0.2, 0.5, 0.9, 0.6, 0.3], 4), pressed)
    })
  })

  test('is the outline the describer uses', () => {
    const pts = run(510)
    const outline = inkOutline(pts, undefined, 4)
    const first = paths({ ...ink, inklist: [pts] })[0]!
    expect(first.commands.length).toBe(outline.length + 1)
  })
})
