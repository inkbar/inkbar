// Where each kind of annotation lands on screen, measured in the browser against positions
// worked out here by hand from the PDF's own geometry: the page turned by /Rotate and by the
// view, scaled by zoom and /UserUnit, with a box that need not start at the origin.
import themeCss from '@inkbar/theme/theme.css?inline'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { staticDefaults } from '../model/annotations/defaults'
import { describeDrawing } from '../model/annotations/drawing/describe'
import { standardMeasure } from '../model/annotations/drawing/text/measure'
import { createAnnotationStore } from '../model/annotations/store'

import { createMaskLayer } from './mask-layer'
import { annotationBox, renderAnnotationContent } from './overlay-render'
import { createPageTransform } from './transform'

import type { PathCommand } from '../model/annotations/drawing/types'
import type {
  Annotation,
  AnnotationInput,
  MaskAnnotation,
} from '../model/annotations/types'
import type { Point, Rect } from '../model/geometry'
import type { PageInfo } from '../model/pages'

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = themeCss
  document.head.append(style)
})

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const f of cleanup.splice(0)) f()
})

interface Placement {
  name: string
  /** The page's own /Rotate. */
  rotate: 0 | 90
  /** The view's rotation, added to it. */
  view: 0 | 90 | 180 | 270
  zoom: number
  userUnit?: number
  box?: Rect
}

const PLACEMENTS: Placement[] = [
  { name: 'a page with /Rotate 90 at zoom 2', rotate: 90, view: 0, zoom: 2 },
  { name: 'a page viewed turned 90 at zoom 1', rotate: 0, view: 90, zoom: 1 },
  { name: 'a page with /UserUnit 2', rotate: 0, view: 0, zoom: 1, userUnit: 2 },
  {
    name: 'a page with /Rotate 90 viewed turned 180 at zoom 1',
    rotate: 90,
    view: 180,
    zoom: 1,
  },
  {
    name: 'a page with box (20, 30), /Rotate 90, /UserUnit 2, viewed turned 90 at zoom 0.5',
    rotate: 90,
    view: 90,
    zoom: 0.5,
    userUnit: 2,
    box: { x: 20, y: 30, width: 612, height: 792 },
  },
]

/** Where a user-space point lands, in CSS px from the page's top-left corner. */
function screen(p: Point, at: Placement): Point {
  const box = at.box ?? { x: 0, y: 0, width: 612, height: 792 }
  const s = at.zoom * (at.userUnit ?? 1)
  const dx = p.x - box.x
  const dy = p.y - box.y
  const right = box.x + box.width - p.x
  const top = box.y + box.height - p.y
  switch ((at.rotate + at.view) % 360) {
    case 0:
      return { x: dx * s, y: top * s }
    case 90:
      return { x: dy * s, y: dx * s }
    case 180:
      return { x: right * s, y: dy * s }
    default:
      return { x: top * s, y: right * s }
  }
}

const boundsOf = (points: readonly Point[]) => ({
  left: Math.min(...points.map((p) => p.x)),
  top: Math.min(...points.map((p) => p.y)),
  right: Math.max(...points.map((p) => p.x)),
  bottom: Math.max(...points.map((p) => p.y)),
})

/** What `describeDrawing` says about `a` on a page placed as `at`. */
function describedAt(a: Annotation, at: Placement) {
  return describeDrawing(a, {
    page: {
      box: at.box ?? { x: 0, y: 0, width: 612, height: 792 },
      rotate: at.rotate,
      userUnit: at.userUnit ?? 1,
    },
    measure: standardMeasure,
  })!
}

const corners = (r: Rect): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x, y: r.y + r.height },
  { x: r.x + r.width, y: r.y + r.height },
]

const quad = (x: number, y: number, width: number, height: number) => ({
  p1: { x, y: y + height },
  p2: { x: x + width, y: y + height },
  p3: { x, y },
  p4: { x: x + width, y },
})

