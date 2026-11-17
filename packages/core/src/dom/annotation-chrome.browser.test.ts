// What the overlay adds around a drawing so a press lands on it: the twin and bands that take
// presses, the comment marker, and the shapes whose size depends on the zoom.
import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { staticDefaults } from '../model/annotations/defaults'
import { createAnnotationStore } from '../model/annotations/store'

import { annotationBox, renderAnnotationContent } from './overlay-render'
import { mountContainer } from './test-utils'
import { createPageTransform } from './transform'

import type { Annotation, AnnotationInput } from '../model/annotations/types'
import type { PageInfo } from '../model/pages'

const letter = (rotate: 0 | 90 = 0): PageInfo => ({
  index: 0,
  box: { x: 0, y: 0, width: 612, height: 792 },
  rotate,
  userUnit: 1,
  width: 612,
  height: 792,
})

const add = (input: AnnotationInput): Annotation =>
  createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults }).add(
    input
  )

const cleanup: (() => void)[] = []
beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = themeCss
  document.head.append(style)
})
afterEach(() => {
  for (const f of cleanup.splice(0)) f()
})

const wave = (n: number, x0: number, y0: number) =>
  Array.from({ length: n }, (_, i) => ({ x: x0 + i * 4, y: y0 + Math.sin(i / 4) * 24 }))

describe('a one-point ink stroke', () => {
  // A lone point is a round dot of the stroke's width at every zoom, not a capsule along the
  // screen diagonal.
  for (const zoom of [0.5, 1, 2, 4] as const) {
    it(`is a round dot of the stroke's width, on its point, at zoom ${zoom}`, () => {
      const t = createPageTransform(letter(), zoom, 0)
      const at = { x: 150, y: 600 }
      const a = add({
        type: 'ink',
        page: 0,
        rect: { x: 90, y: 540, width: 260, height: 100 },
        width: 6,
        inklist: [[at]],
      })
      const host = mountContainer(612 * zoom, 792 * zoom)
      cleanup.push(() => host.remove())
      const el = document.createElement('div')
      host.append(el)
      renderAnnotationContent(el, a, t)
      const box = el.querySelector('path.ink-stroke')!.getBoundingClientRect()
      const origin = host.getBoundingClientRect()
      const c = t.toCss(at)
      expect(Math.abs(box.width - box.height)).toBeLessThan(0.5)
      expect(Math.abs(box.width - 6 * zoom)).toBeLessThan(0.5)
      // The overlay element sits at its box in the page; here it sits at the host's corner.
      const e = annotationBox(a, t)
      expect(
        Math.abs(box.left - origin.left + box.width / 2 + e.left - c.x)
      ).toBeLessThan(0.5)
      expect(Math.abs(box.top - origin.top + box.height / 2 + e.top - c.y)).toBeLessThan(
        0.5
      )
    })
  }
})

describe('a one-point ink stroke is filled as a circle', () => {
  for (const zoom of [1, 3] as const) {
    it(`covers the diagonals out to its radius and no further, at zoom ${zoom}`, () => {
      const t = createPageTransform(letter(), zoom, 0)
      const at = { x: 150, y: 600 }
      const a = add({
        type: 'ink',
        page: 0,
        rect: { x: 90, y: 540, width: 260, height: 100 },
        width: 10,
        inklist: [[at]],
      })
      const host = mountContainer(612 * zoom, 792 * zoom)
      cleanup.push(() => host.remove())
      const el = document.createElement('div')
      host.append(el)
      renderAnnotationContent(el, a, t)
      const path = el.querySelector<SVGPathElement>('path.ink-stroke')!
      const e = annotationBox(a, t)
      const c = t.toCss(at)
      const centre = { x: c.x - e.left, y: c.y - e.top }
      const radius = 5 * zoom
      // On each diagonal: just inside the radius is filled, just outside is not. A capsule along
      // the screen diagonal would fill past the radius on one of them.
      const d = 1 / Math.SQRT2
      for (const [sx, sy] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const) {
        for (const [reach, filled] of [
          [0.9, true],
          [1.15, false],
        ] as const) {
          const point = new DOMPoint(
            centre.x + sx * d * radius * reach,
            centre.y + sy * d * radius * reach
          )
          expect(path.isPointInFill(point), `${sx},${sy} at ${reach} of the radius`).toBe(
            filled
          )
        }
      }
    })
  }
})

