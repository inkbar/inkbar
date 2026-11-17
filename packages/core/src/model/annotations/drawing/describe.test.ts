import { describe, expect, test } from 'vitest'

import { staticDefaults } from '../defaults'
import { createAnnotationStore } from '../store'

import { describeAnnotation, paintedByCanvas } from './describe'
import { standardMeasure } from './text/measure'

import type { Annotation, AnnotationInput } from '../types'
import type { DrawContext } from './types'

const context: DrawContext = {
  page: { box: { x: 0, y: 0, width: 612, height: 792 }, rotate: 0, userUnit: 1 },
  measure: standardMeasure,
}

const quad = {
  p1: { x: 72, y: 715 },
  p2: { x: 300, y: 715 },
  p3: { x: 72, y: 695 },
  p4: { x: 300, y: 695 },
}
const rect = { x: 100, y: 600, width: 80, height: 60 }
const at = { page: 0 } as const
const line = [
  { x: 100, y: 600 },
  { x: 160, y: 630 },
  { x: 220, y: 600 },
]

/** One annotation of every type that is drawn. */
const drawn: AnnotationInput[] = [
  { type: 'highlight', ...at, quads: [quad] },
  { type: 'underline', ...at, quads: [quad] },
  { type: 'strikeout', ...at, quads: [quad] },
  { type: 'squiggly', ...at, quads: [quad] },
  { type: 'redact', ...at, rect },
  { type: 'text', ...at, rect: { ...rect, width: 20, height: 20 } },
  { type: 'freetext', ...at, rect, contents: 'Box' },
  { type: 'square', ...at, rect },
  { type: 'circle', ...at, rect },
  { type: 'line', ...at, start: line[0]!, end: line[2]!, width: 1 },
  { type: 'polyline', ...at, vertices: line },
  { type: 'polygon', ...at, vertices: line },
  { type: 'ink', ...at, inklist: [line] },
  {
    type: 'stamp',
    ...at,
    rect,
    imagedata:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  },
  { type: 'loupe', ...at, rect },
  { type: 'mask', ...at, rect, shape: 'rect' },
]

const store = () =>
  createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })

describe('describeAnnotation', () => {
  for (const input of drawn) {
    test(`a ${input.type} has a drawing`, () => {
      const a = store().add(input)
      const d = describeAnnotation(a, context)
      expect(d).toBeDefined()
      expect(d!.items.length).toBeGreaterThan(0)
    })
  }

  test('a mask belongs to the page and every other type to the annotation', () => {
    const layers = drawn.map((input) => [
      input.type,
      describeAnnotation(store().add(input), context)!.layer,
    ])
    expect(layers.filter(([, layer]) => layer === 'page')).toEqual([['mask', 'page']])
  })

  test('an annotation embedded in the file has none: the page canvas paints it', () => {
    const a: Annotation = { ...store().add(drawn[0]!), source: 'pdf' }
    expect(describeAnnotation(a, context)).toBeUndefined()
    expect(paintedByCanvas(a)).toBe(true)
  })

  test('an embedded note with no appearance is drawn, as the canvas paints none', () => {
    const note = store().add(drawn.find((i) => i.type === 'text')!)
    if (note.type !== 'text') throw new Error('not a note')
    const embedded: Annotation = { ...note, source: 'pdf', hasAppearance: false }
    expect(paintedByCanvas(embedded)).toBe(false)
    expect(describeAnnotation(embedded, context)).toBeDefined()
    expect(
      describeAnnotation({ ...embedded, hasAppearance: true }, context)
    ).toBeUndefined()
  })
})