/** One annotation drawn on a page placed as `at`, in a host the size of that page. */
function draw(input: AnnotationInput, at: Placement) {
  const info: PageInfo = {
    index: 0,
    box: at.box ?? { x: 0, y: 0, width: 612, height: 792 },
    rotate: at.rotate,
    userUnit: at.userUnit ?? 1,
    width: (at.box ?? { width: 612 }).width,
    height: (at.box ?? { height: 792 }).height,
  }
  const t = createPageTransform(info, at.zoom, at.view)
  const a = createAnnotationStore({
    mode: { mode: 'uncontrolled' },
    defaults: staticDefaults,
  }).add(input)
  const host = document.createElement('div')
  host.style.cssText = `position:absolute;left:0;top:0;width:${t.cssWidth}px;height:${t.cssHeight}px;`
  const el = document.createElement('div')
  el.className = 'ink-annotation'
  el.dataset.type = a.type
  const box = annotationBox(a, t)
  el.style.cssText = `position:absolute;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;`
  host.append(el)
  document.body.append(host)
  cleanup.push(() => host.remove())
  renderAnnotationContent(el, a, t)
  /** The union of `selector`'s elements on screen, from the host's top-left corner. */
  const onScreen = (selector: string) => {
    const found = [...el.querySelectorAll(selector)]
    expect(found.length, selector).toBeGreaterThan(0)
    const origin = host.getBoundingClientRect()
    const rects = found.map((n) => n.getBoundingClientRect())
    return {
      left: Math.min(...rects.map((r) => r.left)) - origin.left,
      top: Math.min(...rects.map((r) => r.top)) - origin.top,
      right: Math.max(...rects.map((r) => r.right)) - origin.left,
      bottom: Math.max(...rects.map((r) => r.bottom)) - origin.top,
    }
  }
  return { a, t, host, el, onScreen }
}

type Bounds = ReturnType<typeof boundsOf>

/** Whether `got` is `want` to within `tol` CSS px on every edge. */
function expectBounds(got: Bounds, want: Bounds, tol = 0.75): void {
  for (const edge of ['left', 'top', 'right', 'bottom'] as const)
    expect(Math.abs(got[edge] - want[edge]), edge).toBeLessThanOrEqual(tol)
}

/** The painted shapes, not the shapes that only take presses. */
const PAINTED = 'svg > :not([data-ink-hit-stroke]):not([data-ink-hit-area])'

const twoQuads = [quad(72, 695, 228, 20), quad(200, 695, 140, 20)]
const square = { x: 100, y: 600, width: 80, height: 40 }
const lineEnds = [
  { x: 100, y: 600 },
  { x: 220, y: 640 },
]
const triangle = [
  { x: 100, y: 600 },
  { x: 220, y: 600 },
  { x: 160, y: 640 },
]

/** What each case draws: the elements to measure and the user-space points they must span. */
interface Expectation {
  selector: string
  points: Point[]
}

interface Case {
  name: string
  input: AnnotationInput
  expect: Expectation[]
}