describe('the size of a line ending', () => {
  /** The extent of an ending's path across the line, in CSS px, for a horizontal line. */
  const height = (el: Element): number => {
    const ys = (el.getAttribute('d') ?? '')
      .match(/-?\d+(?:\.\d+)? -?\d+(?:\.\d+)?/g)!
      .map((pair) => Number(pair.split(' ')[1]))
    return Math.max(...ys) - Math.min(...ys)
  }

  it('is sized from one point for a line thinner than one, not from one screen pixel', () => {
    const a = add({
      type: 'line',
      page: 0,
      rect: { x: 90, y: 590, width: 140, height: 40 },
      start: { x: 100, y: 600 },
      end: { x: 220, y: 600 },
      width: 0.5,
      tail: 'OpenArrow',
    })
    const painted = document.createElement('div')
    renderAnnotationContent(painted, a, createPageTransform(letter(), 0.5, 0))
    // One point at zoom 0.5 is 0.5 px, and the ending is three times that tall.
    expect(height(painted.querySelector('[data-ending="tail"]')!)).toBeCloseTo(1.5, 3)
  })
})

describe("the size of a callout's head", () => {
  it('is the same in points at every zoom, so it grows with the page on screen', () => {
    const a = add({
      type: 'freetext',
      page: 0,
      rect: { x: 120, y: 590, width: 100, height: 40 },
      contents: 'Hi',
      intent: 'FreeTextCallout',
      callout: [
        { x: 60, y: 600 },
        { x: 120, y: 600 },
      ],
      head: 'OpenArrow',
      width: 2,
    })
    const across = (zoom: number): number => {
      const painted = document.createElement('div')
      renderAnnotationContent(painted, a, createPageTransform(letter(), zoom, 0))
      const ys = (painted.querySelector('[data-ending="head"]')!.getAttribute('d') ?? '')
        .match(/-?\d+(?:\.\d+)? -?\d+(?:\.\d+)?/g)!
        .map((pair) => Number(pair.split(' ')[1]))
      return Math.max(...ys) - Math.min(...ys)
    }
    // Three times the 2 pt stroke across, at one pixel a point and at two.
    expect(across(1)).toBeCloseTo(6, 3)
    expect(across(2)).toBeCloseTo(12, 3)
    expect(across(0.5)).toBeCloseTo(3, 3)
  })
})

