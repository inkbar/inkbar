import { describe, expect, test } from 'vitest'

import { describeShape } from './shapes'

import type { ShapeAnnotation } from '../types'

const base = {
  id: 'a',
  page: 0,
  color: '#C0392B',
  opacity: 1,
  createdAt: '2026-10-19T12:00:00.000Z',
  modifiedAt: '2026-10-19T12:00:00.000Z',
  source: 'session',
  rect: { x: 100, y: 600, width: 80, height: 40 },
  width: 2,
} as const

const square: ShapeAnnotation = { ...base, type: 'square' }
const circle: ShapeAnnotation = { ...base, type: 'circle' }

describe('describeShape', () => {
  test('a square is inset by half its stroke', () => {
    expect(describeShape({ ...square, cornerRadius: 6, opacity: 0.5 })).toEqual({
      layer: 'annotation',
      bounds: { x: 100, y: 600, width: 80, height: 40 },
      items: [
        {
          kind: 'group',
          opacity: 0.5,
          items: [
            {
              kind: 'rect',
              rect: { x: 101, y: 601, width: 78, height: 38 },
              radius: 6,
              paint: { stroke: { color: '#C0392B', width: 2 } },
            },
          ],
        },
      ],
    })
  })

  test('a square with no corner radius has none', () => {
    const [g] = describeShape(square).items
    expect(g).toMatchObject({ items: [{ kind: 'rect' }] })
    expect(JSON.stringify(g)).not.toContain('radius')
  })

  test('an interior colour fills and dashes travel with the stroke', () => {
    const d = describeShape({ ...square, interiorColor: '#00FF00', dashes: [3, 3] })
    expect(d.items[0]).toMatchObject({
      items: [
        {
          paint: {
            fill: { color: '#00FF00' },
            stroke: { color: '#C0392B', width: 2, dashes: [3, 3] },
          },
        },
      ],
    })
  })

  test('a circle is an ellipse inset by half its stroke', () => {
    expect(describeShape({ ...circle, interiorColor: '#00FF00' }).items).toEqual([
      {
        kind: 'group',
        opacity: 1,
        items: [
          {
            kind: 'ellipse',
            rect: { x: 101, y: 601, width: 78, height: 38 },
            paint: {
              fill: { color: '#00FF00' },
              stroke: { color: '#C0392B', width: 2 },
            },
          },
        ],
      },
    ])
  })

  test('a zero-size square describes without NaN', () => {
    for (const type of ['square', 'circle'] as const) {
      const d = describeShape({
        ...base,
        type,
        rect: { x: 100, y: 600, width: 0, height: 0 },
      })
      const [g] = d.items
      if (g?.kind !== 'group') throw new Error('expected a group')
      // A stroke of 2 on a box of nothing fills the 2 x 2 box it reaches.
      expect(g.items[0]).toMatchObject({
        rect: { x: 99, y: 599, width: 2, height: 2 },
        paint: { fill: { color: '#C0392B' } },
      })
      expect(JSON.stringify(g.items[0])).not.toContain('stroke')
      expect(JSON.stringify(d)).not.toMatch(/null|NaN/)
    }
  })

  test('a shape narrower than its stroke stays centred, and the bounds reach past the rect', () => {
    for (const type of ['square', 'circle'] as const) {
      const d = describeShape({
        ...base,
        type,
        width: 6,
        rect: { x: 100, y: 600, width: 2, height: 40 },
      })
      const [g] = d.items
      if (g?.kind !== 'group') throw new Error('expected a group')
      // Collapsed in one dimension: a filled shape over what the stroke reaches.
      expect(g.items[0], type).toMatchObject({
        kind: type === 'square' ? 'rect' : 'ellipse',
        rect: { x: 98, y: 600, width: 6, height: 40 },
        paint: { fill: { color: '#C0392B' } },
      })
      expect(JSON.stringify(g.items[0]), type).not.toContain('stroke')
      expect(d.bounds, type).toEqual({ x: 98, y: 600, width: 6, height: 40 })
    }
  })

  test('a shape is outlined as usual while the box is wider than its stroke in both dimensions', () => {
    const d = describeShape({
      ...square,
      width: 4,
      rect: { ...square.rect, width: 5, height: 5 },
    })
    const [g] = d.items
    if (g?.kind !== 'group') throw new Error('expected a group')
    expect(g.items[0]).toMatchObject({
      rect: { width: 1, height: 1 },
      paint: { stroke: { width: 4 } },
    })
  })

  test('a stroke of no width is not drawn', () => {
    const d = describeShape({ ...square, width: 0, interiorColor: '#00FF00' })
    expect(JSON.stringify(d.items)).not.toContain('stroke')
    expect(d.items[0]).toMatchObject({
      items: [{ rect: { x: 100, y: 600, width: 80, height: 40 } }],
    })
    expect(d.bounds).toEqual(square.rect)
  })

  test('a corner radius is clamped to half the shorter side of the drawn rect', () => {
    const d = describeShape({
      ...square,
      cornerRadius: 30,
      rect: { x: 100, y: 600, width: 80, height: 12 },
    })
    const [g] = d.items
    if (g?.kind !== 'group') throw new Error('expected a group')
    // The drawn rect is 78 x 10: half its shorter side is 5.
    expect(g.items[0]).toMatchObject({ kind: 'rect', radius: 5 })
  })
})
