import { describe, expect, test } from 'vitest'

import { describeMarkup, describeRedact } from './markup'

import type { DrawItem, Drawing } from './types'
import type { RedactAnnotation, TextMarkupAnnotation } from '../types'

const base = {
  id: 'a',
  page: 0,
  color: '#F2C230',
  createdAt: '2026-10-19T12:00:00.000Z',
  modifiedAt: '2026-10-19T12:00:00.000Z',
  source: 'session',
} as const

const quad = {
  p1: { x: 100, y: 700 },
  p2: { x: 200, y: 700 },
  p3: { x: 100, y: 686 },
  p4: { x: 200, y: 686 },
}

const highlight: TextMarkupAnnotation = {
  ...base,
  type: 'highlight',
  rect: { x: 100, y: 686, width: 100, height: 14 },
  opacity: 0.4,
  quads: [quad],
}

const redact: RedactAnnotation = {
  ...base,
  type: 'redact',
  rect: { x: 100, y: 686, width: 100, height: 14 },
  opacity: 1,
  color: '#FF0000',
  interiorColor: '#000000',
  quads: [quad],
}

/** The one group a line markup is described as. */
function group(d: Drawing): Extract<DrawItem, { kind: 'group' }> {
  const [g] = d.items
  if (g?.kind !== 'group') throw new Error('expected one group')
  return g
}

/** The points of a polyline item. */
function pointsOf(item: DrawItem | undefined): { x: number; y: number }[] {
  if (item?.kind !== 'polyline') throw new Error('expected a polyline')
  return [...item.points]
}

/** Every number anywhere in `value` is finite. */
function finite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(finite)
  if (value && typeof value === 'object') return Object.values(value).every(finite)
  return true
}

describe('describeMarkup', () => {
  test('a highlight is one polygon per quad with its own fill opacity', () => {
    expect(describeMarkup(highlight)).toEqual({
      layer: 'annotation',
      bounds: { x: 100, y: 686, width: 100, height: 14 },
      items: [
        {
          kind: 'polygon',
          points: [
            { x: 100, y: 700 },
            { x: 200, y: 700 },
            { x: 200, y: 686 },
            { x: 100, y: 686 },
          ],
          paint: { fill: { color: '#F2C230', opacity: 0.4 } },
        },
      ],
    })
  })

  test('overlapping highlight quads stay separate polygons', () => {
    const shifted = {
      p1: { x: 150, y: 700 },
      p2: { x: 250, y: 700 },
      p3: { x: 150, y: 686 },
      p4: { x: 250, y: 686 },
    }
    const d = describeMarkup({ ...highlight, quads: [quad, shifted] })
    expect(d.items).toHaveLength(2)
    expect(d.bounds).toEqual({ x: 100, y: 686, width: 150, height: 14 })
  })

  test('an underline sits a tenth of the height above the bottom edge, one point thick', () => {
    const d = describeMarkup({ ...highlight, type: 'underline', opacity: 1 })
    expect(d.items).toHaveLength(1)
    const [line] = group(d).items
    expect(group(d).opacity).toBe(1)
    expect(line).toMatchObject({
      kind: 'polyline',
      paint: { stroke: { color: '#F2C230', width: 1 } },
    })
    const points = pointsOf(line)
    expect(points).toHaveLength(2)
    expect(points[0]!.x).toBe(100)
    expect(points[0]!.y).toBeCloseTo(687.4, 9)
    expect(points[1]!.x).toBe(200)
    expect(points[1]!.y).toBeCloseTo(687.4, 9)
  })

  test('the group carries the annotation opacity', () => {
    const d = describeMarkup({ ...highlight, type: 'underline', opacity: 0.5 })
    expect(group(d).opacity).toBe(0.5)
  })

  test('a strikeout runs through the middle', () => {
    const [line] = group(describeMarkup({ ...highlight, type: 'strikeout' })).items
    expect(line).toMatchObject({
      kind: 'polyline',
      points: [
        { x: 100, y: 693 },
        { x: 200, y: 693 },
      ],
    })
  })

  test('a squiggle alternates below and above the baseline', () => {
    const [line] = group(describeMarkup({ ...highlight, type: 'squiggly' })).items
    const points = pointsOf(line)
    // Amplitude 14 / 16 = 0.875, step 1.75, round(100 / 1.75) = 57 steps.
    expect(points).toHaveLength(58)
    expect(points[0]!.x).toBe(100)
    expect(points[0]!.y).toBeCloseTo(687.4 - 0.875, 9)
    expect(points[1]!.y).toBeCloseTo(687.4 + 0.875, 9)
    expect(points[2]!.y).toBeCloseTo(687.4 - 0.875, 9)
    expect(points[57]!.x).toBeCloseTo(200, 9)
    expect(points[57]!.y).toBeCloseTo(687.4 + 0.875, 9)
  })

  test('the stroke is at least half a point', () => {
    const flat = {
      p1: { x: 0, y: 4 },
      p2: { x: 50, y: 4 },
      p3: { x: 0, y: 0 },
      p4: { x: 50, y: 0 },
    }
    const [line] = group(
      describeMarkup({ ...highlight, type: 'underline', quads: [flat] })
    ).items
    expect(line).toMatchObject({ paint: { stroke: { width: 0.5 } } })
  })

  test('a quad of zero height describes without NaN', () => {
    const flat = {
      p1: { x: 100, y: 700 },
      p2: { x: 200, y: 700 },
      p3: { x: 100, y: 700 },
      p4: { x: 200, y: 700 },
    }
    for (const type of ['highlight', 'underline', 'strikeout', 'squiggly'] as const) {
      expect(finite(describeMarkup({ ...highlight, type, quads: [flat] }))).toBe(true)
    }
  })
})

