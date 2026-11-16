import { describe, expect, it } from 'vitest'

import { staticDefaults } from '../model/annotations/defaults'
import { createAnnotationStore } from '../model/annotations/store'

import { comparePaint, type CompareCase, type CompareResult } from './drawing-compare'
import { createMaskLayer } from './mask-layer'
import { annotationBox, renderAnnotationContent } from './overlay-render'
import { createReferenceMaskLayer } from './reference-mask'
import { renderReferenceContent } from './reference-render'
import { mountContainer } from './test-utils'
import { checkTextFonts } from './text-font-check'
import { FONT_STACKS } from './text-fonts'
import { createPageTransform } from './transform'

import type { PageTransform } from './transform'
import type { Annotation, MaskAnnotation } from '../model/annotations/types'

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

describe('comparePaint for loupes', () => {
  const rim = (width: number): CompareCase => ({
    name: `loupe rim of width ${width}`,
    annotation: {
      type: 'loupe',
      page: 0,
      rect: { x: 200, y: 500, width: 120, height: 120 },
      width,
      opacity: 0.8,
    },
  })
  const origin = { x: 20, y: 30, width: 612, height: 792 }

  for (const pageRotate of [0, 90] as const) {
    for (const rotate of [0, 90] as const) {
      for (const [where, extra] of [
        ['a page at the origin', {}],
        ['a page whose box starts at (20, 30)', { box: origin }],
        ['a page with /UserUnit 2', { userUnit: 2 }],
      ] as const) {
        it(`a rim of width 2 on ${where} at page rotate ${pageRotate} and view rotate ${rotate}`, async () => {
          const c = rim(2)
          const annotation =
            'box' in extra
              ? { ...c.annotation, rect: { x: 220, y: 530, width: 120, height: 120 } }
              : c.annotation
          const r = await comparePaint({ ...c, annotation, ...extra, pageRotate, rotate })
          expect(r.referenceInk).toBeGreaterThan(0)
          expect(r.differing).toBeLessThanOrEqual(0.005)
        })
      }
    }
  }

  it('a wide rim at zoom 2', async () => {
    const r = await comparePaint({ ...rim(6), zoom: 2 })
    expect(r.referenceInk).toBeGreaterThan(0)
    expect(r.differing).toBeLessThanOrEqual(0.005)
  })

  it('a loupe that is not square draws its rim as the old code did', async () => {
    const c = rim(2)
    const r = await comparePaint({
      ...c,
      annotation: { ...c.annotation, rect: { x: 200, y: 500, width: 160, height: 90 } },
    })
    expect(r.referenceInk).toBeGreaterThan(0)
    expect(r.differing).toBeLessThanOrEqual(0.005)
  })

  it('a loupe with no border draws nothing, as the old code did', () => {
    const holder = document.createElement('div')
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const a = store.add(rim(0).annotation)
    const t = createPageTransform(
      {
        index: 0,
        box: { x: 0, y: 0, width: 612, height: 792 },
        rotate: 0,
        userUnit: 1,
        width: 612,
        height: 792,
      },
      1,
      0
    )
    renderAnnotationContent(holder, a, t)
    expect(holder.querySelector('.ink-loupe-rim')).toBeNull()
    // The lens still takes presses anywhere on it.
    const hit = holder.querySelector('circle[data-ink-hit-area]')!
    expect(hit.getAttribute('pointer-events')).toBe('all')
    expect(hit.getAttribute('r')).toBe('60')
  })
})

