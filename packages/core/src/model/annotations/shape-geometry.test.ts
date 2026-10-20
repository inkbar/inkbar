import { describe, expect, it } from 'vitest'

import {
  constrain,
  DEFAULT_SHAPE_OPTIONS,
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
  it('returns the sides on the inscribed ellipse, the first at the top centre', () => {
    const v = polygonVertices(rect, 6)
    expect(v).toHaveLength(6)
    expect(v[0]).toEqual({ x: 140, y: 240 })
    for (const p of v)
      expect(((p.x - 140) / 40) ** 2 + ((p.y - 220) / 20) ** 2).toBeCloseTo(1)
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

describe('shapeInput', () => {
  const a = { x: 10, y: 20 }
  const b = { x: 50, y: 80 }
  const make = (kind: Parameters<typeof shapeInput>[0]) =>
    shapeInput(kind, 2, a, b, DEFAULT_SHAPE_OPTIONS)

  // The shape style keeps the ends an arrow was given; a plain line must not pick them up.
  it('makes a line with no line endings, whatever the shape style holds', () => {
    expect(make('line')).toEqual({
      type: 'line',
      page: 2,
      start: a,
      end: b,
      head: 'none',
      tail: 'none',
    })
  })

  it('makes an arrow a line with an open tail and the arrow intent', () => {
    expect(make('arrow')).toMatchObject({
      type: 'line',
      page: 2,
      start: a,
      end: b,
      tail: 'openArrow',
      intent: 'lineArrow',
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

  it('maps a bubble to a callout free-text box with its tail below and left of the box', () => {
    expect(make('bubble')).toEqual({
      type: 'freetext',
      page: 2,
      contents: '',
      intent: 'freeTextCallout',
      cornerRadius: 8,
      width: 1,
      rect: { x: 10, y: 20, width: 40, height: 60 },
      // The knee is the bottom-left quarter point; the tip is 24 pt below and left of it.
      callout: [
        { x: -4, y: -4 },
        { x: 20, y: 20 },
      ],
    })
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
