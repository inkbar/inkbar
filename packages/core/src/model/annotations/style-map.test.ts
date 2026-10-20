import { describe, expect, it } from 'vitest'

import {
  fromAnnotation,
  styleGroupOf,
  supportedProps,
  toFields,
  typesInGroup,
} from './style-map'

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

  it('maps dashes on shapes, lines and polylines (not ink), and head and tail on polylines', () => {
    for (const t of ['square', 'circle', 'line', 'polyline', 'polygon'] as const)
      expect(toFields(t, { dashes: [3, 3] })).toEqual({ dashes: [3, 3] })
    expect(toFields('ink', { dashes: [3, 3] })).toEqual({})
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

describe('free text', () => {
  it('maps fill, border, text colour and font props to the XFDF fields', () => {
    expect(
      toFields('freetext', { fill: '#FFFF00', textColor: '#FF0000', fontWeight: 'bold' })
    ).toEqual({
      color: '#FFFF00',
      defaultStyle: { color: '#FF0000', fontWeight: 'bold' },
    })
    expect(toFields('freetext', { border: '#00FF00', width: 2, dashes: [3, 3] })).toEqual(
      {
        borderColor: '#00FF00',
        width: 2,
        dashes: [3, 3],
      }
    )
    expect(
      toFields('freetext', {
        fontFamily: 'Times',
        fontSize: 18,
        fontStyle: 'italic',
        textDecoration: 'underline',
        textAlign: 'justify',
      })
    ).toEqual({
      defaultStyle: {
        fontFamily: 'Times',
        fontSize: 18,
        fontStyle: 'italic',
        textDecoration: 'underline',
        textAlign: 'justify',
      },
    })
  })

  it('maps no fill, normal weight, normal style and no decoration to deletions', () => {
    // Strict: a deletion is a key holding undefined, which plain toEqual would not tell apart
    // from a missing key.
    expect(toFields('freetext', { fill: null, dashes: null })).toStrictEqual({
      color: undefined,
      dashes: undefined,
    })
    expect(
      toFields('freetext', {
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
      })
    ).toStrictEqual({
      defaultStyle: {
        fontWeight: undefined,
        fontStyle: undefined,
        textDecoration: undefined,
      },
    })
    expect(toFields('freetext', { head: 'openArrow', opacity: 0.5 })).toEqual({
      opacity: 0.5,
    })
  })

  it('reads the props back', () => {
    const box: Annotation = {
      ...base,
      type: 'freetext',
      contents: 'Hi',
      width: 1,
      borderColor: '#00FF00',
      defaultStyle: {
        fontFamily: 'Helvetica',
        fontSize: 12,
        color: '#FF0000',
        textAlign: 'center',
        fontWeight: 'bold',
      },
    }
    expect(fromAnnotation(box)).toEqual({
      border: '#00FF00',
      fill: '#C0392B',
      textColor: '#FF0000',
      opacity: 1,
      width: 1,
      dashes: null,
      fontFamily: 'Helvetica',
      fontSize: 12,
      fontWeight: 'bold',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'center',
    })
    const { color: _c, ...unfilled } = box as Annotation & { color?: string }
    expect(fromAnnotation(unfilled as Annotation).fill).toBeNull()
  })

  it('puts free text in the text group with its props supported', () => {
    expect(styleGroupOf({ type: 'freetext' })).toBe('text')
    for (const key of ['border', 'fill', 'textColor', 'fontSize', 'textAlign'] as const)
      expect(supportedProps('freetext').has(key), key).toBe(true)
    expect(supportedProps('freetext').has('head')).toBe(false)
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
    expect(of('stamp')).toBeUndefined()
  })

  it('lists the types in each group, from the same table', () => {
    expect(typesInGroup('ink')).toEqual(['ink'])
    expect(typesInGroup('text')).toEqual(['freetext'])
    expect(typesInGroup('shape')).toEqual([
      'square',
      'circle',
      'line',
      'polyline',
      'polygon',
      'loupe',
    ])
  })
})

describe('loupe', () => {
  const loupe = { ...base, type: 'loupe', magnification: 2, width: 2 } as const

  // The rim is a shape's outline: the border colour, its width and opacity. It has no fill
  // (the fill is the magnified page) and no dashes.
  it('is in the shape group with the rim colour, width and opacity', () => {
    expect(styleGroupOf(loupe)).toBe('shape')
    expect([...supportedProps('loupe')].sort()).toEqual(['border', 'opacity', 'width'])
    expect(toFields('loupe', { border: '#FF0000', fill: '#00FF00', width: 3 })).toEqual({
      color: '#FF0000',
      width: 3,
    })
    expect(fromAnnotation(loupe)).toEqual({ border: base.color, opacity: 1, width: 2 })
  })
})

describe('mask', () => {
  const mask = { ...base, type: 'mask', shape: 'rect', dim: 0.5 } as const

  // A mask is the page dimmed outside a shape: no outline, fill or width to style, and no
  // style group, so the style controls leave it alone.
  it('takes no style props and belongs to no group', () => {
    expect(styleGroupOf(mask)).toBeUndefined()
    expect([...supportedProps('mask')]).toEqual([])
    expect(toFields('mask', { border: '#FF0000', fill: '#00FF00', width: 3 })).toEqual({})
    expect(typesInGroup('shape')).not.toContain('mask')
  })
})

describe('stamp', () => {
  const stamp = {
    ...base,
    type: 'stamp',
    imagedata: 'data:image/png;base64,AA==',
  } as const

  // A stamp is an image, a signature among them: the style controls have nothing to change.
  it('supports no style props, so a style patch leaves it alone', () => {
    expect(supportedProps('stamp').size).toBe(0)
    expect(toFields('stamp', { border: '#FF0000', opacity: 0.5, width: 3 })).toEqual({})
    expect(fromAnnotation(stamp)).toEqual({})
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
