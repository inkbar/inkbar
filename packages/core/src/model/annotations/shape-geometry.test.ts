import { describe, expect, it } from 'vitest'

import { freeTextBox } from './callout'
import {
  constrain,
  DEFAULT_SHAPE_OPTIONS,
  defaultEnds,
  isPointerOnlyKind,
  polygonVertices,
  SHAPE_KINDS,
  shapeInput,
  starVertices,
} from './shape-geometry'

const rect = { x: 100, y: 200, width: 80, height: 40 }

describe('starVertices', () => {
  it('returns 2 * points vertices, the first at the top centre', () => {
    const v = starVertices(rect, 5)
    expect(v).toHaveLength(10)
    expect(v[0]!.x).toBeCloseTo(140)
    expect(v[0]!.y).toBeCloseTo(240)
  })

  it('puts the inner vertices at the ratio of the outer ones', () => {
    const square = { x: 0, y: 0, width: 100, height: 100 }
    const v = starVertices(square, 4, 0.25)
    // Second vertex: 45 degrees round, inner radius 0.25 * 50.
    expect(v[1]!.x).toBeCloseTo(50 + 12.5 * Math.SQRT1_2)
    expect(v[1]!.y).toBeCloseTo(50 + 12.5 * Math.SQRT1_2)
  })
})

describe('polygonVertices', () => {
  it('returns the sides, the first at the top centre', () => {
    const v = polygonVertices(rect, 6)
    expect(v).toHaveLength(6)
    expect(v[0]).toEqual({ x: 140, y: 240 })
  })
})

describe('star and polygon bounds', () => {
  const bounds = (v: { x: number; y: number }[]) => {
    const xs = v.map((p) => p.x)
    const ys = v.map((p) => p.y)
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    }
  }

  it.each([
    ['5-point star', () => starVertices(rect, 5)],
    ['8-point star', () => starVertices(rect, 8)],
    ['triangle', () => polygonVertices(rect, 3)],
    ['pentagon', () => polygonVertices(rect, 5)],
    ['hexagon', () => polygonVertices(rect, 6)],
  ])('fill the box: %s', (_, make) => {
    const b = bounds(make())
    expect(b.x).toBeCloseTo(rect.x)
    expect(b.y).toBeCloseTo(rect.y)
    expect(b.width).toBeCloseTo(rect.width)
    expect(b.height).toBeCloseTo(rect.height)
  })

  it('collapse onto the centre line of a flat box', () => {
    const flat = { x: 0, y: 10, width: 50, height: 0 }
    for (const p of polygonVertices(flat, 5)) expect(p.y).toBe(10)
  })
})

describe('constrain', () => {
  it('squares a box kind', () => {
    expect(constrain('rectangle', { x: 0, y: 0 }, { x: 10, y: 4 })).toEqual({
      x: 10,
      y: 10,
    })
    expect(constrain('ellipse', { x: 5, y: 5 }, { x: 2, y: 20 })).toEqual({
      x: -10,
      y: 20,
    })
  })

  it('snaps a line to the nearest 45 degrees', () => {
    expect(constrain('line', { x: 0, y: 0 }, { x: 10, y: 1 })).toEqual({ x: 10, y: 0 })
    expect(constrain('arrow', { x: 0, y: 0 }, { x: 1, y: -10 })).toEqual({ x: 0, y: -10 })
    const d = constrain('line', { x: 0, y: 0 }, { x: 10, y: 8 })
    expect(d.x).toBeCloseTo(d.y)
  })
})

describe('defaultEnds', () => {
  const at = { x: 100, y: 200 }

  it('runs a line left to right on screen for each page rotation', () => {
    expect(defaultEnds('line', at)).toEqual([
      { x: 64, y: 200 },
      { x: 136, y: 200 },
    ])
    // /Rotate 90 turns the page clockwise: user space up is screen right.
    expect(defaultEnds('arrow', at, 90)).toEqual([
      { x: 100, y: 164 },
      { x: 100, y: 236 },
    ])
    expect(defaultEnds('line', at, 180)).toEqual([
      { x: 136, y: 200 },
      { x: 64, y: 200 },
    ])
    expect(defaultEnds('line', at, 270)).toEqual([
      { x: 100, y: 236 },
      { x: 100, y: 164 },
    ])
  })

  it('leaves box kinds as a square round the point', () => {
    expect(defaultEnds('rectangle', at, 90)).toEqual([
      { x: 64, y: 164 },
      { x: 136, y: 236 },
    ])
  })
})

