import { describe, expect, test } from 'vitest'

import { describeLine, endingItem } from './lines'

import type { LineAnnotation, PolyAnnotation } from '../types'

const O = { x: 0, y: 0 }
const E = { x: 10, y: 0 }

const base = {
  id: 'a',
  page: 0,
  color: '#C0392B',
  opacity: 1,
  createdAt: '2026-10-19T12:00:00.000Z',
  modifiedAt: '2026-10-19T12:00:00.000Z',
  source: 'session',
  rect: { x: 0, y: 0, width: 10, height: 0 },
  width: 2,
} as const

const line: LineAnnotation = {
  ...base,
  type: 'line',
  start: { x: 100, y: 600 },
  end: { x: 200, y: 600 },
}

/** Every number in `v`, however deep. */
function numbers(v: unknown): number[] {
  if (typeof v === 'number') return [v]
  if (Array.isArray(v)) return v.flatMap(numbers)
  if (v && typeof v === 'object') return Object.values(v).flatMap(numbers)
  return []
}

const noNaN = (v: unknown): void => {
  const all = numbers(v)
  expect(all.length).toBeGreaterThan(0)
  expect(all.every(Number.isFinite)).toBe(true)
}

describe('endingItem', () => {
  test('an open arrow at the end of a rightward 2pt line', () => {
    expect(endingItem('OpenArrow', E, O, 2, '#000000', 'ending-tail')).toEqual({
      kind: 'path',
      role: 'ending-tail',
      commands: [
        { op: 'M', to: { x: 4, y: 3 } },
        { op: 'L', to: { x: 10, y: 0 } },
        { op: 'L', to: { x: 4, y: -3 } },
      ],
      paint: { stroke: { color: '#000000', width: 2, join: 'round', cap: 'round' } },
    })
  })

  test('a closed arrow is the same shape, closed and filled', () => {
    const open = endingItem('OpenArrow', E, O, 2, '#000000', 'ending-tail')
    const closed = endingItem('ClosedArrow', E, O, 2, '#000000', 'ending-head')
    if (open?.kind !== 'path' || closed?.kind !== 'path') throw new Error('no path')
    expect(closed.commands).toEqual([...open.commands, { op: 'Z' }])
    expect(closed.role).toBe('ending-head')
    expect(closed.paint.fill).toEqual({ color: '#000000' })
  })

  test('a line thinner than one point sizes its endings as if it were one point', () => {
    const item = endingItem('OpenArrow', E, O, 0.25, '#000000', 'ending-tail')
    if (item?.kind !== 'path') throw new Error('no path')
    expect(item.commands[0]).toEqual({ op: 'M', to: { x: 7, y: 1.5 } })
    expect(item.paint.stroke?.width).toBe(0.25)
  })

  test('a circle ending is two arcs', () => {
    const item = endingItem('Circle', E, O, 2, '#000000', 'ending-tail')
    if (item?.kind !== 'path') throw new Error('no path')
    expect(item.commands.map((c) => c.op)).toEqual(['M', 'A', 'A', 'Z'])
    expect(item.commands[1]).toMatchObject({ op: 'A', rx: 3, ry: 3, to: { x: 7, y: 0 } })
    expect(item.paint.fill).toEqual({ color: '#000000' })
  })

  test('a butt or slash ending has a butt cap and no fill', () => {
    for (const kind of ['Butt', 'Slash'] as const) {
      const item = endingItem(kind, E, O, 2, '#000000', 'ending-tail')
      if (item?.kind !== 'path') throw new Error('no path')
      expect(item.paint).toEqual({
        stroke: { color: '#000000', width: 2, join: 'round', cap: 'butt' },
      })
    }
  })

  test('an unknown ending draws nothing', () => {
    expect(endingItem('Nope', E, O, 1, '#000', 'ending-head')).toBeUndefined()
    expect(endingItem('None', E, O, 1, '#000', 'ending-head')).toBeUndefined()
  })

  test('a zero-length segment draws nothing', () => {
    expect(endingItem('OpenArrow', O, O, 1, '#000', 'ending-head')).toBeUndefined()
  })
})

describe('describeLine', () => {
  test('a line is one polyline and its endings in a group that carries the opacity', () => {
    const d = describeLine({ ...line, opacity: 0.5, head: 'OpenArrow', tail: 'Circle' })
    expect(d.layer).toBe('annotation')
    expect(d.items).toHaveLength(1)
    const group = d.items[0]
    if (group?.kind !== 'group') throw new Error('no group')
    expect(group.opacity).toBe(0.5)
    expect(group.items.map((i) => i.kind)).toEqual(['polyline', 'path', 'path'])
    expect(group.items.map((i) => i.role)).toEqual([
      undefined,
      'ending-head',
      'ending-tail',
    ])
    expect(group.items[0]).toEqual({
      kind: 'polyline',
      points: [line.start, line.end],
      paint: { stroke: { color: '#C0392B', width: 2, join: 'round' } },
    })
  })

  test('the head ending sits on the first point, pointing out of the line', () => {
    const d = describeLine({ ...line, head: 'OpenArrow' })
    const group = d.items[0]
    if (group?.kind !== 'group') throw new Error('no group')
    const head = group.items[1]
    if (head?.kind !== 'path') throw new Error('no path')
    expect(head.commands[1]).toEqual({ op: 'L', to: line.start })
    expect(head.commands[0]).toEqual({ op: 'M', to: { x: 106, y: 597 } })
  })

  test('a polyline ends on its first and last segments, and keeps its dashes', () => {
    const poly: PolyAnnotation = {
      ...base,
      type: 'polyline',
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      dashes: [3, 2],
      tail: 'OpenArrow',
    }
    const group = describeLine(poly).items[0]
    if (group?.kind !== 'group') throw new Error('no group')
    expect(group.items).toHaveLength(2)
    expect(group.items[0]).toMatchObject({
      kind: 'polyline',
      paint: { stroke: { dashes: [3, 2] } },
    })
    const tail = group.items[1]
    if (tail?.kind !== 'path') throw new Error('no path')
    expect(tail.commands[1]).toEqual({ op: 'L', to: { x: 10, y: 10 } })
  })

  test('a polygon is filled with its interior colour and has no endings', () => {
    const poly: PolyAnnotation = {
      ...base,
      type: 'polygon',
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      interiorColor: '#7FB3D5',
    }
    const group = describeLine(poly).items[0]
    if (group?.kind !== 'group') throw new Error('no group')
    expect(group.items).toEqual([
      {
        kind: 'polygon',
        points: poly.vertices,
        paint: {
          fill: { color: '#7FB3D5' },
          stroke: { color: '#C0392B', width: 2, join: 'round' },
        },
      },
    ])
  })

  test('a line whose ends coincide describes without NaN', () => {
    const d = describeLine({
      ...line,
      end: line.start,
      head: 'ClosedArrow',
      tail: 'Circle',
    })
    noNaN(d)
    const group = d.items[0]
    if (group?.kind !== 'group') throw new Error('no group')
    expect(group.items).toHaveLength(1)
  })

  test('the bounds hold the points and the endings', () => {
    const plain = describeLine(line).bounds
    expect(plain).toEqual({ x: 99, y: 599, width: 102, height: 2 })
    const arrowed = describeLine({ ...line, tail: 'OpenArrow' }).bounds
    expect(arrowed).toEqual({ x: 94, y: 594, width: 112, height: 12 })
  })
})
