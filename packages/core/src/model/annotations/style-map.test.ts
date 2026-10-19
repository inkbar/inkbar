import { describe, expect, it } from 'vitest'

import { fromAnnotation, styleGroupOf, supportedProps, toFields } from './style-map'

import type { Annotation } from './types'

const base = {
  id: 'a',
  page: 0,
  rect: { x: 0, y: 0, width: 10, height: 10 },
  color: '#C0392B',
  opacity: 1,
  createdAt: '2026-10-19T12:00:00.000Z',
  modifiedAt: '2026-10-19T12:00:00.000Z',
  source: 'session',
} as const

describe('toFields', () => {
  it('maps border to color on shapes, lines and ink', () => {
    expect(toFields('square', { border: '#FF0000' })).toEqual({ color: '#FF0000' })
    expect(toFields('line', { border: '#FF0000' })).toEqual({ color: '#FF0000' })
    expect(toFields('ink', { border: '#FF0000' })).toEqual({ color: '#FF0000' })
  })

  it('maps fill null to a deletion marker on shapes', () => {
    expect(toFields('circle', { fill: null })).toEqual({ interiorColor: undefined })
    expect(toFields('polygon', { fill: '#00FF00' })).toEqual({ interiorColor: '#00FF00' })
  })

  it('drops props a type does not have', () => {
    expect(toFields('highlight', { width: 3, head: 'openArrow' })).toEqual({})
    expect(toFields('square', { head: 'openArrow', tail: 'circle' })).toEqual({})
    expect(toFields('polyline', { fill: '#00FF00' })).toEqual({})
  })

  it('maps dashes on shapes, lines, polylines and ink, and head and tail on polylines', () => {
    for (const t of ['square', 'circle', 'line', 'polyline', 'polygon', 'ink'] as const)
      expect(toFields(t, { dashes: [3, 3] })).toEqual({ dashes: [3, 3] })
    expect(toFields('square', { dashes: null })).toEqual({ dashes: undefined })
    expect(toFields('polyline', { head: 'openArrow', tail: 'none' })).toEqual({
      head: 'openArrow',
      tail: 'none',
    })
    expect(toFields('polygon', { head: 'openArrow' })).toEqual({})
    expect(toFields('highlight', { dashes: [3, 3] })).toEqual({})
  })

  it('maps border to color on markup and redact', () => {
    expect(toFields('underline', { border: '#123456' })).toEqual({ color: '#123456' })
    expect(toFields('redact', { border: '#123456' })).toEqual({ color: '#123456' })
  })

  it('maps width, head and tail on lines', () => {
    expect(toFields('line', { width: 3, head: 'openArrow', tail: 'circle' })).toEqual({
      width: 3,
      head: 'openArrow',
      tail: 'circle',
    })
  })
})

describe('supportedProps', () => {
  it('reports supported props', () => {
    expect(supportedProps('line').has('head')).toBe(true)
    expect(supportedProps('square').has('head')).toBe(false)
    expect(supportedProps('square').has('fill')).toBe(true)
    expect(supportedProps('highlight').has('width')).toBe(false)
  })
})

describe('styleGroupOf', () => {
  it('puts each type in its group', () => {
    const of = (type: string) => styleGroupOf({ ...base, type } as unknown as Annotation)
    expect(of('square')).toBe('shape')
    expect(of('polyline')).toBe('shape')
    expect(of('ink')).toBe('ink')
    expect(of('squiggly')).toBe('markup')
    expect(of('redact')).toBe('redact')
    expect(of('text')).toBeUndefined()
  })
})

describe('fromAnnotation', () => {
  it('reads control-level props back from fields', () => {
    const square: Annotation = {
      ...base,
      type: 'square',
      width: 2,
      interiorColor: '#00FF00',
    }
    expect(fromAnnotation(square)).toEqual({
      border: '#C0392B',
      fill: '#00FF00',
      opacity: 1,
      width: 2,
      dashes: null,
    })
    expect(fromAnnotation({ ...square, dashes: [3, 3] }).dashes).toEqual([3, 3])
    const unfilled: Annotation = { ...base, type: 'circle', width: 1 }
    expect(fromAnnotation(unfilled).fill).toBeNull()
    const line: Annotation = {
      ...base,
      type: 'line',
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
      width: 1,
      tail: 'openArrow',
    }
    expect(fromAnnotation(line)).toMatchObject({ head: 'none', tail: 'openArrow' })
  })
})
