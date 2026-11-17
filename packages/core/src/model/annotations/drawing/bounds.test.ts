import { describe, expect, test } from 'vitest'

import { staticDefaults } from '../defaults'
import { createAnnotationStore } from '../store'

import { arcToCubics } from './arc'
import { describeDrawing } from './describe'
import { standardMeasure } from './text/measure'

import type { Point, Rect } from '../../geometry'
import type { AnnotationInput } from '../types'
import type { DrawContext, DrawItem } from './types'

const at = { page: 0 } as const
const rect = { x: 100, y: 600, width: 80, height: 60 }
const quad = {
  p1: { x: 72, y: 715 },
  p2: { x: 300, y: 715 },
  p3: { x: 72, y: 695 },
  p4: { x: 300, y: 695 },
}
/** A sheared quad whose corners are sharp. */
const sharp = {
  p1: { x: 72, y: 715 },
  p2: { x: 300, y: 715 },
  p3: { x: 100, y: 713 },
  p4: { x: 328, y: 713 },
}
const zigzag = [
  { x: 100, y: 600 },
  { x: 160, y: 630 },
  { x: 101, y: 601 },
  { x: 220, y: 600 },
]
const font = {
  fontFamily: 'Helvetica',
  fontSize: 12,
  textAlign: 'left',
  color: '#000000',
} as const
const ENDINGS = [
  'OpenArrow',
  'ClosedArrow',
  'ROpenArrow',
  'RClosedArrow',
  'Square',
  'Circle',
  'Diamond',
  'Butt',
  'Slash',
] as const

const inputs: AnnotationInput[] = [
  { type: 'highlight', ...at, quads: [quad, sharp] },
  { type: 'underline', ...at, quads: [quad, sharp] },
  { type: 'strikeout', ...at, quads: [quad, sharp] },
  { type: 'squiggly', ...at, quads: [quad, sharp] },
  { type: 'redact', ...at, rect },
  { type: 'redact', ...at, rect, quads: [quad, sharp] },
  { type: 'square', ...at, rect, width: 6, cornerRadius: 10 },
  { type: 'square', ...at, rect: { ...rect, width: 2 }, width: 6 },
  { type: 'square', ...at, rect: { ...rect, width: 0, height: 0 }, width: 6 },
  { type: 'circle', ...at, rect, width: 6, dashes: [4, 2] },
  { type: 'circle', ...at, rect: { ...rect, height: 1 }, width: 6 },
  { type: 'text', ...at, rect: { ...rect, width: 20, height: 20 } },
  { type: 'freetext', ...at, rect, contents: 'Box', width: 4, defaultStyle: font },
  {
    type: 'freetext',
    ...at,
    rect: { x: 60, y: 560, width: 200, height: 70 },
    fringe: { left: 40, top: 5, right: 10, bottom: 45 },
    contents: 'Callout',
    intent: 'FreeTextCallout',
    callout: [
      { x: 40, y: 540 },
      { x: 90, y: 600 },
      { x: 100, y: 612 },
    ],
    head: 'ClosedArrow',
    width: 3,
    defaultStyle: font,
  },
  {
    type: 'freetext',
    ...at,
    rect: { x: 100, y: 300, width: 120, height: 60 },
    contents: 'Bubble',
    intent: 'FreeTextCallout',
    cornerRadius: 8,
    width: 5,
    callout: [
      { x: 90, y: 250 },
      { x: 130, y: 300 },
    ],
    defaultStyle: font,
  },
  { type: 'line', ...at, rect, start: rect, end: { x: 200, y: 700 }, width: 0.5 },
  ...ENDINGS.map((e): AnnotationInput => ({
    type: 'line',
    ...at,
    rect,
    start: { x: 100, y: 600 },
    end: { x: 220, y: 680 },
    width: 0.5,
    head: e,
    tail: e,
  })),
  { type: 'polyline', ...at, rect, vertices: zigzag, width: 4, tail: 'OpenArrow' },
  { type: 'polygon', ...at, rect, vertices: zigzag, width: 4 },
  { type: 'ink', ...at, rect, inklist: [zigzag], width: 5 },
  { type: 'ink', ...at, rect, inklist: [[{ x: 100, y: 600 }]], width: 5 },
  {
    type: 'stamp',
    ...at,
    rect,
    imagedata:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  },
  { type: 'loupe', ...at, rect: { ...rect, height: 40 }, width: 60 },
  { type: 'loupe', ...at, rect, width: 4 },
  { type: 'mask', ...at, rect, shape: 'ellipse' },
  {
    type: 'mask',
    ...at,
    rect: { x: -40, y: 700, width: 200, height: 150 },
    shape: 'rect',
  },
  {
    type: 'mask',
    ...at,
    rect: { x: 560, y: -30, width: 100, height: 100 },
    shape: 'ellipse',
  },
]

