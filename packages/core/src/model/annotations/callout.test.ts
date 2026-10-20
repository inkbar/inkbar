import { describe, expect, it } from 'vitest'

import sample from './__fixtures__/standard-callout.json'
import {
  calloutStroke,
  freeTextBox,
  isStandardCallout,
  withCalloutBounds,
} from './callout'
import { staticDefaults } from './defaults'
import { createAnnotationStore } from './store'
import { AnnotationSchema, type FreeTextAnnotation } from './types'

const store = () =>
  createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })

const freeText = (fields: Partial<FreeTextAnnotation> = {}): FreeTextAnnotation => {
  const a = store().add({
    type: 'freetext',
    page: 0,
    contents: 'Hi',
    rect: { x: 10, y: 20, width: 100, height: 50 },
    ...fields,
  })
  if (a.type !== 'freetext') throw new Error('expected free text')
  return a
}

describe('freeTextBox', () => {
  it('is the rect without a fringe', () => {
    const a = freeText()
    expect(freeTextBox(a)).toBe(a.rect)
  })

  it('insets the rect by the fringe', () => {
    const a = freeText({ fringe: { left: 1, top: 2, right: 3, bottom: 4 } })
    expect(freeTextBox(a)).toEqual({ x: 11, y: 24, width: 96, height: 44 })
  })

  it('clamps a fringe larger than the rect to width and height 0 at the inset origin', () => {
    const a = freeText({ fringe: { left: 80, top: 30, right: 40, bottom: 30 } })
    expect(freeTextBox(a)).toEqual({ x: 90, y: 50, width: 0, height: 0 })
  })
})

describe('withCalloutBounds', () => {
  const box = { x: 100, y: 100, width: 200, height: 50 }
  const callout = [
    { x: 50, y: 40 },
    { x: 150, y: 100 },
  ]

  it('holds the box and every callout point, and its fringe gives the box back', () => {
    const { rect, fringe } = withCalloutBounds(box, callout, 1, 'OpenArrow')
    for (const p of [
      ...callout,
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
    ]) {
      expect(p.x).toBeGreaterThanOrEqual(rect.x)
      expect(p.y).toBeGreaterThanOrEqual(rect.y)
      expect(p.x).toBeLessThanOrEqual(rect.x + rect.width)
      expect(p.y).toBeLessThanOrEqual(rect.y + rect.height)
    }
    expect(freeTextBox({ rect, fringe })).toEqual(box)
  })

  it('pads by half the stroke, plus the ending size for a drawn head', () => {
    expect(withCalloutBounds(box, callout, 2, undefined).rect).toEqual({
      x: 49,
      y: 39,
      width: 252,
      height: 112,
    })
    // A drawn head adds 3 strokes (at least 3 pt).
    expect(withCalloutBounds(box, callout, 2, 'OpenArrow').rect.x).toBe(43)
    expect(withCalloutBounds(box, callout, 0.5, 'Circle').rect.x).toBe(46.75)
    // `None` and names Inkbar does not draw add nothing.
    expect(withCalloutBounds(box, callout, 2, 'None').rect.x).toBe(49)
    expect(withCalloutBounds(box, callout, 2, 'Draft_1').rect.x).toBe(49)
  })
})

describe('calloutStroke', () => {
  it('takes the border colour and width', () => {
    const a = freeText({ borderColor: '#00FF00', width: 2 })
    expect(calloutStroke(a)).toEqual({ color: '#00FF00', width: 2 })
  })

  it('falls back to the text colour and 1 pt', () => {
    const a = freeText({ width: 0 })
    a.defaultStyle = { ...a.defaultStyle, color: '#D00000' }
    expect(calloutStroke(a)).toEqual({ color: '#D00000', width: 1 })
  })
})

describe('isStandardCallout', () => {
  const callout = [
    { x: 0, y: 0 },
    { x: 10, y: 20 },
  ]

  it('is a free-text callout with two or more points and no corner radius', () => {
    expect(isStandardCallout(freeText({ intent: 'FreeTextCallout', callout }))).toBe(true)
  })

  it('is not a speech bubble, a box without a leader or another intent', () => {
    expect(
      isStandardCallout(freeText({ intent: 'FreeTextCallout', callout, cornerRadius: 4 }))
    ).toBe(false)
    expect(isStandardCallout(freeText({ intent: 'FreeTextCallout' }))).toBe(false)
    expect(isStandardCallout(freeText({ callout }))).toBe(false)
  })
})

describe('the standard-callout sample', () => {
  it('parses, and its fringe gives the box', () => {
    const a = AnnotationSchema.parse({
      ...sample.annotations[0],
      source: 'session',
    })
    expect(isStandardCallout(a)).toBe(true)
    if (a.type !== 'freetext') throw new Error('expected free text')
    expect(freeTextBox(a)).toEqual({ x: 100, y: 600, width: 180, height: 60 })
    expect(a.head).toBe('OpenArrow')
    const { width } = calloutStroke(a)
    expect(withCalloutBounds(freeTextBox(a), a.callout!, width, a.head)).toEqual({
      rect: a.rect,
      fringe: a.fringe,
    })
  })
})