describe('describeMarkup on a tilted quad', () => {
  // A 100 x 14 quad turned 30 degrees about its lower-left corner (100, 686).
  const c = Math.cos(Math.PI / 6)
  const sn = Math.sin(Math.PI / 6)
  const at = (x: number, y: number): { x: number; y: number } => ({
    x: 100 + x * c - y * sn,
    y: 686 + x * sn + y * c,
  })
  const tilted = { p1: at(0, 14), p2: at(100, 14), p3: at(0, 0), p4: at(100, 0) }
  const along = { x: c, y: sn }
  const normal = { x: -sn, y: c }
  const ann: TextMarkupAnnotation = { ...highlight, quads: [tilted] }

  test('an underline runs along the bottom edge, a tenth of the height up', () => {
    const [line] = group(describeMarkup({ ...ann, type: 'underline' })).items
    const [a, b] = pointsOf(line)
    const start = at(0, 1.4)
    const end = at(100, 1.4)
    expect(a!.x).toBeCloseTo(start.x, 9)
    expect(a!.y).toBeCloseTo(start.y, 9)
    expect(b!.x).toBeCloseTo(end.x, 9)
    expect(b!.y).toBeCloseTo(end.y, 9)
  })

  test('a strikeout joins the midpoints of the side edges', () => {
    const [line] = group(describeMarkup({ ...ann, type: 'strikeout' })).items
    const [a, b] = pointsOf(line)
    expect(a!.x).toBeCloseTo(at(0, 7).x, 9)
    expect(a!.y).toBeCloseTo(at(0, 7).y, 9)
    expect(b!.x).toBeCloseTo(at(100, 7).x, 9)
    expect(b!.y).toBeCloseTo(at(100, 7).y, 9)
  })

  test('a squiggle is offset from the baseline along the unit normal', () => {
    const [line] = group(describeMarkup({ ...ann, type: 'squiggly' })).items
    const points = pointsOf(line)
    const origin = at(0, 1.4)
    points.forEach((p, i) => {
      const dx = p.x - origin.x
      const dy = p.y - origin.y
      // Distance along the baseline grows evenly; the offset across it is plus or minus 0.875.
      expect(dx * along.x + dy * along.y).toBeCloseTo((100 * i) / (points.length - 1), 9)
      expect(dx * normal.x + dy * normal.y).toBeCloseTo(i % 2 === 0 ? -0.875 : 0.875, 9)
    })
  })

  test('a skewed quad keeps each corner and takes its height from the left edge', () => {
    const skewed = {
      p1: { x: 130, y: 700 },
      p2: { x: 230, y: 700 },
      p3: { x: 100, y: 686 },
      p4: { x: 200, y: 686 },
    }
    const d = describeMarkup({ ...highlight, quads: [skewed] })
    expect(d.items[0]).toMatchObject({
      points: [skewed.p1, skewed.p2, skewed.p4, skewed.p3],
    })
    const [line] = group(
      describeMarkup({ ...highlight, type: 'underline', quads: [skewed] })
    ).items
    const [a, b] = pointsOf(line)
    expect(a!.x).toBeCloseTo(103, 9)
    expect(a!.y).toBeCloseTo(687.4, 9)
    expect(b!.x).toBeCloseTo(203, 9)
    expect(b!.y).toBeCloseTo(687.4, 9)
  })
})

describe('describeRedact', () => {
  test('a redaction mark is tinted at 15% with a one-point outline', () => {
    expect(describeRedact(redact)).toEqual({
      layer: 'annotation',
      bounds: { x: 100, y: 686, width: 100, height: 14 },
      items: [
        {
          kind: 'group',
          opacity: 1,
          items: [
            {
              kind: 'polygon',
              points: [
                { x: 100, y: 700 },
                { x: 200, y: 700 },
                { x: 200, y: 686 },
                { x: 100, y: 686 },
              ],
              paint: {
                fill: { color: '#000000', opacity: 0.15 },
                stroke: { color: '#FF0000', width: 1 },
              },
            },
          ],
        },
      ],
    })
  })

  test('an area mark is a rect', () => {
    const { quads: _quads, ...area } = redact
    const d = describeRedact({ ...area, rect: { x: 10, y: 20, width: 30, height: 40 } })
    expect(d.bounds).toEqual({ x: 10, y: 20, width: 30, height: 40 })
    expect(group(d).items).toEqual([
      {
        kind: 'rect',
        rect: { x: 10, y: 20, width: 30, height: 40 },
        paint: {
          fill: { color: '#000000', opacity: 0.15 },
          stroke: { color: '#FF0000', width: 1 },
        },
      },
    ])
  })

  test('the group carries the annotation opacity', () => {
    expect(group(describeRedact({ ...redact, opacity: 0.5 })).opacity).toBe(0.5)
  })
})
