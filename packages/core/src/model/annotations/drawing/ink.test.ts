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
    const level: [number, number][] = [
      [100.743, 498.143],
      [106.502, 500.448],
      [115.082, 506.235],
      [123.544, 515.85],
      [129.565, 528.275],
      [129.746, 528.896],
      [129.72, 529.543],
      [129.488, 530.147],
      [129.075, 530.646],
      [128.525, 530.986],
      [127.895, 531.133],
      [127.251, 531.072],
      [126.66, 530.807],
      [126.184, 530.368],
      [125.874, 529.801],
      [125.761, 529.163],
      [125.858, 528.523],
      [126.154, 527.948],
      [126.618, 527.497],
      [127.202, 527.218],
      [127.844, 527.14],
      [128.478, 527.271],
      [129.036, 527.597],
      [129.462, 528.085],
      [129.709, 528.683],
      [129.752, 529.329],
      [129.587, 529.955],
      [129.23, 530.495],
      [128.72, 530.893],
      [128.109, 531.107],
      [127.462, 531.115],
      [126.847, 530.917],
      [126.326, 530.531],
      [125.957, 530],
      [125.957, 530.001],
      [120.508, 518.446],
      [112.806, 509.52],
      [104.998, 504.152],
      [99.257, 501.857],
      [98.834, 501.625],
      [98.479, 501.299],
      [98.213, 500.897],
      [98.05, 500.444],
      [98, 499.964],
      [98.067, 499.486],
      [98.246, 499.039],
      [98.527, 498.647],
      [98.894, 498.334],
      [99.325, 498.117],
      [99.795, 498.011],
      [100.277, 498.019],
      [100.743, 498.143],
    ]
    const pressed: [number, number][] = [
      [100.52, 498.7],
      [106.502, 500.448],
      [115.537, 505.578],
      [123.696, 515.72],
      [129.204, 528.447],
      [129.349, 528.945],
      [129.328, 529.462],
      [129.143, 529.945],
      [128.812, 530.344],
      [128.372, 530.617],
      [127.868, 530.734],
      [127.353, 530.685],
      [126.88, 530.474],
      [126.5, 530.122],
      [126.251, 529.668],
      [126.161, 529.158],
      [126.238, 528.646],
      [126.475, 528.186],
      [126.846, 527.825],
      [127.314, 527.602],
      [127.827, 527.539],
      [128.334, 527.644],
      [128.781, 527.905],
      [129.122, 528.296],
      [129.319, 528.774],
      [129.354, 529.291],
      [129.222, 529.791],
      [128.936, 530.223],
      [128.528, 530.542],
      [128.04, 530.713],
      [127.522, 530.72],
      [127.029, 530.561],
      [126.613, 530.253],
      [126.317, 529.828],
      [126.318, 529.828],
      [120.356, 518.576],
      [112.351, 510.177],
      [104.998, 504.152],
      [99.48, 501.3],
      [99.184, 501.138],
      [98.936, 500.909],
      [98.749, 500.628],
      [98.635, 500.31],
      [98.6, 499.975],
      [98.647, 499.64],
      [98.772, 499.327],
      [98.969, 499.053],
      [99.226, 498.834],
      [99.527, 498.682],
      [99.856, 498.607],
      [100.194, 498.613],
      [100.52, 498.7],
    ]
    const same = (got: readonly { x: number; y: number }[], want: [number, number][]) => {
      expect(got).toHaveLength(want.length)
      got.forEach((p, i) => {
        expect(p.x, `x of point ${i}`).toBeCloseTo(want[i]![0], 2)
        expect(p.y, `y of point ${i}`).toBeCloseTo(want[i]![1], 2)
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
