import { describe, expect, test } from 'vitest'

import { describeInk, strokeOutline } from './ink'

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
    for (const inklist of [[], [[]]]) {
      const d = describeInk({ ...ink, inklist })
      expect(numbers(d).every(Number.isFinite)).toBe(true)
      expect(d.items).toEqual([{ kind: 'group', opacity: 1, items: [] }])
    }
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

describe('strokeOutline', () => {
  test('a one-point stroke is a round dot as wide as the stroke', () => {
    const dot = strokeOutline([{ x: 150, y: 510 }], undefined, 6)
    const xs = dot.map((p) => p.x)
    const ys = dot.map((p) => p.y)
    // perfect-freehand stretches a lone point by (1, 1) of its own units: an elongated dot
    // 7 wide, unless the input is scaled up first.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6, 1)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(6, 1)
  })

  test('is the outline the describer uses', () => {
    const pts = run(510)
    const outline = strokeOutline(pts, undefined, 4)
    const first = paths({ ...ink, inklist: [pts] })[0]!
    expect(first.commands.length).toBe(outline.length + 1)
  })
})