describe('what takes a press on a painted annotation', () => {
  const at = { page: 0, rect: { x: 100, y: 600, width: 80, height: 40 } } as const
  const markup = { page: 0, rect: { x: 72, y: 695, width: 228, height: 20 } } as const
  const quads = [
    {
      p1: { x: 72, y: 715 },
      p2: { x: 300, y: 715 },
      p3: { x: 72, y: 695 },
      p4: { x: 300, y: 695 },
    },
  ]
  const lineRect = { x: 90, y: 590, width: 140, height: 40 }
  const vertices = [
    { x: 100, y: 600 },
    { x: 160, y: 630 },
    { x: 220, y: 600 },
  ]
  /** [name, annotation, hit twins it must have]. */
  const cases: [string, AnnotationInput, number][] = [
    ['a stroke-only square', { type: 'square', ...at, width: 2 }, 1],
    ['a stroke-only circle', { type: 'circle', ...at, width: 2 }, 1],
    ['a filled square', { type: 'square', ...at, width: 2, interiorColor: '#7FB3D5' }, 0],
    [
      'a line with both endings',
      {
        type: 'line',
        page: 0,
        rect: lineRect,
        start: { x: 100, y: 600 },
        end: { x: 220, y: 620 },
        width: 2,
        head: 'Circle',
        tail: 'OpenArrow',
      },
      3,
    ],
    [
      'a dashed polyline with an ending',
      {
        type: 'polyline',
        page: 0,
        rect: lineRect,
        vertices,
        width: 3,
        dashes: [6, 3],
        tail: 'Slash',
      },
      2,
    ],
    [
      'a stroke-only polygon',
      { type: 'polygon', page: 0, rect: lineRect, vertices, width: 2 },
      1,
    ],
    [
      'a filled polygon',
      {
        type: 'polygon',
        page: 0,
        rect: lineRect,
        vertices,
        width: 2,
        interiorColor: '#7FB3D5',
      },
      0,
    ],
    ['a highlight', { type: 'highlight', ...markup, quads }, 0],
  ]
  for (const [name, input, twins] of cases) {
    for (const [rotate, view] of [
      [0, 0],
      [0, 90],
      [90, 0],
      [90, 90],
    ] as const) {
      it(`${name} has ${twins} hit twin${twins === 1 ? '' : 's'} at page rotate ${rotate} and view rotate ${view}`, () => {
        const a = add(input)
        const el = document.createElement('div')
        renderAnnotationContent(el, a, createPageTransform(letter(rotate), 2, view))
        expect(el.querySelectorAll('[data-ink-hit-stroke]')).toHaveLength(twins)
        for (const twin of el.querySelectorAll('[data-ink-hit-stroke]')) {
          expect(twin.getAttribute('stroke')).toBe('transparent')
          expect(twin.getAttribute('pointer-events')).toBe('stroke')
        }
      })
    }
  }

  it('commented text markup gets its comment marker, and plain markup does not', () => {
    const t = createPageTransform(letter(), 2, 0)
    const commented = document.createElement('div')
    renderAnnotationContent(
      commented,
      add({ type: 'highlight', ...markup, quads, contents: 'Check this' }),
      t
    )
    expect(commented.querySelectorAll('.ink-comment-marker')).toHaveLength(1)
    const plain = document.createElement('div')
    renderAnnotationContent(plain, add({ type: 'highlight', ...markup, quads }), t)
    expect(plain.querySelector('.ink-comment-marker')).toBeNull()
  })

  for (const [rotate, view] of [
    [0, 0],
    [90, 90],
  ] as const) {
    it(`ink with two strokes has a stroke and a hit twin for each at page rotate ${rotate} and view rotate ${view}, and an empty stroke draws an empty path`, () => {
      const a = add({
        type: 'ink',
        page: 0,
        rect: { x: 90, y: 540, width: 260, height: 100 },
        width: 3,
        opacity: 0.7,
        inklist: [wave(30, 100, 600), wave(20, 110, 560)],
      })
      const el = document.createElement('div')
      const t = createPageTransform(letter(rotate), 2, view)
      renderAnnotationContent(el, a, t)
      expect(el.querySelectorAll('path.ink-stroke')).toHaveLength(2)
      expect(el.querySelectorAll('[data-ink-hit-stroke]')).toHaveLength(2)
      expect(el.querySelector('svg')!.getAttribute('opacity')).toBe('0.7')
      // The schema refuses an empty stroke, but an annotation can still arrive with one.
      if (a.type !== 'ink') throw new Error('not ink')
      const odd = document.createElement('div')
      renderAnnotationContent(odd, { ...a, inklist: [[], ...a.inklist] }, t)
      expect(odd.querySelectorAll('path.ink-stroke')).toHaveLength(3)
      expect(odd.querySelectorAll('path.ink-stroke')[0]!.getAttribute('d')).toBe('')
    })
  }
})

