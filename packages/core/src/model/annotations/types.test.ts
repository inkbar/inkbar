import { describe, expect, it } from 'vitest'

import { isKnown, LINE_ENDINGS } from './pdf-names'
import {
  AnnotationSchema,
  confidenceBucket,
  type Annotation,
  type AnnotationInput,
  type PointSchema,
  type QuadSchema,
  type RectSchema,
} from './types'

import type { Point, Quad, Rect } from '../geometry'
import type { z } from 'zod'

const valid: Annotation = {
  id: '0192a3b4-0000-7000-8000-000000000001',
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
  color: '#F2C230',
  opacity: 0.5,
  createdAt: '2026-10-12T12:00:00.000Z',
  modifiedAt: '2026-10-12T12:00:00.000Z',
  source: 'session',
}
const { source: _source, ...exported } = valid

describe('AnnotationSchema', () => {
  it('accepts a valid highlight and rejects a bad colour', () => {
    expect(AnnotationSchema.parse(valid)).toEqual(valid)
    expect(AnnotationSchema.safeParse({ ...valid, color: 'yellow' }).success).toBe(false)
  })

  it('accepts dashes on lines and shapes, keeps them off markup, and takes polyline endings', () => {
    const shape = {
      ...exported,
      source: 'session',
      type: 'square',
      width: 1,
      dashes: [3, 3],
    }
    expect(AnnotationSchema.parse(shape)).toMatchObject({ dashes: [3, 3] })
    expect(
      AnnotationSchema.parse({
        ...shape,
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 5, y: 5 },
      })
    ).toMatchObject({ dashes: [3, 3] })
    // Highlight has no dashes field: the object is not extended, so it never carries them.
    expect(AnnotationSchema.parse({ ...valid, dashes: [3, 3] })).not.toHaveProperty(
      'dashes'
    )
    expect(
      AnnotationSchema.parse({
        ...shape,
        type: 'polyline',
        vertices: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
        head: 'ClosedArrow',
      })
    ).toMatchObject({ head: 'ClosedArrow' })
    expect(AnnotationSchema.safeParse({ ...shape, dashes: [-1] }).success).toBe(false)
    expect(AnnotationSchema.parse({ ...valid, subject: 'S', intent: 'I' })).toMatchObject(
      { subject: 'S', intent: 'I' }
    )
  })

  it('keeps PDF names Inkbar does not know and treats the old spellings as unknown names', () => {
    const line = { ...exported, source: 'session', type: 'line', width: 1 }
    const ends = { start: { x: 0, y: 0 }, end: { x: 5, y: 5 } }
    expect(AnnotationSchema.parse({ ...line, ...ends, head: 'Foo_1' })).toMatchObject({
      head: 'Foo_1',
    })
    const old = AnnotationSchema.parse({
      ...line,
      type: 'polyline',
      vertices: [ends.start, ends.end],
      tail: 'openArrow',
    })
    expect(old).toMatchObject({ tail: 'openArrow' })
    expect(isKnown(LINE_ENDINGS, old.type === 'polyline' ? old.tail! : '')).toBe(false)
    expect(
      AnnotationSchema.safeParse({ ...line, ...ends, head: 'not a name' }).success
    ).toBe(false)
  })

  it('takes a corner radius on squares and rejects a negative one', () => {
    const square = {
      ...exported,
      source: 'session',
      type: 'square',
      width: 1,
      cornerRadius: 8,
    }
    expect(AnnotationSchema.parse(square)).toMatchObject({ cornerRadius: 8 })
    expect(AnnotationSchema.safeParse({ ...square, cornerRadius: -1 }).success).toBe(
      false
    )
  })

  // Fields a type ignores are refused, so a later version can give them a meaning.
  it('refuses a corner radius on a circle and line endings on a polygon', () => {
    const shape = { ...exported, source: 'session', width: 1 }
    const vertices = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]
    expect(
      AnnotationSchema.safeParse({ ...shape, type: 'circle', cornerRadius: 8 }).success
    ).toBe(false)
    expect(AnnotationSchema.safeParse({ ...shape, type: 'circle' }).success).toBe(true)
    for (const end of ['head', 'tail'])
      expect(
        AnnotationSchema.safeParse({
          ...shape,
          type: 'polygon',
          vertices,
          [end]: 'OpenArrow',
        }).success,
        end
      ).toBe(false)
    expect(
      AnnotationSchema.parse({ ...shape, type: 'polyline', vertices, tail: 'OpenArrow' })
    ).toMatchObject({ tail: 'OpenArrow' })
  })

  describe('free text', () => {
    const { quads: _q, color: _c, ...shared } = exported
    const freetext = {
      ...shared,
      source: 'session',
      type: 'freetext',
      contents: 'Hi',
      width: 0,
      defaultStyle: {
        fontFamily: 'Helvetica',
        fontSize: 12,
        color: '#000000',
        textAlign: 'left',
      },
    }

    it('validates without color: an absent fill is no fill', () => {
      expect(AnnotationSchema.safeParse(freetext).success).toBe(true)
      expect(AnnotationSchema.parse(freetext)).not.toHaveProperty('color')
      expect(
        AnnotationSchema.parse({ ...freetext, color: '#FFFF00', borderColor: '#FF0000' })
      ).toMatchObject({ color: '#FFFF00', borderColor: '#FF0000' })
    })

    it('rejects the old top-level text style', () => {
      expect(AnnotationSchema.safeParse({ ...freetext, fontSize: 12 }).success).toBe(
        false
      )
      expect(
        AnnotationSchema.safeParse({ ...freetext, fontFamily: 'Times' }).success
      ).toBe(false)
      expect(AnnotationSchema.safeParse({ ...freetext, align: 'left' }).success).toBe(
        false
      )
      expect(
        AnnotationSchema.safeParse({
          ...freetext,
          defaultStyle: { ...freetext.defaultStyle, align: 'left' },
        }).success
      ).toBe(false)
    })

    // A later version may add fields: they are dropped, as on every other type.
    it('drops keys it does not know, in the box and in its text style', () => {
      const parsed = AnnotationSchema.parse({
        ...freetext,
        lineHeight: 1.4,
        defaultStyle: { ...freetext.defaultStyle, letterSpacing: 2 },
      })
      expect(parsed).not.toHaveProperty('lineHeight')
      expect(parsed).toMatchObject({ defaultStyle: { fontSize: 12 } })
      expect((parsed as { defaultStyle: object }).defaultStyle).not.toHaveProperty(
        'letterSpacing'
      )
    })

    it('takes justify, bold, italic, underline, dashes and a corner radius', () => {
      const parsed = AnnotationSchema.parse({
        ...freetext,
        dashes: [3, 3],
        cornerRadius: 4,
        defaultStyle: {
          ...freetext.defaultStyle,
          textAlign: 'justify',
          fontWeight: 'bold',
          fontStyle: 'italic',
          textDecoration: 'underline',
        },
      })
      expect(parsed).toMatchObject({
        dashes: [3, 3],
        cornerRadius: 4,
        defaultStyle: { textAlign: 'justify', fontWeight: 'bold' },
      })
    })

    it('defaults width, font family, size and alignment', () => {
      const { width: _w, ...noWidth } = freetext
      const parsed = AnnotationSchema.parse({
        ...noWidth,
        defaultStyle: { color: '#000000' },
      })
      expect(parsed).toMatchObject({
        width: 0,
        defaultStyle: {
          fontFamily: 'Helvetica',
          fontSize: 12,
          color: '#000000',
          textAlign: 'left',
        },
      })
    })
  })

  it('requires quads on text markup and interiorColor on redactions', () => {
    const { quads: _q, ...noQuads } = valid
    expect(AnnotationSchema.safeParse(noQuads).success).toBe(false)
    const redact = {
      ...valid,
      type: 'redact',
      quads: undefined,
      origin: 'suggested',
      suggestion: { confidence: 0.4 },
    }
    expect(AnnotationSchema.safeParse(redact).success).toBe(false)
    expect(
      AnnotationSchema.safeParse({ ...redact, interiorColor: '#000000' }).success
    ).toBe(true)
  })

  it('ink pressure must match the inklist shape', () => {
    const ink = {
      ...valid,
      type: 'ink',
      quads: undefined,
      inklist: [
        [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
        [{ x: 9, y: 9 }],
      ],
    }
    expect(AnnotationSchema.safeParse(ink).success).toBe(true)
    expect(
      AnnotationSchema.safeParse({ ...ink, pressure: [[0.2, 0.9], [0.5]] }).success
    ).toBe(true)
    expect(AnnotationSchema.safeParse({ ...ink, pressure: [[0.2], [0.5]] }).success).toBe(
      false
    )
    expect(AnnotationSchema.safeParse({ ...ink, pressure: [[0.2, 0.9]] }).success).toBe(
      false
    )
    expect(
      AnnotationSchema.safeParse({ ...ink, pressure: [[0.2, 1.5], [0.5]] }).success
    ).toBe(false)
  })

  it('applies defaults for note icon and redact origin', () => {
    const note = AnnotationSchema.parse({ ...valid, type: 'text', quads: undefined })
    expect(note.type === 'text' && note.icon).toBe('Note')
    const redact = AnnotationSchema.parse({
      ...valid,
      type: 'redact',
      quads: undefined,
      interiorColor: '#000000',
    })
    expect(redact.type === 'redact' && redact.origin).toBe('user')
  })

  it('preserves custom data without interpreting it', () => {
    const parsed = AnnotationSchema.parse({
      ...valid,
      custom: { caseId: 'abc', nested: { n: 1 } },
    })
    expect(parsed.custom).toEqual({ caseId: 'abc', nested: { n: 1 } })
  })

  describe('stamp', () => {
    const PNG = 'data:image/png;base64,iVBORw0KGgo='
    const stamp = {
      ...valid,
      type: 'stamp',
      quads: undefined,
      imagedata: PNG,
      subject: 'Signature',
    }

    it('validates a stamp with a PNG or JPEG data URL', () => {
      expect(AnnotationSchema.parse(stamp)).toMatchObject({
        type: 'stamp',
        imagedata: PNG,
        subject: 'Signature',
      })
      expect(
        AnnotationSchema.safeParse({ ...stamp, imagedata: 'data:image/jpeg;base64,/9j/' })
          .success
      ).toBe(true)
    })

    it('rejects imagedata that is not a PNG or JPEG data URL', () => {
      for (const imagedata of [
        'http://example.com/signature.png',
        'data:image/svg+xml;base64,PHN2Zz4=',
        'data:image/gif;base64,R0lGOD',
        'data:image/png,raw',
      ])
        expect(
          AnnotationSchema.safeParse({ ...stamp, imagedata }).success,
          imagedata
        ).toBe(false)
      expect(AnnotationSchema.safeParse({ ...stamp, imagedata: undefined }).success).toBe(
        false
      )
    })

    it('takes a rotation in quarter turns only', () => {
      expect(AnnotationSchema.safeParse({ ...stamp, rotation: 90 }).success).toBe(true)
      expect(AnnotationSchema.safeParse({ ...stamp, rotation: 45 }).success).toBe(false)
    })
  })

  describe('loupe', () => {
    const loupe = {
      ...valid,
      type: 'loupe',
      quads: undefined,
      rect: { x: 100, y: 500, width: 72, height: 72 },
    }

    it('defaults magnification to 2 and the rim width to 2', () => {
      expect(AnnotationSchema.parse(loupe)).toMatchObject({
        type: 'loupe',
        magnification: 2,
        width: 2,
      })
    })

    it('takes a magnification above 1 and a non-negative rim width', () => {
      expect(
        AnnotationSchema.safeParse({ ...loupe, magnification: 3.5, width: 0 }).success
      ).toBe(true)
      for (const magnification of [1, 0.5, 0, -2])
        expect(
          AnnotationSchema.safeParse({ ...loupe, magnification }).success,
          String(magnification)
        ).toBe(false)
      expect(AnnotationSchema.safeParse({ ...loupe, width: -1 }).success).toBe(false)
    })
  })

  describe('mask', () => {
    const mask = {
      ...valid,
      type: 'mask',
      quads: undefined,
      shape: 'rect',
      rect: { x: 100, y: 500, width: 200, height: 120 },
    }

    it('defaults dim to 0.5', () => {
      expect(AnnotationSchema.parse(mask)).toMatchObject({
        type: 'mask',
        shape: 'rect',
        dim: 0.5,
      })
    })

    it('takes a rect or ellipse shape and a dim from 0 to 1', () => {
      for (const shape of ['rect', 'ellipse'])
        expect(AnnotationSchema.safeParse({ ...mask, shape }).success, shape).toBe(true)
      for (const dim of [0, 0.25, 1])
        expect(AnnotationSchema.safeParse({ ...mask, dim }).success, String(dim)).toBe(
          true
        )
      for (const dim of [-0.1, 1.1])
        expect(AnnotationSchema.safeParse({ ...mask, dim }).success, String(dim)).toBe(
          false
        )
      expect(AnnotationSchema.safeParse({ ...mask, shape: 'star' }).success).toBe(false)
      expect(AnnotationSchema.safeParse({ ...mask, shape: undefined }).success).toBe(
        false
      )
    })
  })

  it('buckets confidence', () => {
    expect(confidenceBucket(0)).toBe('low')
    expect(confidenceBucket(0.49)).toBe('low')
    expect(confidenceBucket(0.5)).toBe('medium')
    expect(confidenceBucket(0.79)).toBe('medium')
    expect(confidenceBucket(0.8)).toBe('high')
    expect(confidenceBucket(1)).toBe('high')
  })
})