describe('comparePaint for masks, the page-wide layer', () => {
  const origin = { x: 20, y: 30, width: 612, height: 792 }
  const maskCase = (
    shape: 'rect' | 'ellipse',
    rect = { x: 100, y: 500, width: 200, height: 100 }
  ): CompareCase => ({
    name: `${shape} mask`,
    annotation: { type: 'mask', page: 0, rect, shape, dim: 0.5, color: '#102030' },
    region: 'page',
  })
  /** The mask layer is the page's, so each side mounts one in the holder, under the element. */
  const layerSide =
    (create: typeof createMaskLayer) =>
    (el: HTMLElement, a: Annotation, t: PageTransform): void => {
      create(el.parentElement!, el).update(a as MaskAnnotation, t)
    }
  const compare = (c: CompareCase) =>
    comparePaint(c, layerSide(createMaskLayer), layerSide(createReferenceMaskLayer))

  for (const shape of ['rect', 'ellipse'] as const) {
    for (const pageRotate of [0, 90] as const) {
      for (const rotate of [0, 90] as const) {
        for (const [where, extra, rect] of [
          ['a page at the origin', {}, undefined],
          [
            'a page whose box starts at (20, 30)',
            { box: origin },
            { x: 120, y: 530, width: 200, height: 100 },
          ],
          ['a page with /UserUnit 2', { userUnit: 2 }, undefined],
          [
            'a page with box (20, 30) and /UserUnit 2',
            { box: origin, userUnit: 2 },
            { x: 120, y: 530, width: 200, height: 100 },
          ],
        ] as const) {
          it(`${shape} mask on ${where} at page rotate ${pageRotate} and view rotate ${rotate}`, async () => {
            const r = await compare({
              ...maskCase(shape, rect),
              ...extra,
              pageRotate,
              rotate,
            })
            expect(r.referenceInk).toBeGreaterThan(0)
            expect(r.differing).toBeLessThanOrEqual(0.005)
          })
        }
      }
    }
  }

  it('a mask at zoom 2 and zoom 0.5', async () => {
    for (const shape of ['ellipse', 'rect'] as const) {
      for (const zoom of [2, 0.5] as const) {
        const r = await compare({ ...maskCase(shape), zoom })
        expect(r.referenceInk, `${shape} at ${zoom}`).toBeGreaterThan(0)
        expect(r.differing).toBeLessThanOrEqual(0.005)
      }
    }
  })

  it('the harness sees a mask layer that is missing', async () => {
    const r = await comparePaint(
      maskCase('rect'),
      () => undefined,
      layerSide(createReferenceMaskLayer)
    )
    expect(r.differing).toBe(1)
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
    ['rect mask', { type: 'mask', ...stamp, shape: 'rect' }],
    ['elliptical mask', { type: 'mask', ...stamp, shape: 'ellipse', dim: 0.3 }],
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

describe('loupe and mask chrome against the reference', () => {
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
    0
  )
  const add = (input: CompareCase['annotation']): Annotation =>
    createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    }).add(input)
  const rect = { x: 100, y: 600, width: 80, height: 80 }

  /** Whether each point (CSS px into an element sized like `a`) lands on something inside it. */
  async function hits(
    a: Annotation,
    render: typeof renderAnnotationContent,
    points: readonly (readonly [number, number])[]
  ): Promise<boolean[]> {
    const { default: themeCss } = await import('@inkbar/theme/theme.css?inline')
    const style = document.createElement('style')
    style.textContent = themeCss
    const box = annotationBox(a, t)
    const host = document.createElement('div')
    host.style.cssText = 'position:absolute;left:0;top:0;'
    const el = document.createElement('div')
    el.className = 'ink-annotation'
    el.dataset.annotation = a.id
    el.dataset.type = a.type
    el.style.cssText = `position:absolute;pointer-events:none;left:0;top:0;width:${box.width}px;height:${box.height}px;`
    host.append(el)
    document.head.append(style)
    document.body.append(host)
    try {
      render(el, a, t)
      return points.map(([x, y]) => {
        const target = document.elementFromPoint(x, y)
        return target !== null && el.contains(target) && target !== el
      })
    } finally {
      host.remove()
      style.remove()
    }
  }

  it('a loupe: a rim, then a transparent circle over the lens, and presses land where they did', async () => {
    const a = add({ type: 'loupe', page: 0, rect, width: 2, opacity: 0.7 })
    const painted = document.createElement('div')
    renderAnnotationContent(painted, a, t)
    const svg = painted.querySelector('svg')!
    expect(svg.getAttribute('opacity')).toBe('0.7')
    const [rim, hit, ...rest] = [...svg.children]
    expect(rest).toHaveLength(0)
    // The rim is the reference's circle, except that its middle takes presses through `hit`.
    const reference = document.createElement('div')
    renderReferenceContent(reference, a, t)
    const old = shape(reference.querySelector('circle')!) as {
      attrs: Record<string, string>
    }
    const drawn = shape(rim!) as { attrs: Record<string, string> }
    expect({ ...drawn.attrs, fill: 'transparent', 'pointer-events': undefined }).toEqual({
      ...old.attrs,
      'pointer-events': undefined,
    })
    expect(drawn.attrs.fill).toBe('none')
    expect(hit!.tagName).toBe('circle')
    expect(hit!.getAttribute('r')).toBe('80')
    expect(hit!.getAttribute('fill')).toBe('transparent')
    expect(hit!.getAttribute('pointer-events')).toBe('all')
    expect(hit!.classList.contains('ink-loupe-rim')).toBe(false)

    const box = annotationBox(a, t)
    const points = [
      [box.width / 2, box.height / 2],
      [box.width / 2, 3],
      [box.width / 2, box.height - 3],
      [2, 2],
      [box.width - 2, box.height - 2],
    ] as const
    const pressed = await hits(a, renderAnnotationContent, points)
    expect(pressed).toEqual(await hits(a, renderReferenceContent, points))
    expect(pressed).toEqual([true, true, true, false, false])
  })

  it('a 200 x 100 loupe takes presses at its centre and not at its corners, as the reference did', async () => {
    const a = add({
      type: 'loupe',
      page: 0,
      rect: { x: 100, y: 600, width: 200, height: 100 },
      width: 2,
    })
    const box = annotationBox(a, t)
    const points = [
      [box.width / 2, box.height / 2],
      [2, 2],
      [box.width - 2, box.height - 2],
    ] as const
    const pressed = await hits(a, renderAnnotationContent, points)
    expect(pressed).toEqual(await hits(a, renderReferenceContent, points))
    expect(pressed).toEqual([true, false, false])
  })

  it('a loupe with no border still takes presses on its lens and draws no rim', async () => {
    const a = add({ type: 'loupe', page: 0, rect, width: 0 })
    const box = annotationBox(a, t)
    expect(
      await hits(a, renderAnnotationContent, [
        [box.width / 2, box.height / 2],
        [2, 2],
      ])
    ).toEqual([true, false])
  })

  for (const shapeName of ['rect', 'ellipse'] as const) {
    it(`a ${shapeName} mask: an empty svg and the edge band, pressed where it was`, async () => {
      const a = add({
        type: 'mask',
        page: 0,
        rect: { x: 100, y: 500, width: 200, height: 100 },
        shape: shapeName,
      })
      const painted = document.createElement('div')
      renderAnnotationContent(painted, a, t)
      // Nothing in the element is the dimming (the page's layer draws it): only the band.
      expect(painted.querySelectorAll('svg')).toHaveLength(1)
      expect(painted.querySelector('svg')!.children).toHaveLength(1)
      expect(painted.querySelector('path')).toBeNull()
      const box = annotationBox(a, t)
      const points = [
        [3, box.height / 2],
        [box.width / 2, 3],
        [box.width - 3, box.height / 2],
        [box.width / 2, box.height / 2],
        [box.width / 2, box.height / 2 + 30],
        [10, 10],
        [20, 20],
      ] as const
      const now = await hits(a, renderAnnotationContent, points)
      expect(now).toEqual(await hits(a, renderReferenceContent, points))
      expect(now.slice(0, 3)).toEqual([true, true, true])
      // Inside the cut-out does not select the mask.
      expect(now[3]).toBe(false)
    })
  }
})

/** What the browser lays out for a text box, from the reference's HTML or the painted SVG. */
interface TextMetrics {
  lines: number
  /** The union of the line boxes, in viewport px. */
  text: { left: number; top: number; right: number; bottom: number }
  /** The box's outer edge, border and stroke included. */
  box: { left: number; top: number; right: number; bottom: number }
}

const edges = (
  r: DOMRect | { left: number; top: number; right: number; bottom: number }
) => ({
  left: r.left,
  top: r.top,
  right: r.right,
  bottom: r.bottom,
})
const union = (rs: readonly DOMRect[]) =>
  edges({
    left: Math.min(...rs.map((r) => r.left)),
    top: Math.min(...rs.map((r) => r.top)),
    right: Math.max(...rs.map((r) => r.right)),
    bottom: Math.max(...rs.map((r) => r.bottom)),
  })
const grow = (r: ReturnType<typeof edges>, by: number) => ({
  left: r.left - by,
  top: r.top - by,
  right: r.right + by,
  bottom: r.bottom + by,
})

function textMetrics(el: HTMLElement, side: 'reference' | 'painted'): TextMetrics {
  let rects: DOMRect[]
  let box: ReturnType<typeof edges>
  const bubble = el.querySelector<SVGPathElement>('path.ink-bubble')
  if (side === 'reference') {
    const div = el.querySelector<HTMLElement>('.ink-free-text')!
    // One rect per character that shows, grouped into lines by their top: spaces that hang at a
    // wrap are in the browser's rects but not in the lines the layout reports.
    const node = div.firstChild as Text
    const lines: DOMRect[][] = []
    for (let i = 0; i < node.length; i++) {
      if (/\s/.test(node.data[i]!)) continue
      const range = document.createRange()
      range.setStart(node, i)
      range.setEnd(node, i + 1)
      const r = range.getBoundingClientRect()
      const line = lines.find((l) => Math.abs(l[0]!.top - r.top) < 1)
      if (line) line.push(r)
      else lines.push([r])
    }
    rects = lines.map((l) => {
      const u = union(l)
      return new DOMRect(u.left, u.top, u.right - u.left, u.bottom - u.top)
    })
    box = bubble
      ? grow(
          edges(bubble.getBoundingClientRect()),
          Number(bubble.getAttribute('stroke-width') ?? 0) / 2
        )
      : edges(div.getBoundingClientRect())
  } else {
    // Left and right at the line's advance, as the HTML's rects are: the SVG text's own bounding
    // box reaches past it by an italic's overhang.
    rects = [...el.querySelectorAll<SVGTextElement>('text')].map((t) => {
      const n = t.getNumberOfChars()
      const ctm = t.getScreenCTM()!
      const from = t.getStartPositionOfChar(0).matrixTransform(ctm)
      const to = t.getEndPositionOfChar(n - 1).matrixTransform(ctm)
      const r = t.getBoundingClientRect()
      return new DOMRect(from.x, r.top, to.x - from.x, r.height)
    })
    const shape = bubble ?? el.querySelector<SVGElement>('[data-ink-part="box"]')!
    box = grow(
      edges(shape.getBoundingClientRect()),
      Number(shape.getAttribute('stroke-width') ?? 0) / 2
    )
  }
  return { lines: rects.length, text: union(rects), box }
}

describe('comparePaint for text boxes', () => {
  const para =
    'The quick brown fox jumps over the lazy dog, and then a second sentence follows it.\nA short line.'
  const plain = {
    type: 'freetext',
    page: 0,
    rect: { x: 100, y: 600, width: 200, height: 90 },
    contents: para,
  } as const
  const withStyle = (
    style: Record<string, unknown>,
    extra: Record<string, unknown> = {}
  ): CompareCase['annotation'] => ({ ...plain, ...extra, defaultStyle: style })
  const cases: CompareCase[] = [
    { name: 'a plain box', annotation: plain },
    ...(['left', 'center', 'right', 'justify'] as const).map(
      (textAlign): CompareCase => ({
        name: `${textAlign} aligned`,
        annotation: withStyle({ textAlign }),
      })
    ),
    { name: 'bold', annotation: withStyle({ fontWeight: 'bold' }) },
    { name: 'italic', annotation: withStyle({ fontStyle: 'italic' }) },
    { name: 'underline', annotation: withStyle({ textDecoration: 'underline' }) },
    {
      name: 'fill and border',
      annotation: {
        ...plain,
        color: '#FFF3B0',
        borderColor: '#B00020',
        width: 2,
      },
    },
    {
      name: 'radius',
      annotation: { ...plain, color: '#CDE7FF', width: 1, cornerRadius: 10 },
    },
    {
      name: 'a standard callout with an open arrow',
      annotation: {
        type: 'freetext',
        page: 0,
        rect: { x: 60, y: 560, width: 240, height: 120 },
        fringe: { left: 80, top: 10, right: 10, bottom: 50 },
        intent: 'FreeTextCallout',
        callout: [
          { x: 70, y: 570 },
          { x: 100, y: 600 },
          { x: 140, y: 625 },
        ],
        head: 'OpenArrow',
        width: 1,
        color: '#FFFFFF',
        contents: 'The quick brown fox jumps over the lazy dog.',
      },
    },
    {
      name: 'a speech bubble',
      annotation: {
        type: 'freetext',
        page: 0,
        // The rect holds the tail too, and the fringe insets it to the box, as a drawn bubble has.
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
    },
  ]
  const where = [
    ['page rotate 0, zoom 1', { pageRotate: 0, zoom: 1 }],
    ['page rotate 0, zoom 2', { pageRotate: 0, zoom: 2 }],
    ['page rotate 90, zoom 1', { pageRotate: 90, zoom: 1 }],
    ['page rotate 90, zoom 2', { pageRotate: 90, zoom: 2 }],
    ['a /UserUnit 2 page', { userUnit: 2, zoom: 1 }],
  ] as const

  /** The fonts this machine has: whether its Latin faces are the ones the width tables describe. */
  const fonts = checkTextFonts()

  /** What one rendering of a case measured. */
  interface Evaluated {
    drawn: CompareResult
    aligned: CompareResult
    reference: TextMetrics
    painted: TextMetrics
    /** The largest relative gap between a drawn line's natural advance and the width it is set to. */
    advanceError: number
  }

  /** A change to the painted text, made after it is placed, for the controls. */
  type Mutate = (el: HTMLElement) => void

  /**
   * Draws `c` both ways. The painted text sits at the file's fractional baseline, and the HTML at
   * the whole-pixel one Chrome picks, so the first lines are up to a pixel apart. Both are compared
   * as they are (`drawn`), and again with the painted text moved onto the HTML baseline
   * (`aligned`), which leaves what the glyph shapes and positions do. `mutate` changes the painted
   * side last.
   */
  async function evaluate(
    c: CompareCase,
    extra: Partial<CompareCase>,
    mutate?: Mutate
  ): Promise<Evaluated> {
    const seen: Partial<Record<'reference' | 'painted', TextMetrics>> = {}
    let advanceError = 0
    let bands: { left: number; top: number; width: number; height: number }[] = []
    const run = async (align: boolean) => {
      bands = []
      return comparePaint(
        { ...c, ...extra },
        (el, a, t) => {
          renderAnnotationContent(el, a, t)
          seen.painted = textMetrics(el, 'painted')
          if (align) {
            const dy = seen.reference!.text.top - seen.painted.text.top
            el.querySelector('g[data-ink-part="text"]')?.setAttribute(
              'transform',
              `translate(0 ${dy})`
            )
          }
          mutate?.(el)
          advanceError = 0
          for (const text of el.querySelectorAll<SVGTextElement>('text[textLength]')) {
            // The line's natural advance, with nothing forcing it to the width it is set to.
            const clone = text.cloneNode(true) as SVGTextElement
            clone.removeAttribute('textLength')
            clone.removeAttribute('lengthAdjust')
            text.parentElement!.append(clone)
            const natural = clone.getComputedTextLength()
            clone.remove()
            const set = Number(text.getAttribute('textLength'))
            advanceError = Math.max(advanceError, Math.abs(natural - set) / set)
            // Where an underline would be: below the baseline, along the line.
            const ctm = text.getScreenCTM()!
            const from = text.getStartPositionOfChar(0).matrixTransform(ctm)
            const size = Number(text.getAttribute('font-size'))
            bands.push({
              left: from.x,
              top: from.y + 0.04 * size,
              width: set,
              height: 0.2 * size,
            })
          }
        },
        (el, a, t) => {
          renderReferenceContent(el, a, t)
          seen.reference = textMetrics(el, 'reference')
        },
        () => bands
      )
    }
    const drawn = await run(false)
    const aligned = await run(true)
    return {
      drawn,
      aligned,
      reference: seen.reference!,
      painted: seen.painted!,
      advanceError,
    }
  }

  const deltas = (e: Evaluated, k: 'text' | 'box') =>
    (['left', 'top', 'right', 'bottom'] as const).map((edge) =>
      Number((e.painted[k][edge] - e.reference[k][edge]).toFixed(2))
    )

  /** How much of the ink in the underline's band the painted side has, against the reference. */
  const bandRatio = (e: Evaluated): number => {
    const sum = (n: number[]) => n.reduce((a, b) => a + b, 0)
    return sum(e.aligned.bandInk.painted) / Math.max(1, sum(e.aligned.bandInk.reference))
  }

  /** The assertions a real case must pass, as the names of those it fails. */
  function violations(c: CompareCase, e: Evaluated): string[] {
    const out: string[] = []
    if (e.painted.lines !== e.reference.lines) out.push('lines')
    if (deltas(e, 'box').some((d) => Math.abs(d) > 1)) out.push('box')
    const text = deltas(e, 'text')
    if (Math.abs(text[0]!) > 1 || Math.abs(text[2]!) > 1) out.push('text left and right')
    if (Math.abs(text[1]!) > 1.05 || Math.abs(text[3]!) > 1.05)
      out.push('text top and bottom')
    // 0.15 of the ink in either image, blurred, once the baselines are the same. The raw count is
    // higher (0.1 to 0.2 at zoom 2): Chrome hints HTML text and not SVG text.
    // An underline is thinner than the font's own, which the pixels cannot tell from a missing
    // one at this bound, so its band below holds the real check.
    if (e.aligned.differingBlurred > (c.name === 'underline' ? 0.4 : 0.15))
      out.push('pixels')
    // The font's own widths against the table's, where the machine's fonts are the table's.
    if (fonts.mode === 'exact' && e.advanceError > ADVANCE_TOLERANCE) out.push('advance')
    // An underline is a rule in the band under each baseline: about as much ink there as the
    // reference has. The rule is thinner than the font's own, so some difference is expected.
    if (c.name === 'underline') {
      const ratio = bandRatio(e)
      if (ratio < UNDERLINE_BAND[0] || ratio > UNDERLINE_BAND[1]) out.push('underline')
    }
    return out
  }

  /** A line's natural advance against its table width: the real cases are within 0.09%. */
  const ADVANCE_TOLERANCE = 0.002
  /** The painted underline band's ink over the reference's: 1.03 to 1.69 in the real cases (a 0.6 px rule covers two pixel rows at zoom 1), 0.05 with the underline missing. */
  const UNDERLINE_BAND = [0.7, 1.8] as const

  for (const c of cases) {
    for (const [label, extra] of where) {
      it(`${c.name} at ${label}`, async () => {
        const e = await evaluate(c, extra)
        const text = deltas(e, 'text')
        const box = deltas(e, 'box')
        console.log(
          `[text compare] ${c.name} at ${label}: as drawn differing ${e.drawn.differing.toFixed(4)} blurred ${e.drawn.differingBlurred.toFixed(4)}, aligned differing ${e.aligned.differing.toFixed(4)} blurred ${e.aligned.differingBlurred.toFixed(4)}, lines ${e.reference.lines}/${e.painted.lines}, text edges ${JSON.stringify(text)}, box edges ${JSON.stringify(box)}, advance error ${e.advanceError.toFixed(5)}, underline band ${bandRatio(e).toFixed(2)}`
        )
        expect(e.drawn.referenceInk).toBeGreaterThan(0)
        expect(violations(c, e)).toEqual([])
      })
    }
  }

  // Controls: each of these is a defect the comparison is there to catch, made on purpose, and it
  // must fail the assertions the real cases pass. Drawn at zoom 2, where the real margins are
  // smallest.
  describe('the comparison fails for a defect', () => {
    const base = cases.find((c) => c.name === 'a plain box')!
    const underlined = cases.find((c) => c.name === 'underline')!
    const zoom2 = { pageRotate: 0, zoom: 2 } as const
    const setStyle = (t: Element, property: string, value: string) => {
      t.setAttribute(property, value)
      t.setAttribute(
        'style',
        t
          .getAttribute('style')!
          .replace(new RegExp(`${property}:[^;]*`), `${property}:${value}`)
      )
    }
    const controls: [string, CompareCase, Mutate, string[]][] = [
      [
        'bold text drawn against regular',
        base,
        (el) =>
          el.querySelectorAll('text').forEach((t) => setStyle(t, 'font-weight', 'bold')),
        ['advance'],
      ],
      [
        'the Times stack drawn against Helvetica',
        base,
        (el) =>
          el
            .querySelectorAll('text')
            .forEach((t) => setStyle(t, 'font-family', FONT_STACKS.Times)),
        ['advance', 'pixels'],
      ],
      [
        'one line shifted 3 px',
        base,
        (el) =>
          el.querySelectorAll('text')[1]!.setAttribute('transform', 'translate(0 3)'),
        ['pixels'],
      ],
      [
        'the wrong text colour',
        base,
        (el) =>
          el.querySelectorAll('text').forEach((t) => setStyle(t, 'fill', '#ff0000')),
        ['pixels'],
      ],
      [
        'the underline missing',
        underlined,
        (el) => el.querySelectorAll('line').forEach((l) => l.remove()),
        ['underline'],
      ],
    ]
    for (const [name, c, mutate, expected] of controls) {
      it(name, async () => {
        const e = await evaluate(c, zoom2, mutate)
        const found = violations(c, e)
        console.log(
          `[control] ${name}: violations ${JSON.stringify(found)}, blurred ${e.aligned.differingBlurred.toFixed(4)} (bound 0.15), advance error ${e.advanceError.toFixed(5)} (bound ${ADVANCE_TOLERANCE}), underline band ${bandRatio(e).toFixed(2)} (bounds ${UNDERLINE_BAND.join(' to ')})`
        )
        // On a machine whose fonts are not the table's, the advance check does not run.
        for (const v of expected)
          if (v !== 'advance' || fonts.mode === 'exact') expect(found).toContain(v)
        expect(found).not.toEqual([])
      })
    }
  })
})