const FAMILIES: { family: string; cases: Case[] }[] = [
  {
    family: 'text markup',
    cases: [
      {
        name: 'a highlight of two overlapping quads',
        input: { type: 'highlight', page: 0, rect: square, quads: twoQuads },
        expect: [
          {
            selector: PAINTED,
            points: twoQuads.flatMap((q) => [q.p1, q.p2, q.p3, q.p4]),
          },
        ],
      },
      {
        name: 'a strikeout, through the middle of its quad',
        input: {
          type: 'strikeout',
          page: 0,
          rect: square,
          quads: [quad(72, 695, 228, 20)],
        },
        expect: [
          {
            selector: PAINTED,
            points: [
              { x: 72, y: 705 },
              { x: 300, y: 705 },
            ],
          },
        ],
      },
      {
        name: 'a squiggly, a wave of a point and a quarter about the underline',
        input: {
          type: 'squiggly',
          page: 0,
          rect: square,
          quads: [quad(72, 695, 228, 20)],
        },
        expect: [
          {
            selector: PAINTED,
            points: [
              { x: 72, y: 695.75 },
              { x: 300, y: 698.25 },
            ],
          },
        ],
      },
      {
        name: 'an underline, a tenth of the quad above its bottom',
        input: {
          type: 'underline',
          page: 0,
          rect: square,
          quads: [quad(72, 695, 228, 20)],
        },
        expect: [
          {
            selector: PAINTED,
            points: [
              { x: 72, y: 697 },
              { x: 300, y: 697 },
            ],
          },
        ],
      },
      {
        name: 'a redaction mark over a quad',
        input: { type: 'redact', page: 0, rect: square, quads: [quad(72, 695, 228, 20)] },
        expect: [
          {
            selector: PAINTED,
            points: corners({ x: 72, y: 695, width: 228, height: 20 }),
          },
        ],
      },
    ],
  },
  {
    family: 'shapes',
    cases: [
      {
        name: 'a redaction mark with no quads',
        input: { type: 'redact', page: 0, rect: square },
        expect: [{ selector: PAINTED, points: corners(square) }],
      },
      {
        name: 'a square, inset by half its stroke, and the band that takes its presses',
        input: { type: 'square', page: 0, rect: square, width: 2 },
        expect: [
          {
            selector: PAINTED,
            points: corners({ x: 101, y: 601, width: 78, height: 38 }),
          },
          {
            selector: '[data-ink-hit-stroke]',
            points: corners({ x: 101, y: 601, width: 78, height: 38 }),
          },
        ],
      },
      {
        name: 'a circle, inset by half its stroke',
        input: { type: 'circle', page: 0, rect: square, width: 4 },
        expect: [
          {
            selector: PAINTED,
            points: corners({ x: 102, y: 602, width: 76, height: 36 }),
          },
        ],
      },
    ],
  },
  {
    family: 'lines',
    cases: [
      {
        name: 'a line, its shaft and the band that takes its presses',
        input: {
          type: 'line',
          page: 0,
          rect: { x: 90, y: 590, width: 140, height: 60 },
          start: lineEnds[0]!,
          end: lineEnds[1]!,
          width: 2,
        },
        expect: [
          { selector: 'polyline:not([data-ink-hit-stroke])', points: lineEnds },
          { selector: 'polyline[data-ink-hit-stroke]', points: lineEnds },
        ],
      },
      {
        name: 'a polyline, its shaft and the band that takes its presses',
        input: {
          type: 'polyline',
          page: 0,
          rect: { x: 90, y: 590, width: 140, height: 60 },
          vertices: triangle,
          width: 2,
        },
        expect: [
          { selector: 'polyline:not([data-ink-hit-stroke])', points: triangle },
          { selector: 'polyline[data-ink-hit-stroke]', points: triangle },
        ],
      },
      {
        name: 'a polygon',
        input: {
          type: 'polygon',
          page: 0,
          rect: { x: 90, y: 590, width: 140, height: 60 },
          vertices: triangle,
          width: 2,
          interiorColor: '#7FB3D5',
        },
        expect: [{ selector: PAINTED, points: triangle }],
      },
    ],
  },
  {
    family: 'ink',
    cases: [], // measured by its own test below: an outline is wider than its samples
  },
  {
    family: 'stamps',
    cases: [
      {
        name: 'a stamp and the rect that takes its presses',
        input: { type: 'stamp', page: 0, rect: square, imagedata: PNG() },
        expect: [
          { selector: 'image.ink-stamp', points: corners(square) },
          { selector: 'rect[data-ink-hit-area]', points: corners(square) },
        ],
      },
      {
        name: 'a stamp placed turned a quarter',
        input: { type: 'stamp', page: 0, rect: square, imagedata: PNG(), rotation: 90 },
        expect: [{ selector: 'image.ink-stamp', points: corners(square) }],
      },
    ],
  },
  {
    family: 'notes',
    cases: [
      {
        name: 'a note: its press rect is its square and its icon stays inside it',
        input: {
          type: 'text',
          page: 0,
          rect: { x: 100, y: 600, width: 48, height: 48 },
          icon: 'Comment',
        },
        expect: [
          {
            selector: 'rect[data-ink-hit-area]',
            points: corners({ x: 100, y: 600, width: 48, height: 48 }),
          },
        ],
      },
      {
        name: 'a note with an icon that has no glyph: its square is its rect',
        input: {
          type: 'text',
          page: 0,
          rect: { x: 100, y: 600, width: 48, height: 48 },
          icon: 'Check',
        },
        expect: [
          {
            selector: 'path.ink-note-icon',
            points: corners({ x: 100, y: 600, width: 48, height: 48 }),
          },
        ],
      },
    ],
  },
  {
    family: 'loupes',
    cases: [
      {
        name: 'a loupe: its rim inset by half its stroke and a circle over its lens',
        input: {
          type: 'loupe',
          page: 0,
          rect: { x: 200, y: 500, width: 120, height: 120 },
          width: 2,
        },
        expect: [
          {
            selector: 'circle.ink-loupe-rim',
            points: corners({ x: 201, y: 501, width: 118, height: 118 }),
          },
          {
            selector: 'circle[data-ink-hit-area]',
            points: corners({ x: 200, y: 500, width: 120, height: 120 }),
          },
        ],
      },
    ],
  },
]