describe('shapeInput', () => {
  const a = { x: 10, y: 20 }
  const b = { x: 50, y: 80 }
  const make = (kind: Parameters<typeof shapeInput>[0]) =>
    shapeInput(kind, 2, a, b, DEFAULT_SHAPE_OPTIONS)

  // The line style menu's ends come from the shape style when the tool styles the input.
  it('makes a line with no line endings of its own', () => {
    expect(make('line')).toEqual({ type: 'line', page: 2, start: a, end: b })
  })

  it('makes an arrow a line with the arrow intent', () => {
    expect(make('arrow')).toEqual({
      type: 'line',
      page: 2,
      start: a,
      end: b,
      intent: 'LineArrow',
    })
  })

  it('maps the box kinds', () => {
    const box = { x: 10, y: 20, width: 40, height: 60 }
    expect(make('rectangle')).toEqual({ type: 'square', page: 2, rect: box })
    expect(make('roundedRectangle')).toEqual({
      type: 'square',
      page: 2,
      rect: box,
      cornerRadius: 8,
    })
    expect(make('ellipse')).toEqual({ type: 'circle', page: 2, rect: box })
  })

  it('maps star and polygon to polygon vertices from the options', () => {
    expect(make('star')).toMatchObject({ type: 'polygon' })
    expect((make('star') as { vertices: unknown[] }).vertices).toHaveLength(10)
    expect((make('polygon') as { vertices: unknown[] }).vertices).toHaveLength(6)
  })

  it('maps a bubble to a standard callout: the dragged box as text box, the tail below and left', () => {
    const box = { x: 10, y: 20, width: 40, height: 60 }
    const bubble = make('bubble')
    if (bubble?.type !== 'freetext') throw new Error('not free text')
    expect(bubble).toMatchObject({
      type: 'freetext',
      page: 2,
      contents: '',
      intent: 'FreeTextCallout',
      cornerRadius: 8,
      width: 1,
      // The tip is 24 pt below and left of the edge point, the box's bottom-left quarter point.
      callout: [
        { x: -4, y: -4 },
        { x: 20, y: 20 },
      ],
    })
    expect(bubble).not.toHaveProperty('head')
    const [tip, edge] = bubble.callout!
    // The edge point lies on the box's bottom edge.
    expect(edge!.y).toBe(box.y)
    expect(edge!.x).toBeGreaterThan(box.x)
    expect(edge!.x).toBeLessThan(box.x + box.width)
    expect(freeTextBox({ rect: bubble.rect!, fringe: bubble.fringe })).toEqual(box)
    // The rect holds the tip, padded by half the 1 pt stroke.
    expect(bubble.rect).toEqual({ x: -4.5, y: -4.5, width: 55, height: 85 })
    expect(bubble.rect!.x).toBeLessThan(tip!.x)
    expect(bubble.rect!.y).toBeLessThan(tip!.y)
  })

  it('offers the bubble between the ellipse and the star', () => {
    expect(SHAPE_KINDS.indexOf('bubble')).toBe(SHAPE_KINDS.indexOf('ellipse') + 1)
  })

  it('makes a loupe a square on the drag, sized by its longer side, at 2x', () => {
    // b is 40 right and 60 up of a: the square takes the 60 and keeps the drag's direction.
    expect(make('loupe')).toEqual({
      type: 'loupe',
      page: 2,
      rect: { x: 10, y: 20, width: 60, height: 60 },
      magnification: 2,
    })
    expect(shapeInput('loupe', 0, b, a, DEFAULT_SHAPE_OPTIONS)).toMatchObject({
      rect: { x: -10, y: 20, width: 60, height: 60 },
    })
  })

  it('offers the loupe after the polygon', () => {
    expect(SHAPE_KINDS.indexOf('loupe')).toBe(SHAPE_KINDS.indexOf('polygon') + 1)
  })

  it('makes a mask a rect on the drag, and an oval mask an ellipse, both dimming by half', () => {
    expect(make('mask')).toEqual({
      type: 'mask',
      page: 2,
      rect: { x: 10, y: 20, width: 40, height: 60 },
      shape: 'rect',
      dim: 0.5,
    })
    expect(make('ovalMask')).toEqual({
      type: 'mask',
      page: 2,
      rect: { x: 10, y: 20, width: 40, height: 60 },
      shape: 'ellipse',
      dim: 0.5,
    })
  })

  it('offers the mask and the oval mask after the loupe', () => {
    expect(SHAPE_KINDS.indexOf('mask')).toBe(SHAPE_KINDS.indexOf('loupe') + 1)
    expect(SHAPE_KINDS.indexOf('ovalMask')).toBe(SHAPE_KINDS.indexOf('mask') + 1)
  })
})

describe('isPointerOnlyKind', () => {
  it('is true for the loupe and the mask only, which Enter does not place', () => {
    expect(isPointerOnlyKind('loupe')).toBe(true)
    expect(isPointerOnlyKind('mask')).toBe(true)
    expect(isPointerOnlyKind('ovalMask')).toBe(true)
    expect(isPointerOnlyKind('rectangle')).toBe(false)
    expect(isPointerOnlyKind('bubble')).toBe(false)
  })
})