describe('the press areas of loupes and masks', () => {
  const t = createPageTransform(letter(), 2, 0)
  const rect = { x: 100, y: 600, width: 80, height: 80 }

  /** Whether each point (CSS px into an element sized like `a`) lands on something inside it. */
  function hits(
    a: Annotation,
    points: readonly (readonly [number, number])[]
  ): boolean[] {
    const box = annotationBox(a, t)
    const host = document.createElement('div')
    host.style.cssText = 'position:absolute;left:0;top:0;'
    const el = document.createElement('div')
    el.className = 'ink-annotation'
    el.dataset.annotation = a.id
    el.dataset.type = a.type
    el.style.cssText = `position:absolute;pointer-events:none;left:0;top:0;width:${box.width}px;height:${box.height}px;`
    host.append(el)
    document.body.append(host)
    cleanup.push(() => host.remove())
    renderAnnotationContent(el, a, t)
    return points.map(([x, y]) => {
      const target = document.elementFromPoint(x, y)
      return target !== null && el.contains(target) && target !== el
    })
  }

  it('a loupe is a rim, then a transparent circle over the lens that takes the presses', () => {
    const a = add({ type: 'loupe', page: 0, rect, width: 2, opacity: 0.7 })
    const painted = document.createElement('div')
    renderAnnotationContent(painted, a, t)
    const svg = painted.querySelector('svg')!
    expect(svg.getAttribute('opacity')).toBe('0.7')
    const [rim, hit, ...rest] = [...svg.children]
    expect(rest).toHaveLength(0)
    expect(rim!.tagName).toBe('circle')
    expect(rim!.classList.contains('ink-loupe-rim')).toBe(true)
    expect(rim!.getAttribute('fill')).toBe('none')
    expect(rim!.getAttribute('stroke-width')).toBe('4')
    expect(rim!.getAttribute('r')).toBe('78')
    expect(hit!.tagName).toBe('circle')
    expect(hit!.getAttribute('r')).toBe('80')
    expect(hit!.getAttribute('fill')).toBe('transparent')
    expect(hit!.getAttribute('pointer-events')).toBe('all')
    expect(hit!.classList.contains('ink-loupe-rim')).toBe(false)

    const box = annotationBox(a, t)
    expect(
      hits(a, [
        [box.width / 2, box.height / 2],
        [box.width / 2, 3],
        [box.width / 2, box.height - 3],
        [2, 2],
        [box.width - 2, box.height - 2],
      ])
    ).toEqual([true, true, true, false, false])
  })

  it('a 200 x 100 loupe takes presses at its centre and not at its corners', () => {
    const a = add({
      type: 'loupe',
      page: 0,
      rect: { x: 100, y: 600, width: 200, height: 100 },
      width: 2,
    })
    const box = annotationBox(a, t)
    expect(
      hits(a, [
        [box.width / 2, box.height / 2],
        [2, 2],
        [box.width - 2, box.height - 2],
      ])
    ).toEqual([true, false, false])
  })

  it('a loupe with no border draws no rim and still takes presses on its lens', () => {
    const a = add({ type: 'loupe', page: 0, rect, width: 0 })
    const painted = document.createElement('div')
    renderAnnotationContent(painted, a, t)
    expect(painted.querySelector('.ink-loupe-rim')).toBeNull()
    const hit = painted.querySelector('circle[data-ink-hit-area]')!
    expect(hit.getAttribute('pointer-events')).toBe('all')
    expect(hit.getAttribute('r')).toBe('80')
    const box = annotationBox(a, t)
    expect(
      hits(a, [
        [box.width / 2, box.height / 2],
        [2, 2],
      ])
    ).toEqual([true, false])
  })

  for (const shape of ['rect', 'ellipse'] as const) {
    it(`a ${shape} mask is an svg with only its edge band, and a press on the edge selects it`, () => {
      const a = add({
        type: 'mask',
        page: 0,
        rect: { x: 100, y: 500, width: 200, height: 100 },
        shape,
      })
      const painted = document.createElement('div')
      renderAnnotationContent(painted, a, t)
      // The page's layer draws the dimming; nothing in the element does.
      expect(painted.querySelectorAll('svg')).toHaveLength(1)
      expect(painted.querySelector('svg')!.children).toHaveLength(1)
      expect(painted.querySelector('path')).toBeNull()
      const box = annotationBox(a, t)
      const got = hits(a, [
        [3, box.height / 2],
        [box.width / 2, 3],
        [box.width - 3, box.height / 2],
        [box.width / 2, box.height / 2],
        [box.width / 2, box.height / 2 + 30],
        [10, 10],
        [20, 20],
      ])
      expect(got.slice(0, 3)).toEqual([true, true, true])
      // Inside the cut-out does not select the mask.
      expect(got[3]).toBe(false)
      expect(got[4]).toBe(false)
      expect(got[6]).toBe(false)
    })
  }
})
