import { describe, expect, test } from 'vitest'

import { describeMask } from './mask'

import type { MaskAnnotation } from '../types'
import type { DrawContext } from './types'

const mask: MaskAnnotation = {
  id: 'a',
  page: 0,
  type: 'mask',
  color: '#000000',
  opacity: 1,
  createdAt: '2026-10-19T12:00:00.000Z',
  modifiedAt: '2026-10-19T12:00:00.000Z',
  source: 'session',
  rect: { x: 100, y: 500, width: 200, height: 100 },
  shape: 'rect',
  dim: 0.5,
}

const context = (box = { x: 0, y: 0, width: 612, height: 792 }): DrawContext => ({
  page: { box, rotate: 0, userUnit: 1 },
  measure: {
    width: () => ({ width: 0, outside: false }),
    vertical: () => ({ ascent: 0, descent: 0 }),
  },
})

const ops = (d: ReturnType<typeof describeMask>) => {
  const item = d.items[0]
  if (item?.kind !== 'path') throw new Error('not a path')
  return item
}

describe('describeMask', () => {
  test('a shape reaching past the page is inside the bounds', () => {
    const d = describeMask(
      { ...mask, rect: { x: -40, y: 700, width: 200, height: 150 } },
      context()
    )
    expect(d.bounds).toEqual({ x: -40, y: 0, width: 652, height: 850 })
  })

  test('a mask is the page box with the shape cut out', () => {
    const d = describeMask(mask, context())
    expect(d.layer).toBe('page')
    expect(d.bounds).toEqual({ x: 0, y: 0, width: 612, height: 792 })
    expect(d.items).toHaveLength(1)
    const path = ops(d)
    expect(path.role).toBe('mask')
    expect(path.fillRule).toBe('evenodd')
    expect(path.paint).toEqual({ fill: { color: '#000000', opacity: 0.5 } })
    expect(path.commands.map((c) => c.op)).toEqual([
      'M',
      'L',
      'L',
      'L',
      'Z',
      'M',
      'L',
      'L',
      'L',
      'Z',
    ])
    expect(path.commands[2]).toEqual({ op: 'L', to: { x: 612, y: 792 } })
    expect(path.commands[5]).toEqual({ op: 'M', to: { x: 100, y: 500 } })
    expect(path.commands[7]).toEqual({ op: 'L', to: { x: 300, y: 600 } })
  })

  test('the dim, not the opacity, sets how strongly it covers', () => {
    const path = ops(describeMask({ ...mask, opacity: 0.2, dim: 0.7 }, context()))
    expect(path.paint.fill).toEqual({ color: '#000000', opacity: 0.7 })
  })

  test('a mask on a page whose box starts at (20, 30) covers that box', () => {
    const path = ops(
      describeMask(mask, context({ x: 20, y: 30, width: 612, height: 792 }))
    )
    expect(path.commands[0]).toEqual({ op: 'M', to: { x: 20, y: 30 } })
    expect(path.commands[2]).toEqual({ op: 'L', to: { x: 632, y: 822 } })
  })

  test('an elliptical mask cuts its ellipse with arcs', () => {
    const path = ops(describeMask({ ...mask, shape: 'ellipse' }, context()))
    expect(path.commands.slice(5)).toEqual([
      { op: 'M', to: { x: 100, y: 550 } },
      { op: 'A', rx: 100, ry: 50, largeArc: true, sweep: true, to: { x: 300, y: 550 } },
      { op: 'A', rx: 100, ry: 50, largeArc: true, sweep: true, to: { x: 100, y: 550 } },
      { op: 'Z' },
    ])
  })
})