const context = (rotate: 0 | 90 | 180 | 270): DrawContext => ({
  page: { box: { x: 0, y: 0, width: 612, height: 792 }, rotate, userUnit: 1 },
  measure: standardMeasure,
})

/** Points along the paint of `item`, and the half-width of its stroke. */
function sample(item: DrawItem): { points: Point[]; half: number }[] {
  const along = (a: Point, b: Point, n = 16): Point[] =>
    Array.from({ length: n + 1 }, (_, i) => ({
      x: a.x + ((b.x - a.x) * i) / n,
      y: a.y + ((b.y - a.y) * i) / n,
    }))
  const half = ('paint' in item && item.paint.stroke?.width) || 0
  switch (item.kind) {
    case 'group':
      return item.items.flatMap(sample)
    case 'polygon':
    case 'polyline': {
      const pts =
        item.kind === 'polygon' ? [...item.points, item.points[0]!] : item.points
      const out = pts.length === 1 ? [pts[0]!] : []
      for (let i = 1; i < pts.length; i++) out.push(...along(pts[i - 1]!, pts[i]!))
      return [{ points: out, half: half / 2 }]
    }
    case 'rect': {
      const { x, y, width, height } = item.rect
      const c = [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
        { x, y },
      ]
      return [{ points: c.slice(1).flatMap((p, i) => along(c[i]!, p)), half: half / 2 }]
    }
    case 'ellipse': {
      const { x, y, width, height } = item.rect
      const out = Array.from({ length: 72 }, (_, i) => ({
        x: x + width / 2 + (width / 2) * Math.cos((i * Math.PI) / 36),
        y: y + height / 2 + (height / 2) * Math.sin((i * Math.PI) / 36),
      }))
      return [{ points: out, half: half / 2 }]
    }
    case 'path': {
      const out: Point[] = []
      let cur: Point | undefined
      let start: Point | undefined
      const cubic = (c: { c1: Point; c2: Point; to: Point }): void => {
        const p = cur!
        for (let i = 0; i <= 32; i++) {
          const t = i / 32
          const s = 1 - t
          out.push({
            x:
              s ** 3 * p.x +
              3 * s * s * t * c.c1.x +
              3 * s * t * t * c.c2.x +
              t ** 3 * c.to.x,
            y:
              s ** 3 * p.y +
              3 * s * s * t * c.c1.y +
              3 * s * t * t * c.c2.y +
              t ** 3 * c.to.y,
          })
        }
        cur = c.to
      }
      for (const c of item.commands) {
        if (c.op === 'M') cur = start = c.to
        else if (c.op === 'L') {
          out.push(...along(cur!, c.to))
          cur = c.to
        } else if (c.op === 'C') cubic(c)
        else if (c.op === 'A') {
          for (const piece of arcToCubics(cur!, c)) cubic(piece)
          cur = c.to
        } else if (cur && start) {
          out.push(...along(cur, start))
          cur = start
        }
      }
      return [{ points: out, half: half / 2 }]
    }
    case 'image':
      return [{ points: corners(item.rect), half: 0 }]
    case 'text':
      return item.clip ? [{ points: corners(item.clip.rect), half: 0 }] : []
    case 'page':
      return [{ points: corners(item.target), half: 0 }]
  }
}

const corners = ({ x, y, width, height }: Rect): Point[] => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
]

describe('Drawing.bounds', () => {
  for (const rotate of [0, 90, 180, 270] as const) {
    test(`holds every painted point, stroke included, at /Rotate ${rotate}`, () => {
      const store = createAnnotationStore({
        mode: { mode: 'uncontrolled' },
        defaults: staticDefaults,
      })
      const all = inputs.map((input) => store.add(input))
      // A note's rect may be reversed in a file: the schema refuses it, a description does not.
      const note = all.find((a) => a.type === 'text')!
      all.push({ ...note, rect: { x: 120, y: 720, width: -20, height: -20 } })
      for (const a of all) {
        const input = a
        const d = describeDrawing(a, context(rotate))!
        const name = `${a.type} ${JSON.stringify(input).slice(0, 60)}`
        const { x, y, width, height } = d.bounds
        for (const v of [x, y, width, height]) expect(Number.isFinite(v), name).toBe(true)
        for (const { points, half } of d.items.flatMap(sample)) {
          for (const p of points) {
            const where = `${name} at ${p.x},${p.y}`
            expect(p.x - half, where).toBeGreaterThanOrEqual(x - 1e-6)
            expect(p.x + half, where).toBeLessThanOrEqual(x + width + 1e-6)
            expect(p.y - half, where).toBeGreaterThanOrEqual(y - 1e-6)
            expect(p.y + half, where).toBeLessThanOrEqual(y + height + 1e-6)
          }
        }
      }
    })
  }
})
