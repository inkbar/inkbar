import { describe, expect, test } from 'vitest'

import { oneOfEveryType } from '../../../test-support/annotations'
import { staticDefaults } from '../defaults'
import { createAnnotationStore } from '../store'

import { describeAnnotation, describeDrawing, paintedByCanvas } from './describe'
import { standardMeasure } from './text/measure'

import type { Annotation } from '../types'
import type { DrawContext } from './types'

const context: DrawContext = {
  page: { box: { x: 0, y: 0, width: 612, height: 792 }, rotate: 0, userUnit: 1 },
  measure: standardMeasure,
}

/** One annotation of every type that is drawn. */
const drawn = oneOfEveryType()

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
    // A draft or copy of it is still drawn.
    expect(describeDrawing(a, context)).toBeDefined()
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
