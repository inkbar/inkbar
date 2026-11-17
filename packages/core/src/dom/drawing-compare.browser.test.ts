import { describe, expect, it } from 'vitest'

import { staticDefaults } from '../model/annotations/defaults'
import { createAnnotationStore } from '../model/annotations/store'

import { comparePaint, type CompareCase } from './drawing-compare'
import { renderAnnotationContent } from './overlay-render'
import { renderReferenceContent } from './reference-render'
import { createPageTransform } from './transform'

const quads = [
  {
    p1: { x: 72, y: 715 },
    p2: { x: 300, y: 715 },
    p3: { x: 72, y: 695 },
    p4: { x: 300, y: 695 },
  },
]
const highlight: CompareCase = {
  name: 'highlight',
  annotation: {
    type: 'highlight',
    page: 0,
    rect: { x: 72, y: 695, width: 228, height: 20 },
    quads,
  },
}

describe('comparePaint', () => {
  it('reports no difference for a type both sides still draw with the reference renderer', async () => {
    const r = await comparePaint({ ...highlight, region: 'page' })
    expect(r.referenceInk).toBeGreaterThan(0)
    expect(r.differingPixels).toBe(0)
    expect(r.differing).toBe(0)
    expect(r.referenceBox.width).toBe(612)
    expect(r.paintedBox.width).toBe(612)
    expect(r.paintedBox.height).toBe(r.referenceBox.height)
  })

  it('sees the same highlight in a different colour', async () => {
    const r = await comparePaint(
      { ...highlight, annotation: { ...highlight.annotation, color: '#ff0000' } },
      (el, a, t) => renderReferenceContent(el, { ...a, color: '#0000ff' }, t)
    )
    expect(r.differing).toBeGreaterThan(0.5)
  })

  it('sees a highlight against an empty layer', async () => {
    const r = await comparePaint(highlight, (el) => el.replaceChildren())
    expect(r.differing).toBe(1)
    expect(r.differingPixels).toBe(r.referenceInk)
  })

  it('captures the whole page at zoom 2 and 4, beyond the test viewport', async () => {
    for (const zoom of [2, 4] as const) {
      const r = await comparePaint({ ...highlight, zoom, region: 'page' })
      expect(r.referenceBox.width).toBe(612 * zoom)
      expect(r.differing).toBe(0)
    }
  })

  it('refuses a reference image with nothing in it', async () => {
    await expect(
      comparePaint(highlight, undefined, (el) => el.replaceChildren())
    ).rejects.toThrow(/blank/)
  })

  it('reports no difference for a stamp, whose image loads late', async () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 20
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#c00'
    ctx.fillRect(0, 0, 20, 20)
    const r = await comparePaint({
      name: 'stamp',
      annotation: {
        type: 'stamp',
        page: 0,
        rect: { x: 100, y: 600, width: 80, height: 40 },
        imagedata: canvas.toDataURL('image/png'),
      },
    })
    expect(r.referenceInk).toBeGreaterThan(0)
    expect(r.differing).toBe(0)
  })
})

const rect = { x: 100, y: 600, width: 80, height: 40 }
const twoQuads = [
  {
    p1: { x: 72, y: 715 },
    p2: { x: 300, y: 715 },
    p3: { x: 72, y: 695 },
    p4: { x: 300, y: 695 },
  },
  {
    p1: { x: 200, y: 715 },
    p2: { x: 340, y: 715 },
    p3: { x: 200, y: 695 },
    p4: { x: 340, y: 695 },
  },
]
const markupRect = { x: 72, y: 695, width: 268, height: 20 }

const moved: CompareCase[] = [
  {
    name: 'highlight with two overlapping quads',
    annotation: {
      type: 'highlight',
      page: 0,
      rect: markupRect,
      quads: twoQuads,
      opacity: 0.4,
    },
  },
  ...(['underline', 'strikeout', 'squiggly'] as const).map((type): CompareCase => ({
    name: type,
    annotation: { type, page: 0, rect: markupRect, quads: twoQuads, opacity: 0.8 },
  })),
  {
    name: 'redact with quads',
    annotation: { type: 'redact', page: 0, rect: markupRect, quads: twoQuads },
  },
  { name: 'redact without', annotation: { type: 'redact', page: 0, rect } },
  { name: 'square plain', annotation: { type: 'square', page: 0, rect, width: 2 } },
  {
    name: 'square dashed with radius and fill',
    annotation: {
      type: 'square',
      page: 0,
      rect,
      width: 3,
      dashes: [3, 3],
      cornerRadius: 6,
      interiorColor: '#7FB3D5',
    },
  },
  {
    name: 'circle with fill at half opacity',
    annotation: {
      type: 'circle',
      page: 0,
      rect,
      width: 2,
      interiorColor: '#7FB3D5',
      opacity: 0.5,
    },
  },
]

// A quad turned 20 degrees, and a parallelogram.
const tilt = (deg: number) => {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const o = { x: 150, y: 650 }
  const at = (x: number, y: number) => ({
    x: o.x + x * c - y * s,
    y: o.y + x * s + y * c,
  })
  return { p1: at(0, 20), p2: at(200, 20), p3: at(0, 0), p4: at(200, 0) }
}
const skewed = {
  p1: { x: 130, y: 720 },
  p2: { x: 330, y: 720 },
  p3: { x: 100, y: 700 },
  p4: { x: 300, y: 700 },
}
const slanted: CompareCase[] = (
  ['highlight', 'underline', 'squiggly', 'redact'] as const
).flatMap((type) =>
  [
    ['tilted', tilt(20)],
    ['skewed', skewed],
  ].map(([how, q]): CompareCase => ({
    name: `${type} on a ${how as string} quad`,
    annotation: {
      type,
      page: 0,
      rect: { x: 100, y: 640, width: 260, height: 100 },
      quads: [q as typeof skewed],
    },
  }))
)

