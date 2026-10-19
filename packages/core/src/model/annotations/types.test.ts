import { readFileSync } from 'node:fs'

import { Ajv2020 } from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'

import { ANNOTATION_SCHEMA_ID, buildAnnotationSchema } from './schema'
import {
  AnnotationDocumentSchema,
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

const schemaUrl = new URL('../../../schema.json', import.meta.url)

interface PublishedSchema {
  $schema: string
  $id: string
  $defs: Record<string, unknown>
}

function readPublished(): PublishedSchema {
  return JSON.parse(readFileSync(schemaUrl, 'utf8')) as PublishedSchema
}

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
        head: 'closedArrow',
      })
    ).toMatchObject({ head: 'closedArrow' })
    expect(AnnotationSchema.safeParse({ ...shape, dashes: [-1] }).success).toBe(false)
    expect(AnnotationSchema.parse({ ...valid, subject: 'S', intent: 'I' })).toMatchObject(
      { subject: 'S', intent: 'I' }
    )
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

    it('rejects the old top-level text style (strict)', () => {
      expect(AnnotationSchema.safeParse({ ...freetext, fontSize: 12 }).success).toBe(
        false
      )
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
    expect(note.type === 'text' && note.icon).toBe('comment')
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

  it('buckets confidence', () => {
    expect(confidenceBucket(0)).toBe('low')
    expect(confidenceBucket(0.49)).toBe('low')
    expect(confidenceBucket(0.5)).toBe('medium')
    expect(confidenceBucket(0.79)).toBe('medium')
    expect(confidenceBucket(0.8)).toBe('high')
    expect(confidenceBucket(1)).toBe('high')
  })
})

describe('schema.json', () => {
  const annotationRef = `${ANNOTATION_SCHEMA_ID}#/$defs/Annotation`
  const compileAnnotation = () => {
    const ajv = new Ajv2020({ strict: false, validateFormats: false })
    ajv.addSchema(readPublished())
    const validate = ajv.getSchema(annotationRef)
    if (!validate) throw new Error('Annotation definition missing')
    return validate
  }

  it('is exactly what the generator builds, so it cannot go stale', () => {
    expect(readPublished()).toEqual(buildAnnotationSchema())
  })

  it('is a complete published document', () => {
    const onDisk = readPublished()
    expect(onDisk.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(onDisk.$id).toBe(ANNOTATION_SCHEMA_ID)
    expect(onDisk.$defs).toHaveProperty('Annotation')
    expect(onDisk.$defs).toHaveProperty('AnnotationDocument')
  })

  it('validates annotations like the zod schema', () => {
    const validate = compileAnnotation()
    expect(validate(exported)).toBe(true)
    expect(validate({ ...exported, color: 'yellow' })).toBe(false)
    expect(validate({ ...exported, createdAt: 'yesterday' })).toBe(false)
  })

  it('validates a stamp', () => {
    const validate = compileAnnotation()
    const { quads: _quads, ...rest } = exported as typeof exported & { quads?: unknown }
    const stamp = {
      ...rest,
      type: 'stamp',
      imagedata: 'data:image/png;base64,iVBORw0KGgo=',
      rotation: 270,
    }
    expect(validate(stamp)).toBe(true)
    expect(validate({ ...stamp, imagedata: 'http://example.com/a.png' })).toBe(false)
  })

  it('leaves viewer state out of the exported shape', () => {
    const validate = compileAnnotation()
    expect(validate(valid)).toBe(false)
    expect(validate({ ...exported, locked: true })).toBe(false)
  })

  it('accepts arbitrary nested JSON in custom', () => {
    const validate = compileAnnotation()
    const custom = { a: 1, b: { c: [true, null, 'x'] } }
    expect(validate({ ...exported, custom })).toBe(true)
  })

  it('compiles as a document schema and checks the envelope', () => {
    const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(
      readPublished()
    )
    const doc = { format: 'inkbar/annotations', version: 1, annotations: [exported] }
    expect(validate(doc)).toBe(true)
    expect(validate({ ...doc, version: 2 })).toBe(false)
    expect(validate({ ...doc, annotations: [{ ...exported, color: 'yellow' }] })).toBe(
      false
    )
    expect(AnnotationDocumentSchema.safeParse(doc).success).toBe(true)
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
    expect(ok).toHaveLength(11)
  })
})