/** A 1 x 1 PNG. */
function PNG(): string {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
}

describe('an annotation on a turned or scaled page', () => {
  for (const { cases } of FAMILIES) {
    for (const c of cases) {
      for (const at of PLACEMENTS) {
        it(`${c.name} lands where its points map on ${at.name}`, () => {
          const drawn = draw(c.input, at)
          for (const want of c.expect)
            expectBounds(
              drawn.onScreen(want.selector),
              boundsOf(want.points.map((p) => screen(p, at)))
            )
        })
      }
    }
  }

  describe('lengths', () => {
    for (const at of PLACEMENTS) {
      it(`stroke width, dashes, corner radius and font size scale with zoom and /UserUnit on ${at.name}`, () => {
        const s = at.zoom * (at.userUnit ?? 1)
        const shape = draw(
          {
            type: 'square',
            page: 0,
            rect: square,
            width: 3,
            cornerRadius: 6,
          },
          at
        ).el.querySelector(PAINTED)!
        expect(Number(shape.getAttribute('stroke-width'))).toBeCloseTo(3 * s, 3)
        expect(Number(shape.getAttribute('rx'))).toBeCloseTo(6 * s, 3)
        // A dashed outline is a path on a turned view, so its length is read from the dashes.
        const dashed = draw(
          { type: 'square', page: 0, rect: square, width: 3, dashes: [4, 2] },
          at
        ).el.querySelector(PAINTED)!
        expect(dashed.getAttribute('stroke-dasharray')!.split(' ').map(Number)).toEqual([
          4 * s,
          2 * s,
        ])
        const rim = draw(
          {
            type: 'loupe',
            page: 0,
            rect: { x: 200, y: 500, width: 120, height: 120 },
            width: 2,
          },
          at
        ).el.querySelector('.ink-loupe-rim')!
        expect(Number(rim.getAttribute('stroke-width'))).toBeCloseTo(2 * s, 3)
        const text = draw(
          { type: 'freetext', page: 0, rect: square, contents: 'Hello' },
          at
        ).el.querySelector('text')!
        expect(parseFloat(text.getAttribute('font-size')!)).toBeCloseTo(12 * s, 2)
      })
    }
  })

  describe('a line ending', () => {
    const ENDINGS = [
      'OpenArrow',
      'ClosedArrow',
      'ROpenArrow',
      'RClosedArrow',
      'Square',
      'Diamond',
      'Circle',
      'Butt',
      'Slash',
    ] as const
    /** The user-space points an ending's path spans: its vertices, or a circle's four extremes. */
    function spanned(commands: readonly PathCommand[]): Point[] {
      const ends = commands.flatMap((c) => (c.op === 'Z' ? [] : [c.to]))
      const arc = commands.find((c) => c.op === 'A')
      if (arc?.op !== 'A') return ends
      const c = { x: (ends[0]!.x + ends[1]!.x) / 2, y: (ends[0]!.y + ends[1]!.y) / 2 }
      return [
        { x: c.x - arc.rx, y: c.y - arc.rx },
        { x: c.x + arc.rx, y: c.y + arc.rx },
      ]
    }
    for (const at of PLACEMENTS) {
      it(`sits where its points map, for every kind and for widths 2 and 4, on ${at.name}`, () => {
        for (const tail of ENDINGS) {
          for (const width of [2, 4]) {
            const input: AnnotationInput = {
              type: 'line',
              page: 0,
              rect: { x: 90, y: 590, width: 140, height: 60 },
              start: { x: 100, y: 600 },
              end: { x: 220, y: 640 },
              width,
              tail,
            }
            const drawn = draw(input, at)
            const described = describedAt(drawn.a, at)
            const group = described.items[0]
            if (group?.kind !== 'group') throw new Error('not a group')
            const ending = group.items.find((i) => i.role === 'ending-tail')
            if (ending?.kind !== 'path') throw new Error(`no ${tail} ending`)
            expectBounds(
              drawn.onScreen('[data-ending="tail"]'),
              boundsOf(spanned(ending.commands).map((p) => screen(p, at))),
              0.75
            )
          }
        }
      })
    }
  })

  describe('a note glyph', () => {
    const square = { x: 100, y: 600, width: 48, height: 48 }
    for (const at of PLACEMENTS) {
      it(`stays inside the note's square, near its middle, on ${at.name}`, () => {
        const drawn = draw({ type: 'text', page: 0, rect: square, icon: 'Comment' }, at)
        const want = boundsOf(corners(square).map((p) => screen(p, at)))
        const glyph = drawn.onScreen('[data-ink-part="note-glyph"]')
        const s = at.zoom * (at.userUnit ?? 1)
        expect(glyph.right - glyph.left).toBeGreaterThan(8 * s)
        expect(glyph.bottom - glyph.top).toBeGreaterThan(8 * s)
        for (const [edge, sign] of [
          ['left', 1],
          ['top', 1],
          ['right', -1],
          ['bottom', -1],
        ] as const)
          expect(sign * (glyph[edge] - want[edge])).toBeGreaterThanOrEqual(-0.75)
        const mid = (b: Bounds) => ({
          x: (b.left + b.right) / 2,
          y: (b.top + b.bottom) / 2,
        })
        expect(Math.abs(mid(glyph).x - mid(want).x)).toBeLessThan(12 * s)
        expect(Math.abs(mid(glyph).y - mid(want).y)).toBeLessThan(12 * s)
      })
    }
  })

  describe('arcs on a page turned a quarter or three quarters', () => {
    const turned = PLACEMENTS.filter((p) => (p.rotate + p.view) % 180 === 90)
    const bubble: AnnotationInput = {
      type: 'freetext',
      page: 0,
      rect: { x: 100, y: 470, width: 160, height: 110 },
      fringe: { left: 0, top: 0, right: 0, bottom: 30 },
      intent: 'FreeTextCallout',
      cornerRadius: 10,
      width: 2,
      color: '#FFFFFF',
      callout: [
        { x: 120, y: 470 },
        { x: 150, y: 500 },
      ],
      contents: 'Hello',
    }
    it('covers both quarter turns', () => {
      expect(new Set(turned.map((p) => (p.rotate + p.view) % 360))).toEqual(
        new Set([90, 270])
      )
    })
    for (const at of turned) {
      it(`draws a bubble's corners convex, in the arcs' flags and in what they fill, on ${at.name}`, () => {
        const drawn = draw(bubble, at)
        const path = drawn.el.querySelector<SVGPathElement>('path.ink-bubble')!
        const arcs = [...path.getAttribute('d')!.matchAll(/A(\S+) (\S+) 0 (\d) (\d) /g)]
        expect(arcs).toHaveLength(4)
        // Not large, and swept the way the reflection in the page turns a clockwise arc.
        for (const arc of arcs) expect([arc[3], arc[4]]).toEqual(['0', '1'])
        const box = annotationBox(drawn.a, drawn.t)
        const inside = (p: Point) => {
          const c = screen(p, at)
          return path.isPointInFill(new DOMPoint(c.x - box.left, c.y - box.top))
        }
        // The box is x 100..260, y 500..580 with corners of radius 10: on each corner's
        // diagonal, 3 pt in from the arc is inside, and 1.5 pt in from the sharp corner is not.
        for (const [cx, cy, dx, dy] of [
          [260, 580, -1, -1],
          [100, 580, 1, -1],
          [260, 500, -1, 1],
          [100, 500, 1, 1],
        ] as const) {
          const near = { x: cx + dx * 2.5, y: cy + dy * 2.5 }
          const deep = { x: cx + dx * 4, y: cy + dy * 4 }
          expect(inside(near), `${cx},${cy} near the corner`).toBe(false)
          expect(inside(deep), `${cx},${cy} inside the arc`).toBe(true)
        }
      })

      it(`turns an elliptical arc's radii and keeps its flags on ${at.name}`, () => {
        const layer = draw(
          {
            type: 'mask',
            page: 0,
            rect: { x: 120, y: 530, width: 200, height: 100 },
            shape: 'ellipse',
          },
          at
        )
        const mask = createMaskLayer(layer.host, layer.el)
        mask.update(layer.a as MaskAnnotation, layer.t)
        cleanup.push(() => mask.destroy())
        const d = layer.host.querySelector('svg.ink-mask-layer path')!.getAttribute('d')!
        const s = at.zoom * (at.userUnit ?? 1)
        // 200 x 100 pt: the radii 100 and 50 pt lie along the other axes on this page.
        expect(d).toContain(`A${50 * s} ${100 * s} 0 1 0 `)
      })
    }
  })

  describe('ink', () => {
    // A straight stroke 8 pt wide, sampled every 4 pt: its outline reaches half a width either
    // side of the samples and about as far along them.
    const samples = Array.from({ length: 31 }, (_, i) => ({ x: 100 + i * 4, y: 600 }))
    for (const at of PLACEMENTS) {
      it(`is centred on its samples and as wide as its stroke on ${at.name}`, () => {
        const drawn = draw(
          {
            type: 'ink',
            page: 0,
            rect: { x: 90, y: 590, width: 140, height: 20 },
            width: 8,
            inklist: [samples],
          },
          at
        )
        const s = at.zoom * (at.userUnit ?? 1)
        const want = boundsOf(samples.map((p) => screen(p, at)))
        const got = drawn.onScreen('path.ink-stroke')
        const centre = (b: Bounds) => ({
          x: (b.left + b.right) / 2,
          y: (b.top + b.bottom) / 2,
        })
        expect(Math.abs(centre(got).x - centre(want).x)).toBeLessThan(2 * s)
        expect(Math.abs(centre(got).y - centre(want).y)).toBeLessThan(2 * s)
        for (const [lo, hi] of [
          ['left', 'right'],
          ['top', 'bottom'],
        ] as const) {
          const along = want[hi] - want[lo]
          const extent = got[hi] - got[lo]
          // Along the stroke the outline is its length, give or take a width; across it, at
          // most the width.
          if (along > 0) expect(Math.abs(extent - along)).toBeLessThanOrEqual(8 * s)
          else expect(extent).toBeLessThanOrEqual(8 * s + 0.5)
          if (along === 0) expect(extent).toBeGreaterThan(8 * s * 0.5)
        }
        // The band that takes presses follows the samples, not the outline.
        const hit = drawn.onScreen(
          'path[data-ink-hit-stroke], polyline[data-ink-hit-stroke]'
        )
        expectBounds(hit, want)
      })
    }
  })

  describe('a text box', () => {
    const box = { x: 100, y: 560, width: 200, height: 90 }
    const input: AnnotationInput = {
      type: 'freetext',
      page: 0,
      rect: box,
      contents: 'The quick brown fox jumps over the lazy dog.',
      color: '#FFF3B0',
      borderColor: '#B00020',
      width: 2,
    }
    for (const at of PLACEMENTS) {
      it(`has its box, text area and edge where the rect maps, and its text reading along the view on ${at.name}`, () => {
        const drawn = draw(input, at)
        const want = boundsOf(corners(box).map((p) => screen(p, at)))
        expectBounds(drawn.onScreen('[data-ink-part="box"]'), want)
        expectBounds(drawn.onScreen('rect[data-ink-text-area]'), want)
        expectBounds(drawn.onScreen('rect[data-ink-edge]'), want)
        // The border is inset by half its width.
        const border = boundsOf(
          corners({ x: 101, y: 561, width: 198, height: 88 }).map((p) => screen(p, at))
        )
        expectBounds(drawn.onScreen('[data-ink-part="border"]'), border)

        const texts = [...drawn.el.querySelectorAll<SVGTextElement>('text')]
        expect(texts.length).toBeGreaterThan(1)
        const ctm = texts[0]!.getScreenCTM()!
        const origin = drawn.host.getBoundingClientRect()
        const first = texts[0]!
        const from = first.getStartPositionOfChar(0).matrixTransform(ctm)
        const to = first
          .getEndPositionOfChar(first.getNumberOfChars() - 1)
          .matrixTransform(ctm)
        // Text reads left to right as the file shows the page, and turns with the view.
        const quarter = at.view / 90
        const along = [
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: -1, y: 0 },
          { x: 0, y: -1 },
        ][quarter]!
        const run = { x: to.x - from.x, y: to.y - from.y }
        expect(run.x * along.x + run.y * along.y).toBeGreaterThan(
          0.9 * Math.hypot(run.x, run.y)
        )
        // It starts on the first line's baseline origin, as the drawing places it.
        const item = describedAt(drawn.a, at).items[0]
        if (item?.kind !== 'group') throw new Error('not a group')
        const textItem = item.items.find((i) => i.kind === 'text')
        if (textItem?.kind !== 'text') throw new Error('no text')
        const start = screen(textItem.lines[0]!.origin, at)
        expect(Math.abs(from.x - origin.left - start.x)).toBeLessThanOrEqual(0.75)
        expect(Math.abs(from.y - origin.top - start.y)).toBeLessThanOrEqual(0.75)
        // Every line stays inside the box.
        for (const text of texts) {
          const r = text.getBoundingClientRect()
          expect(r.left - origin.left).toBeGreaterThanOrEqual(want.left - 1)
          expect(r.right - origin.left).toBeLessThanOrEqual(want.right + 1)
          expect(r.top - origin.top).toBeGreaterThanOrEqual(want.top - 1)
          expect(r.bottom - origin.top).toBeLessThanOrEqual(want.bottom + 1)
        }
      })
    }
  })

  describe('a callout and a speech bubble', () => {
    const leader = [
      { x: 70, y: 570 },
      { x: 100, y: 600 },
      { x: 140, y: 625 },
    ]
    for (const at of PLACEMENTS) {
      it(`put the leader line and the bubble where their points map on ${at.name}`, () => {
        const callout = draw(
          {
            type: 'freetext',
            page: 0,
            rect: { x: 60, y: 560, width: 240, height: 120 },
            fringe: { left: 80, top: 10, right: 10, bottom: 50 },
            intent: 'FreeTextCallout',
            callout: leader,
            head: 'OpenArrow',
            width: 1,
            color: '#FFFFFF',
            contents: 'The quick brown fox jumps over the lazy dog.',
          },
          at
        )
        expectBounds(
          callout.onScreen('.ink-callout-line'),
          boundsOf(leader.map((p) => screen(p, at)))
        )
        // The text box is the rect less its fringe.
        expectBounds(
          callout.onScreen('[data-ink-part="box"]'),
          boundsOf(
            corners({ x: 140, y: 610, width: 150, height: 60 }).map((p) => screen(p, at))
          )
        )
        const bubble = draw(
          {
            type: 'freetext',
            page: 0,
            rect: { x: 100, y: 470, width: 160, height: 110 },
            fringe: { left: 0, top: 0, right: 0, bottom: 30 },
            intent: 'FreeTextCallout',
            cornerRadius: 10,
            width: 2,
            color: '#FFFFFF',
            callout: [
              { x: 120, y: 470 },
              { x: 150, y: 500 },
            ],
            contents: 'The quick brown fox jumps over the lazy dog.',
          },
          at
        )
        // The box is the rect less its fringe; the wedge reaches the tip below it.
        expectBounds(
          bubble.onScreen('path.ink-bubble'),
          boundsOf(
            [
              ...corners({ x: 100, y: 500, width: 160, height: 80 }),
              { x: 120, y: 470 },
            ].map((p) => screen(p, at))
          )
        )
      })
    }
  })

  describe('a mask', () => {
    const rect = { x: 120, y: 530, width: 200, height: 100 }
    for (const shape of ['rect', 'ellipse'] as const) {
      for (const at of PLACEMENTS) {
        it(`dims the whole page but a ${shape} where the mask maps, and its edge band follows the shape on ${at.name}`, () => {
          const drawn = draw(
            { type: 'mask', page: 0, rect, shape, dim: 0.5, color: '#102030' },
            at
          )
          const layer = createMaskLayer(drawn.host, drawn.el)
          layer.update(drawn.a as MaskAnnotation, drawn.t)
          cleanup.push(() => layer.destroy())
          const page = at.box ?? { x: 0, y: 0, width: 612, height: 792 }
          const whole = boundsOf(corners(page).map((p) => screen(p, at)))
          const origin = drawn.host.getBoundingClientRect()
          const svg = drawn.host.querySelector('svg.ink-mask-layer')!
          const dim = svg.querySelector<SVGPathElement>('path')!
          const r = dim.getBoundingClientRect()
          expectBounds(
            {
              left: r.left - origin.left,
              top: r.top - origin.top,
              right: r.right - origin.left,
              bottom: r.bottom - origin.top,
            },
            whole
          )
          const hole = boundsOf(corners(rect).map((p) => screen(p, at)))
          const mid = { x: (hole.left + hole.right) / 2, y: (hole.top + hole.bottom) / 2 }
          const s = at.zoom * (at.userUnit ?? 1)
          // The cut-out is clear, and just outside it on every side is dimmed.
          expect(dim.isPointInFill(new DOMPoint(mid.x, mid.y))).toBe(false)
          for (const p of [
            { x: hole.left - 2 * s, y: mid.y },
            { x: hole.right + 2 * s, y: mid.y },
            { x: mid.x, y: hole.top - 2 * s },
            { x: mid.x, y: hole.bottom + 2 * s },
          ])
            expect(dim.isPointInFill(new DOMPoint(p.x, p.y)), JSON.stringify(p)).toBe(
              true
            )
          // The element holds the edge band, inside the shape's outline.
          const band = drawn.onScreen('.ink-mask-shape')
          expectBounds(
            band,
            {
              left: hole.left + 3,
              top: hole.top + 3,
              right: hole.right - 3,
              bottom: hole.bottom - 3,
            },
            0.75
          )
        })
      }
    }
  })
})