describe('comparePaint on tilted and skewed quads', () => {
  for (const c of slanted) {
    for (const rotate of [0, 90] as const) {
      it(`${c.name} at rotate ${rotate}`, async () => {
        const r = await comparePaint({ ...c, rotate, zoom: 2 })
        expect(r.differing).toBeLessThanOrEqual(0.005)
      })
    }
  }
})

describe('comparePaint regions', () => {
  const at = (x: number, y: number): CompareCase => ({
    name: `highlight at ${x},${y}`,
    rotate: 90,
    zoom: 2,
    annotation: {
      type: 'highlight',
      page: 0,
      rect: { x, y, width: 60, height: 20 },
      quads: [
        {
          p1: { x, y: y + 20 },
          p2: { x: x + 60, y: y + 20 },
          p3: { x, y },
          p4: { x: x + 60, y },
        },
      ],
    },
  })
  for (const [edge, x, y] of [
    ['top', 100, 765],
    ['bottom', 100, 5],
    ['right', 545, 400],
  ] as const) {
    it(`captures an annotation at the ${edge} of a page turned 90 at zoom 2`, async () => {
      const r = await comparePaint(at(x, y))
      expect(r.referenceInk).toBeGreaterThan(0)
      expect(r.differing).toBe(0)
    })
  }

  it('captures a whole page turned 90 at zoom 2, wider than the viewport', async () => {
    const r = await comparePaint({ ...at(100, 765), region: 'page' })
    expect(r.referenceBox.width).toBe(792 * 2)
    expect(r.referenceInk).toBeGreaterThan(0)
    expect(r.differing).toBe(0)
  })

  it('captures only the annotation and a margin by default', async () => {
    const r = await comparePaint(at(100, 400))
    expect(r.referenceBox.width).toBeLessThan(400)
    expect(r.referenceBox.height).toBeLessThan(400)
  })
})

describe('comparePaint for the types that have a drawing', () => {
  for (const c of moved) {
    for (const rotate of [0, 90] as const) {
      for (const zoom of [1, 2] as const) {
        it(`${c.name} at rotate ${rotate} and zoom ${zoom}`, async () => {
          const r = await comparePaint({ ...c, rotate, zoom })
          expect(r.differing).toBeLessThanOrEqual(0.005)
        })
      }
    }
  }

  it('square and circle at zoom 0.5', async () => {
    for (const c of moved.filter((m) => /square|circle/.test(m.name))) {
      const r = await comparePaint({ ...c, zoom: 0.5 })
      expect(r.differing).toBeLessThanOrEqual(0.005)
    }
  })
})

/** An element's tree as plain data, with numbers in attribute values rounded to 3 places. */
function shape(el: Element): unknown {
  const round = (v: string): string =>
    v.replace(/-?\d+\.\d+(?:e-?\d+)?/g, (n) =>
      String(Math.round(Number(n) * 1000) / 1000)
    )
  const attrs: Record<string, string> = {}
  for (const a of [...el.attributes].sort((x, y) => x.name.localeCompare(y.name))) {
    attrs[a.name] = round(a.value)
  }
  return { tag: el.tagName, attrs, children: [...el.children].map(shape) }
}

describe('the painted markup against the reference markup', () => {
  const markup = { page: 0, rect: { x: 72, y: 695, width: 228, height: 20 }, quads }
  const stamp = { page: 0, rect: { x: 100, y: 600, width: 80, height: 40 } }
  const cases: [string, CompareCase['annotation']][] = [
    ['highlight', { type: 'highlight', ...markup, quads: twoQuads }],
    ['underline', { type: 'underline', ...markup, opacity: 0.7 }],
    ['strikeout', { type: 'strikeout', ...markup }],
    ['squiggly', { type: 'squiggly', ...markup }],
    ['commented highlight', { type: 'highlight', ...markup, contents: 'Check this' }],
    ['redact with quads', { type: 'redact', ...markup }],
    ['redact without', { type: 'redact', ...stamp }],
    ['stroke-only square', { type: 'square', ...stamp, width: 2, opacity: 0.8 }],
    [
      'square with fill, dashes and radius',
      {
        type: 'square',
        ...stamp,
        width: 3,
        dashes: [3, 3],
        cornerRadius: 6,
        interiorColor: '#7FB3D5',
      },
    ],
    ['stroke-only circle', { type: 'circle', ...stamp, width: 2 }],
    ['filled circle', { type: 'circle', ...stamp, width: 2, interiorColor: '#7FB3D5' }],
  ]
  for (const [name, input] of cases) {
    for (const rotation of [0, 90] as const) {
      it(`${name} at rotate ${rotation} has the reference's elements and attributes`, () => {
        const t = createPageTransform(
          {
            index: 0,
            box: { x: 0, y: 0, width: 612, height: 792 },
            rotate: 0,
            userUnit: 1,
            width: 612,
            height: 792,
          },
          2,
          rotation
        )
        const store = createAnnotationStore({
          mode: { mode: 'uncontrolled' },
          defaults: staticDefaults,
        })
        const a = store.add(input)
        const reference = document.createElement('div')
        const painted = document.createElement('div')
        renderReferenceContent(reference, a, t)
        renderAnnotationContent(painted, a, t)
        expect(reference.children.length).toBeGreaterThan(0)
        if (name.startsWith('stroke-only'))
          expect(painted.querySelector('[data-ink-hit-stroke]')).not.toBeNull()
        if (name.startsWith('commented'))
          expect(painted.querySelector('.ink-comment-marker')).not.toBeNull()
        expect([...painted.children].map(shape)).toEqual(
          [...reference.children].map(shape)
        )
      })
    }
  }
})
