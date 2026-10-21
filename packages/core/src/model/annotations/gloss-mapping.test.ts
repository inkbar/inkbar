import { describe, expect, it } from 'vitest'

import { staticDefaults } from './defaults'
import { fromFile, toFile } from './gloss-mapping'
import { createAnnotationStore } from './store'

import type { Annotation, AnnotationInput, ExportedAnnotation } from './types'

const rect = { x: 100, y: 500, width: 72, height: 72 }

/** Adds `input` to a fresh store and returns it as an export carries it: no viewer state. */
function exported(input: AnnotationInput): ExportedAnnotation {
  const s = createAnnotationStore({
    mode: { mode: 'uncontrolled' },
    defaults: staticDefaults,
  })
  const { source: _source, locked: _locked, ...rest }: Annotation = s.add(input)
  return rest
}

/** `toFile` then `fromFile`, through JSON as a file would go. */
const roundTrip = (a: ExportedAnnotation) =>
  fromFile(JSON.parse(JSON.stringify(toFile(a))) as Record<string, unknown>)

const inklist = [
  [
    { x: 1, y: 1 },
    { x: 9, y: 4 },
  ],
  [{ x: 20, y: 20 }],
]

describe('gloss mapping', () => {
  it('writes ink pressure under custom.inkbar', () => {
    const pressure = [[0.2, 0.9], [0.5]]
    const ink = exported({ type: 'ink', page: 0, inklist, pressure })
    const file = toFile(ink) as Record<string, unknown>
    expect(file).not.toHaveProperty('pressure')
    expect(file.custom).toEqual({ inkbar: { pressure } })
    expect(roundTrip(ink)).toEqual(ink)
  })

  it('writes a free-text border colour under custom.inkbar', () => {
    const box = exported({
      type: 'freetext',
      page: 0,
      rect,
      contents: 'x',
      borderColor: '#FF0000',
    })
    const file = toFile(box) as Record<string, unknown>
    expect(file).not.toHaveProperty('borderColor')
    expect(file.custom).toEqual({ inkbar: { borderColor: '#FF0000' } })
    expect(roundTrip(box)).toEqual(box)
  })

  it('writes a loupe as a circle', () => {
    const loupe = exported({ type: 'loupe', page: 0, rect, magnification: 3 })
    const file = toFile(loupe) as Record<string, unknown>
    expect(file.type).toBe('circle')
    expect(file.width).toBe(2)
    expect(file.custom).toEqual({ inkbar: { type: 'loupe', magnification: 3 } })
    expect(file).not.toHaveProperty('magnification')
    expect(roundTrip(loupe)).toEqual(loupe)
  })

  it('writes masks as circles or squares', () => {
    for (const [shape, type] of [
      ['ellipse', 'circle'],
      ['rect', 'square'],
    ] as const) {
      const mask = exported({ type: 'mask', page: 0, rect, shape, dim: 0.7 })
      const file = toFile(mask) as Record<string, unknown>
      expect(file.type).toBe(type)
      expect(file.color).toBe(mask.color)
      expect(file.custom).toEqual({ inkbar: { type: 'mask', dim: 0.7 } })
      expect(file).not.toHaveProperty('shape')
      expect(file).not.toHaveProperty('dim')
      expect(roundTrip(mask)).toEqual(mask)
    }
  })

  it("keeps a host's custom keys next to inkbar's own", () => {
    const custom = { case: 7, inkbar: { note: 'x' } }
    const ink = exported({
      type: 'ink',
      page: 0,
      inklist,
      pressure: [[0.2, 0.9], [0.5]],
      custom,
    })
    expect((toFile(ink) as Record<string, unknown>).custom).toEqual({
      case: 7,
      inkbar: { note: 'x', pressure: [[0.2, 0.9], [0.5]] },
    })
    expect(roundTrip(ink)).toEqual(ink)
    expect(roundTrip(ink).custom).toEqual(custom)
  })

  it('leaves a circle with an unknown inkbar kind as a circle', () => {
    const circle = exported({
      type: 'circle',
      page: 0,
      rect,
      custom: { inkbar: { type: 'sticker' } },
    })
    expect(toFile(circle)).toEqual(circle)
    expect(roundTrip(circle)).toEqual(circle)
  })

  it('leaves a square marked as a loupe as a square', () => {
    const square = exported({
      type: 'square',
      page: 0,
      rect,
      custom: { inkbar: { type: 'loupe', magnification: 3 } },
    })
    expect(roundTrip(square)).toEqual(square)
  })
})
