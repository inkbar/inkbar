import { describe, expect, it } from 'vitest'

import { recogniseStroke, RECOGNISE_THRESHOLD } from './recognise'
import { curve, FIXTURES, roughen, trace } from './recognise.fixtures'

import type { Point } from './geometry'

const fixture = (name: string): Point[] => {
  const points = FIXTURES[name]
  if (!points) throw new Error(`no fixture ${name}`)
  return points
}

const near = (p: Point | undefined, q: Point, within = 6) => {
  expect(p).toBeDefined()
  expect(Math.hypot(p!.x - q.x, p!.y - q.y)).toBeLessThanOrEqual(within)
}

describe('recogniseStroke', () => {
  it.each([
    ['wobbly line', 'line'],
    ['line with a hook at the end', 'arrow'],
    ['arrow with both barbs', 'arrow'],
    ['arrow drawn head first', 'arrow'],
    ['rough box', 'rectangle'],
    ['rough circle', 'ellipse'],
    ['flat ellipse', 'ellipse'],
    ['triangle', 'polygon'],
    ['five-point star', 'star'],
    ['pentagram', 'star'],
  ])('%s → %s', (name, kind) => {
    const r = recogniseStroke(fixture(name))
    expect(r?.shape.kind).toBe(kind)
    expect(r!.score).toBeGreaterThanOrEqual(RECOGNISE_THRESHOLD)
  })

  it.each(['signature scrawl', 'zigzag', 'spiral', 'scribble'])(
    '%s is not recognised',
    (name) => {
      const r = recogniseStroke(fixture(name))
      expect(!r || r.score < RECOGNISE_THRESHOLD).toBe(true)
    }
  )

  it('a clear arc is not a line', () => {
    const r = recogniseStroke(fixture('arc'))
    expect(!r || r.score < RECOGNISE_THRESHOLD).toBe(true)
  })

  it('returns undefined for too few points or no extent', () => {
    expect(recogniseStroke([])).toBeUndefined()
    expect(recogniseStroke([{ x: 1, y: 1 }])).toBeUndefined()
    expect(
      recogniseStroke([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ])
    ).toBeUndefined()
  })

  it('a line runs between the stroke ends', () => {
    const r = recogniseStroke(fixture('wobbly line'))
    if (r?.shape.kind !== 'line') throw new Error('not a line')
    near(r.shape.start, { x: 100, y: 100 })
    near(r.shape.end, { x: 300, y: 160 })
  })

  it('an arrow ends at the tip its head is drawn on', () => {
    const hook = recogniseStroke(fixture('line with a hook at the end'))
    if (hook?.shape.kind !== 'arrow') throw new Error('not an arrow')
    near(hook.shape.start, { x: 100, y: 300 })
    near(hook.shape.end, { x: 300, y: 320 })
    const first = recogniseStroke(fixture('arrow drawn head first'))
    if (first?.shape.kind !== 'arrow') throw new Error('not an arrow')
    near(first.shape.start, { x: 300, y: 400 })
    near(first.shape.end, { x: 100, y: 400 })
  })

  it('a box and a circle fill the box the stroke spans', () => {
    const box = recogniseStroke(fixture('rough box'))
    if (box?.shape.kind !== 'rectangle') throw new Error('not a rectangle')
    near({ x: box.shape.rect.x, y: box.shape.rect.y }, { x: 100, y: 101 })
    near({ x: box.shape.rect.width, y: box.shape.rect.height }, { x: 161, y: 118 })
    const circle = recogniseStroke(fixture('rough circle'))
    if (circle?.shape.kind !== 'ellipse') throw new Error('not an ellipse')
    near({ x: circle.shape.rect.x, y: circle.shape.rect.y }, { x: 140, y: 140 })
    near({ x: circle.shape.rect.width, y: circle.shape.rect.height }, { x: 120, y: 120 })
  })

  it('a triangle keeps its three corners; a star gets a regular outline', () => {
    const tri = recogniseStroke(fixture('triangle'))
    if (tri?.shape.kind !== 'polygon') throw new Error('not a polygon')
    expect(tri.shape.vertices).toHaveLength(3)
    for (const corner of [
      { x: 100, y: 100 },
      { x: 260, y: 110 },
      { x: 170, y: 240 },
    ])
      expect(
        tri.shape.vertices.some((v) => Math.hypot(v.x - corner.x, v.y - corner.y) < 8)
      ).toBe(true)
    for (const name of ['five-point star', 'pentagram']) {
      const star = recogniseStroke(fixture(name))
      if (star?.shape.kind !== 'star') throw new Error(`${name}: not a star`)
      expect(star.shape.vertices).toHaveLength(10)
    }
  })

  // A sweep over seeds: casual shapes stay recognised and scrawls stay ink, whatever the noise.
  const seeds = Array.from({ length: 40 }, (_, i) => 100 + i)
  it.each([
    [
      'line',
      (s: number) =>
        roughen(
          trace([
            { x: 50, y: 80 },
            { x: 50 + 70 + (s % 7) * 25, y: 80 + (s % 5) * 25 },
          ]),
          s,
          { wobble: 2 }
        ),
    ],
    [
      'rectangle',
      (s: number) =>
        roughen(
          trace([
            { x: 100, y: 100 },
            { x: 180 + (s % 6) * 15, y: 98 },
            { x: 182 + (s % 6) * 15, y: 160 + (s % 4) * 20 },
            { x: 101, y: 162 + (s % 4) * 20 },
            { x: 99, y: 104 },
          ]),
          s,
          { wobble: 2 }
        ),
    ],
    [
      'ellipse',
      (s: number) =>
        roughen(
          curve(
            (t) => ({
              x: 200 + (40 + (s % 5) * 15) * Math.cos(t),
              y: 200 + 50 * Math.sin(t),
            }),
            s,
            s + Math.PI * 2 * (0.95 + (s % 4) * 0.04),
            100
          ),
          s
        ),
    ],
  ])('a casual %s is recognised across 40 seeds', (kind, make) => {
    const misses = seeds.filter((s) => {
      const r = recogniseStroke(make(s))
      return r?.shape.kind !== kind || r.score < RECOGNISE_THRESHOLD
    })
    expect(misses).toEqual([])
  })

  it('cursive scrawls and scribbles are never shapes across 40 seeds', () => {
    const hits = seeds.flatMap((s) => {
      const scrawl = roughen(
        curve(
          (t) => {
            const d = 10 + (s % 5) * 3 + 6 * Math.sin(t * 0.6 + s)
            return { x: 100 + 7 * t - d * Math.sin(t), y: 200 - d * Math.cos(t) }
          },
          0,
          Math.PI * (4 + (s % 6)),
          240
        ),
        s
      )
      return [scrawl]
        .map((points) => recogniseStroke(points))
        .filter((r) => r !== undefined && r.score >= RECOGNISE_THRESHOLD)
        .map((r) => `${s}: ${r!.shape.kind}`)
    })
    expect(hits).toEqual([])
  })
})
