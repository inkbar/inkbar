import { describe, expect, it } from 'vitest'

import { staticDefaults } from '../model/annotations/defaults'
import { createAnnotationStore } from '../model/annotations/store'

import { comparePaint, type CompareCase } from './drawing-compare'
import { annotationBox, renderAnnotationContent } from './overlay-render'
import { renderReferenceContent } from './reference-render'
import { mountContainer } from './test-utils'
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

const stroke = { type: 'line', page: 0, color: '#1B4F72' } as const
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
  'None',
] as const
const lineRect = { x: 90, y: 590, width: 140, height: 40 }
const endingCases: CompareCase[] = ENDINGS.flatMap((tail) =>
  ([2, 4] as const).map((width): CompareCase => ({
    name: `line with a ${tail} tail, width ${width}`,
    annotation: {
      ...stroke,
      rect: lineRect,
      start: { x: 100, y: 600 },
      end: { x: 220, y: 620 },
      width,
      tail,
    },
  }))
)
const lineCases: CompareCase[] = [
  ...endingCases,
  ...([2, 4] as const).map((width): CompareCase => ({
    name: `LineArrow, width ${width}`,
    annotation: {
      ...stroke,
      rect: lineRect,
      start: { x: 100, y: 600 },
      end: { x: 220, y: 620 },
      width,
      intent: 'LineArrow',
      tail: 'OpenArrow',
    },
  })),
  ...([2, 4] as const).map((width): CompareCase => ({
    name: `dashed polyline with both ends, width ${width}`,
    annotation: {
      type: 'polyline',
      page: 0,
      rect: lineRect,
      vertices: [
        { x: 100, y: 600 },
        { x: 160, y: 630 },
        { x: 220, y: 600 },
      ],
      width,
      dashes: [6, 3],
      head: 'Circle',
      tail: 'ClosedArrow',
    },
  })),
  ...([2, 4] as const).map((width): CompareCase => ({
    name: `filled polygon at 0.6 opacity, width ${width}`,
    annotation: {
      type: 'polygon',
      page: 0,
      rect: lineRect,
      vertices: [
        { x: 100, y: 600 },
        { x: 220, y: 600 },
        { x: 160, y: 640 },
      ],
      width,
      interiorColor: '#7FB3D5',
      opacity: 0.6,
    },
  })),
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

const wave = (n: number, x0: number, y0: number) =>
  Array.from({ length: n }, (_, i) => ({
    x: x0 + i * 4,
    y: y0 + Math.sin(i / 4) * 24,
  }))
const inkRect = { x: 90, y: 540, width: 260, height: 100 }
const inkCases: CompareCase[] = [
  {
    name: 'ink without pressure',
    annotation: {
      type: 'ink',
      page: 0,
      rect: inkRect,
      width: 6,
      inklist: [wave(60, 100, 600)],
    },
  },
  {
    name: 'ink with pressure',
    annotation: {
      type: 'ink',
      page: 0,
      rect: inkRect,
      width: 8,
      inklist: [wave(60, 100, 600)],
      pressure: [Array.from({ length: 60 }, (_, i) => 0.1 + (i * 0.8) / 59)],
    },
  },
  {
    name: 'ink with two strokes at half opacity',
    annotation: {
      type: 'ink',
      page: 0,
      rect: inkRect,
      width: 5,
      opacity: 0.5,
      inklist: [wave(50, 100, 600), wave(40, 110, 560)],
    },
  },
  {
    name: 'ink ending in a long segment',
    annotation: {
      type: 'ink',
      page: 0,
      rect: inkRect,
      width: 6,
      inklist: [[...wave(60, 100, 600), { x: 400, y: 560 }]],
    },
  },
]

describe('comparePaint for ink', () => {
  // Two differences from the reference are intended, because a drawing does not know the zoom:
  // a stroke's tail keeps the samples within 3 CSS px of its end (the library drops them), and
  // a one-point stroke is a round dot (see below). A dense tail at zoom 0.5, where 3 CSS px is
  // 6 points, measured 0.0126 on the plain stroke; the case that ends in a long segment has
  // nothing within 3 CSS px of its end to drop and holds 0.01 at every zoom.
  for (const c of inkCases) {
    for (const rotate of [0, 90] as const) {
      for (const zoom of [0.5, 1, 2, 4] as const) {
        it(`${c.name} at rotate ${rotate} and zoom ${zoom}`, async () => {
          const r = await comparePaint({ ...c, rotate, zoom })
          expect(r.referenceInk).toBeGreaterThan(0)
          const denseTail = c.name === 'ink without pressure' && zoom === 0.5
          expect(r.differing).toBeLessThanOrEqual(denseTail ? 0.015 : 0.01)
        })
      }
    }
  }
})

describe('a one-point ink stroke', () => {
  // Today's drawing stretches a lone point into a capsule along the screen diagonal, a
  // different shape at every zoom; the drawing is a round dot of the stroke's width.
  for (const zoom of [0.5, 1, 2, 4] as const) {
    it(`is a round dot of the stroke's width, on its point, at zoom ${zoom}`, () => {
      const t = createPageTransform(
        {
          index: 0,
          box: { x: 0, y: 0, width: 612, height: 792 },
          rotate: 0,
          userUnit: 1,
          width: 612,
          height: 792,
        },
        zoom,
        0
      )
      const store = createAnnotationStore({
        mode: { mode: 'uncontrolled' },
        defaults: staticDefaults,
      })
      const at = { x: 150, y: 600 }
      const a = store.add({
        type: 'ink',
        page: 0,
        rect: inkRect,
        width: 6,
        inklist: [[at]],
      })
      const host = mountContainer(612 * zoom, 792 * zoom)
      const el = document.createElement('div')
      host.append(el)
      renderAnnotationContent(el, a, t)
      const box = el.querySelector('path.ink-stroke')!.getBoundingClientRect()
      const origin = host.getBoundingClientRect()
      const c = t.toCss(at)
      const bx = box.left - origin.left
      const by = box.top - origin.top
      host.remove()
      expect(Math.abs(box.width - box.height)).toBeLessThan(0.5)
      expect(Math.abs(box.width - 6 * zoom)).toBeLessThan(0.5)
      // The overlay element sits at its box in the page; here it sits at the host's corner.
      const e = annotationBox(a, t)
      expect(Math.abs(bx + box.width / 2 + e.left - c.x)).toBeLessThan(0.5)
      expect(Math.abs(by + box.height / 2 + e.top - c.y)).toBeLessThan(0.5)
    })
  }
})

/** A picture with large flat areas and a transparent region, so resampling differences stay at edges. */
function picture(kind: 'png' | 'jpeg'): string {
  const canvas = document.createElement('canvas')
  canvas.width = 120
  canvas.height = 60
  const ctx = canvas.getContext('2d')!
  if (kind === 'jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 120, 60)
  }
  ctx.fillStyle = '#c0392b'
  ctx.fillRect(0, 0, 60, 60)
  ctx.fillStyle = '#1b4f72'
  ctx.fillRect(60, 0, 60, 30)
  // The bottom right stays transparent in a PNG and white in a JPEG.
  return canvas.toDataURL(kind === 'png' ? 'image/png' : 'image/jpeg', 1)
}

const stampCases: CompareCase[] = (['png', 'jpeg'] as const).flatMap((kind) =>
  ([0, 90] as const).flatMap((rotation) =>
    ([1, 0.5] as const).map((opacity): CompareCase => ({
      name: `${kind} stamp with rotation ${rotation} at opacity ${opacity}`,
      annotation: {
        type: 'stamp',
        page: 0,
        rect: { x: 100, y: 600, width: 80, height: 40 },
        imagedata: picture(kind),
        rotation,
        opacity,
      },
    }))
  )
)

describe('comparePaint for stamps', () => {
  for (const c of stampCases) {
    for (const pageRotate of [0, 90] as const) {
      for (const zoom of [1, 2] as const) {
        it(`${c.name} at page rotate ${pageRotate} and zoom ${zoom}`, async () => {
          const r = await comparePaint({ ...c, pageRotate, zoom })
          expect(r.referenceInk).toBeGreaterThan(0)
          expect(r.differing).toBeLessThanOrEqual(0.005)
        })
      }
    }
  }

  it('a quarter turn of the view as well', async () => {
    for (const c of stampCases.slice(0, 4)) {
      const r = await comparePaint({ ...c, rotate: 90, pageRotate: 90, zoom: 2 })
      expect(r.differing).toBeLessThanOrEqual(0.005)
    }
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

  for (const c of lineCases) {
    for (const rotate of [0, 90] as const) {
      for (const zoom of [1, 2] as const) {
        it(`${c.name} at rotate ${rotate} and zoom ${zoom}`, async () => {
          const r = await comparePaint({ ...c, rotate, zoom })
          expect(r.referenceInk).toBeGreaterThan(0)
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

describe('comparePaint on a page with /Rotate 90', () => {
  const dense = (c: CompareCase, zoom: number): number =>
    c.name === 'ink without pressure' && zoom === 0.5 ? 0.015 : 0.01
  const groups: [
    string,
    CompareCase[],
    (c: CompareCase, zoom: number) => number,
    number[],
  ][] = [
    ['moved', moved, () => 0.005, [0.5, 1, 2]],
    ['lines', lineCases, () => 0.005, [1, 2]],
    ['ink', inkCases, dense, [0.5, 1, 2]],
  ]
  for (const [group, cases, limit, zooms] of groups) {
    for (const c of cases) {
      for (const rotate of [0, 90] as const) {
        for (const zoom of zooms) {
          it(`${group}: ${c.name} at view rotate ${rotate} and zoom ${zoom}`, async () => {
            const r = await comparePaint({
              ...c,
              pageRotate: 90,
              rotate,
              zoom: zoom as 0.5 | 1 | 2,
            })
            expect(r.referenceInk).toBeGreaterThan(0)
            expect(r.differing).toBeLessThanOrEqual(limit(c, zoom))
          })
        }
      }
    }
  }
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
    [
      'line with both endings',
      {
        type: 'line',
        page: 0,
        rect: lineRect,
        start: { x: 100, y: 600 },
        end: { x: 220, y: 620 },
        width: 2,
        head: 'Circle',
        tail: 'OpenArrow',
        opacity: 0.8,
      },
    ],
    [
      'dashed polyline',
      {
        type: 'polyline',
        page: 0,
        rect: lineRect,
        vertices: [
          { x: 100, y: 600 },
          { x: 160, y: 630 },
          { x: 220, y: 600 },
        ],
        width: 3,
        dashes: [6, 3],
        tail: 'Slash',
      },
    ],
    [
      'filled polygon',
      {
        type: 'polygon',
        page: 0,
        rect: lineRect,
        vertices: [
          { x: 100, y: 600 },
          { x: 220, y: 600 },
          { x: 160, y: 640 },
        ],
        width: 2,
        interiorColor: '#7FB3D5',
        opacity: 0.6,
      },
    ],
    [
      'stroke-only polygon',
      {
        type: 'polygon',
        page: 0,
        rect: lineRect,
        vertices: [
          { x: 100, y: 600 },
          { x: 220, y: 600 },
          { x: 160, y: 640 },
        ],
        width: 2,
      },
    ],
    ['filled circle', { type: 'circle', ...stamp, width: 2, interiorColor: '#7FB3D5' }],
    [
      'ink with two strokes',
      {
        type: 'ink',
        page: 0,
        rect: inkRect,
        width: 3,
        opacity: 0.7,
        inklist: [wave(30, 100, 600), wave(20, 110, 560)],
        pressure: [
          Array.from({ length: 30 }, (_, i) => 0.2 + (i * 0.6) / 29),
          Array.from({ length: 20 }, (_, i) => 0.8 - (i * 0.6) / 19),
        ],
      },
    ],
    [
      'ink with an empty stroke',
      {
        type: 'ink',
        page: 0,
        rect: inkRect,
        width: 3,
        inklist: [wave(20, 110, 560), wave(20, 110, 530)],
      },
    ],
  ]
  for (const [name, input] of cases) {
    for (const [pageRotate, rotation] of [
      [0, 0],
      [0, 90],
      [90, 0],
      [90, 90],
    ] as const) {
      it(`${name} at page rotate ${pageRotate} and view rotate ${rotation} has the reference's elements and attributes`, () => {
        const t = createPageTransform(
          {
            index: 0,
            box: { x: 0, y: 0, width: 612, height: 792 },
            rotate: pageRotate,
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
        const added = store.add(input)
        // The schema refuses an empty stroke, but an annotation can still arrive with one.
        const a =
          name.includes('empty stroke') && added.type === 'ink'
            ? { ...added, inklist: [[], ...added.inklist] }
            : added
        const reference = document.createElement('div')
        const painted = document.createElement('div')
        renderReferenceContent(reference, a, t)
        renderAnnotationContent(painted, a, t)
        expect(reference.children.length).toBeGreaterThan(0)
        if (
          name.startsWith('stroke-only') ||
          name.startsWith('line') ||
          name.includes('polyline')
        )
          expect(painted.querySelector('[data-ink-hit-stroke]')).not.toBeNull()
        if (name.startsWith('commented'))
          expect(painted.querySelector('.ink-comment-marker')).not.toBeNull()
        if (name.startsWith('ink')) {
          // The outline is computed in points and then scaled, not in CSS px, so its `d` is
          // not the reference's to three places (it is the same shape: see comparePaint for
          // ink). Everything else is compared.
          const withoutD = (el: Element): unknown => {
            const s = shape(el) as { attrs: Record<string, string>; children: unknown[] }
            const strip = (n: { attrs: Record<string, string>; children: unknown[] }) => {
              if (n.attrs.class === 'ink-stroke') delete n.attrs.d
              n.children.forEach((c) => strip(c as typeof n))
            }
            strip(s)
            return s
          }
          expect(
            painted.querySelectorAll('path.ink-stroke').length
          ).toBeGreaterThanOrEqual(2)
          expect(
            painted.querySelectorAll('[data-ink-hit-stroke]').length
          ).toBeGreaterThanOrEqual(2)
          expect([...painted.children].map(withoutD)).toEqual(
            [...reference.children].map(withoutD)
          )
        } else
          expect([...painted.children].map(shape)).toEqual(
            [...reference.children].map(shape)
          )
      })
    }
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
    const t = createPageTransform(
      {
        index: 0,
        box: { x: 0, y: 0, width: 612, height: 792 },
        rotate: 0,
        userUnit: 1,
        width: 612,
        height: 792,
      },
      0.5,
      0
    )
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const a = store.add({
      type: 'line',
      page: 0,
      rect: lineRect,
      start: { x: 100, y: 600 },
      end: { x: 220, y: 600 },
      width: 0.5,
      tail: 'OpenArrow',
    })
    const reference = document.createElement('div')
    const painted = document.createElement('div')
    renderReferenceContent(reference, a, t)
    renderAnnotationContent(painted, a, t)
    // Today the floor is one screen pixel: 3 px tall at zoom 0.5. It is now one point: 1.5 px.
    expect(height(reference.querySelector('[data-ending="tail"]')!)).toBeCloseTo(3, 3)
    expect(height(painted.querySelector('[data-ending="tail"]')!)).toBeCloseTo(1.5, 3)
  })
})