describe('geometry schemas match the geometry types', () => {
  it('are structurally identical (checked at compile time)', () => {
    const p1: Point = {} as z.infer<typeof PointSchema>
    const p2: z.infer<typeof PointSchema> = {} as Point
    const r1: Rect = {} as z.infer<typeof RectSchema>
    const r2: z.infer<typeof RectSchema> = {} as Rect
    const q1: Quad = {} as z.infer<typeof QuadSchema>
    const q2: z.infer<typeof QuadSchema> = {} as Quad
    expect([p1, p2, r1, r2, q1, q2]).toHaveLength(6)
  })
})

describe('AnnotationInput (compile-time)', () => {
  const quads = valid.type === 'highlight' ? valid.quads : []
  const rect: Rect = { x: 0, y: 0, width: 10, height: 10 }

  const accept = (_input: AnnotationInput): void => undefined

  it('accepts minimal inputs and rejects missing or generated keys', () => {
    const ok: AnnotationInput[] = [
      { type: 'highlight', page: 0, quads },
      { type: 'redact', page: 0, rect },
      { type: 'redact', page: 0, quads },
      { type: 'text', page: 0, rect },
      { type: 'freetext', page: 0, rect, contents: 'hi' },
      { type: 'square', page: 0, rect },
      { type: 'line', page: 0, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      {
        type: 'polygon',
        page: 0,
        vertices: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
      { type: 'ink', page: 0, inklist: [[{ x: 0, y: 0 }]] },
      { type: 'highlight', page: 0, quads, id: 'x' },
      { type: 'stamp', page: 0, rect, imagedata: 'data:image/png;base64,AA==' },
    ]
    ok.push({ type: 'loupe', page: 0, rect })
    ok.push({ type: 'loupe', page: 0, rect, magnification: 3, width: 1 })
    ok.push({ type: 'mask', page: 0, rect, shape: 'rect' })
    ok.push({ type: 'mask', page: 0, rect, shape: 'ellipse', dim: 0.8 })
    // @ts-expect-error a mask needs its shape
    accept({ type: 'mask', page: 0, rect })
    // @ts-expect-error a loupe needs its rect
    accept({ type: 'loupe', page: 0 })
    // @ts-expect-error a stamp needs its rect
    accept({ type: 'stamp', page: 0, imagedata: 'data:image/png;base64,AA==' })
    // @ts-expect-error text markup needs quads
    accept({ type: 'highlight', page: 0 })
    // @ts-expect-error redact needs a rect or quads
    accept({ type: 'redact', page: 0 })
    accept({
      type: 'highlight',
      page: 0,
      quads,
      id: 'x',
      // @ts-expect-error generated keys are not accepted
      createdAt: '2026-10-12T12:00:00.000Z',
    })
    // @ts-expect-error a note cannot carry text markup geometry it does not declare
    accept({ type: 'text', page: 0, rect, nope: 1 })
    expect(ok).toHaveLength(15)
  })
})
