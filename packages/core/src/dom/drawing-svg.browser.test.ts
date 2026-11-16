import { describe, expect, it } from 'vitest'

import { staticDefaults } from '../model/annotations/defaults'
import { createAnnotationStore } from '../model/annotations/store'

import { paintDrawing } from './drawing-svg'
import { renderAnnotationContent } from './overlay-render'
import { renderReferenceContent } from './reference-render'
import { createPageTransform } from './transform'

import type { DrawItem, Drawing, Paint } from '../model/annotations/drawing/types'
import type { PageInfo } from '../model/pages'

const page: PageInfo = {
  index: 0,
  box: { x: 0, y: 0, width: 612, height: 792 },
  rotate: 0,
  userUnit: 1,
  width: 612,
  height: 792,
}
const origin = { left: 0, top: 0 }
const fill: Paint = { fill: { color: '#f00' } }

const drawing = (...items: DrawItem[]): Drawing => ({
  layer: 'annotation',
  bounds: { x: 0, y: 0, width: 612, height: 792 },
  items,
})

function paint(d: Drawing, zoom = 2, rotation: 0 | 90 = 0): HTMLElement {
  const el = document.createElement('div')
  paintDrawing(el, d, createPageTransform(page, zoom, rotation), origin)
  return el
}

describe('paintDrawing', () => {
  it('a single group puts its opacity on the svg and emits children directly', () => {
    const el = paint(
      drawing({
        kind: 'group',
        opacity: 0.5,
        items: [
          {
            kind: 'polygon',
            points: [
              { x: 100, y: 692 },
              { x: 200, y: 692 },
              { x: 200, y: 592 },
            ],
            paint: fill,
          },
        ],
      })
    )
    const svg = el.querySelector('svg')!
    expect(svg.getAttribute('opacity')).toBe('0.5')
    expect(el.querySelector('g')).toBeNull()
    expect(svg.children).toHaveLength(1)
    expect(svg.firstElementChild!.tagName).toBe('polygon')
  })

  it('a nested group becomes a g with its own opacity', () => {
    const el = paint(
      drawing(
        { kind: 'rect', rect: { x: 0, y: 0, width: 1, height: 1 }, paint: fill },
        {
          kind: 'group',
          opacity: 0.25,
          items: [
            { kind: 'rect', rect: { x: 0, y: 0, width: 1, height: 1 }, paint: fill },
          ],
        }
      )
    )
    expect(el.querySelector('svg')!.hasAttribute('opacity')).toBe(false)
    expect(el.querySelector('g')!.getAttribute('opacity')).toBe('0.25')
  })

  it('a polygon is emitted in CSS px', () => {
    const el = paint(
      drawing({
        kind: 'polygon',
        points: [
          { x: 100, y: 692 },
          { x: 200, y: 692 },
          { x: 200, y: 592 },
        ],
        paint: fill,
      })
    )
    expect(el.querySelector('polygon')!.getAttribute('points')).toBe(
      '200,200 400,200 400,400'
    )
  })

  it('subtracts the origin from every point', () => {
    const el = document.createElement('div')
    paintDrawing(
      el,
      drawing({
        kind: 'polyline',
        points: [{ x: 100, y: 692 }],
        paint: { stroke: { color: '#000', width: 1 } },
      }),
      createPageTransform(page, 2, 0),
      { left: 150, top: 50 }
    )
    expect(el.querySelector('polyline')!.getAttribute('points')).toBe('50,150')
  })

  it('stroke width and dashes scale with zoom', () => {
    const el = paint(
      drawing({
        kind: 'polyline',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        paint: { stroke: { color: '#000', width: 2, dashes: [3, 3] } },
      })
    )
    const line = el.querySelector('polyline')!
    expect(line.getAttribute('stroke-width')).toBe('4')
    expect(line.getAttribute('stroke-dasharray')).toBe('6 6')
    expect(line.getAttribute('fill')).toBe('none')
    expect(line.hasAttribute('stroke-linejoin')).toBe(false)
    expect(line.hasAttribute('stroke-linecap')).toBe(false)
  })

  it('roles become the overlay class names', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 }
    const el = paint(
      drawing(
        {
          kind: 'path',
          role: 'stroke',
          commands: [{ op: 'M', to: { x: 0, y: 0 } }],
          paint: fill,
        },
        { kind: 'path', role: 'ending-head', commands: [{ op: 'Z' }], paint: fill },
        { kind: 'path', role: 'ending-tail', commands: [{ op: 'Z' }], paint: fill },
        { kind: 'ellipse', role: 'loupe-rim', rect, paint: fill },
        { kind: 'rect', role: 'box', rect, paint: fill }
      )
    )
    expect(el.querySelector('.ink-stroke')).not.toBeNull()
    expect(el.querySelector('[data-ending="head"]')).not.toBeNull()
    expect(el.querySelector('[data-ending="tail"]')).not.toBeNull()
    const rim = el.querySelector('.ink-loupe-rim')!
    expect(rim.tagName).toBe('circle')
    expect(rim.getAttribute('r')).toBe('10')
    expect(el.querySelector('[data-ink-part="box"]')!.tagName).toBe('rect')
  })

  it('an ellipse is an ellipse, and a rect keeps its radius', () => {
    const rect = { x: 0, y: 0, width: 10, height: 20 }
    const el = paint(
      drawing(
        { kind: 'ellipse', rect, paint: fill },
        { kind: 'rect', rect, radius: 3, paint: fill }
      )
    )
    expect(el.querySelector('ellipse')!.getAttribute('rx')).toBe('10')
    expect(el.querySelector('rect')!.getAttribute('rx')).toBe('6')
  })

  const arc: DrawItem = {
    kind: 'path',
    commands: [
      { op: 'M', to: { x: 0, y: 0 } },
      { op: 'A', rx: 10, ry: 5, largeArc: false, sweep: true, to: { x: 20, y: 0 } },
    ],
    paint: fill,
  }

  it('an arc keeps its radii and flips its sweep', () => {
    expect(paint(drawing(arc)).querySelector('path')!.getAttribute('d')).toContain(
      'A20 10 0 0 0'
    )
  })

  it('at rotation 90 an arc swaps its radii', () => {
    expect(paint(drawing(arc), 2, 90).querySelector('path')!.getAttribute('d')).toContain(
      'A10 20'
    )
  })

  it('no attribute ever contains NaN', () => {
    expect(() =>
      paint(
        drawing({
          kind: 'polygon',
          points: [{ x: Number.NaN, y: 0 }],
          paint: fill,
        })
      )
    ).toThrow(RangeError)
    expect(() =>
      paint(
        drawing({
          kind: 'polygon',
          points: [{ x: Number.NaN, y: 0 }],
          paint: fill,
        })
      )
    ).toThrow(/polygon/)
  })

  it('text, image and page items are not supported yet', () => {
    const rect = { x: 0, y: 0, width: 1, height: 1 }
    expect(() => paint(drawing({ kind: 'image', data: 'x', rect, angle: 0 }))).toThrow(
      /not supported yet/
    )
  })
})

describe('renderAnnotationContent', () => {
  it('still uses the reference renderer for a type with no description', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const a = store.add({
      type: 'highlight',
      page: 0,
      rect: { x: 72, y: 695, width: 228, height: 20 },
      quads: [
        {
          p1: { x: 72, y: 715 },
          p2: { x: 300, y: 715 },
          p3: { x: 72, y: 695 },
          p4: { x: 300, y: 695 },
        },
      ],
    })
    const t = createPageTransform(page, 1, 0)
    const viaDispatch = document.createElement('div')
    const direct = document.createElement('div')
    renderAnnotationContent(viaDispatch, a, t)
    renderReferenceContent(direct, a, t)
    expect(viaDispatch.innerHTML).toBe(direct.innerHTML)
    expect(viaDispatch.querySelector('polygon')).not.toBeNull()
  })
})
