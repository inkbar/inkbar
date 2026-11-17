import { describe, expect, it } from 'vitest'

import { oneOfEveryType } from '../../test-support/annotations'

import { staticDefaults } from './defaults'
import { liftable, savedDataFor, type SavedData } from './saved-data'
import { createAnnotationStore } from './store'

import type { Annotation, AnnotationInput } from './types'
import type { Rect } from '../geometry'

const NOW = '2026-11-17T10:45:15.250Z'

function complete(input: AnnotationInput): Annotation {
  let n = 0
  const store = createAnnotationStore({
    mode: { mode: 'uncontrolled' },
    defaults: staticDefaults,
    now: () => NOW,
    id: () => `id-${++n}`,
  })
  return store.add(input)
}

/** The /M the engine writes for `iso`: the same wall time and offset, seconds kept, fraction dropped. */
function pdfDate(iso: string): string {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(
      iso
    )!
  const zone = m[7] === 'Z' ? 'Z' : `${m[7]!.slice(0, 3)}'${m[7]!.slice(4)}'`
  return `D:${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}${m[6]}${zone}`
}

const corners = (r: Rect): [number, number, number, number] => [
  r.x,
  r.y,
  r.x + r.width,
  r.y + r.height,
]

/** An appearance's bounds a little larger than the annotation, as a stroke pads it. */
const boundsOf = (a: Annotation): Rect => ({
  x: a.rect.x - 1.5,
  y: a.rect.y - 1.5,
  width: a.rect.width + 3,
  height: a.rect.height + 3,
})

/** The file's view of an annotation written with `bounds`. */
const fileFor = (a: Annotation, bounds: Rect = boundsOf(a)) => ({
  rect: corners(bounds),
  modified: pdfDate(a.modifiedAt),
  page: a.page,
})

const samples: Annotation[] = [
  ...oneOfEveryType().map(complete),
  complete({
    type: 'ink',
    page: 0,
    inklist: [
      [
        { x: 10, y: 10 },
        { x: 20, y: 30 },
      ],
    ],
    pressure: [[0.25, 0.75]],
  }),
  complete({
    type: 'freetext',
    page: 0,
    rect: { x: 10, y: 10, width: 100, height: 20 },
    contents: 'Bordered',
    borderColor: '#336699',
    width: 1,
  }),
  complete({
    type: 'loupe',
    page: 1,
    rect: { x: 50, y: 50, width: 80, height: 80 },
    magnification: 3,
  }),
  complete({
    type: 'mask',
    page: 2,
    rect: { x: 50, y: 50, width: 80, height: 40 },
    shape: 'ellipse',
    dim: 0.7,
  }),
]

describe('savedDataFor and liftable', () => {
  it.each(samples.map((a) => [a.type, a] as const))(
    'a %s comes back as it was saved',
    (_type, a) => {
      const lifted = liftable(savedDataFor(a, boundsOf(a)), fileFor(a))
      expect(lifted).toEqual({ annotation: a })
    }
  )

  it('covers ink with pressure, a loupe, a mask and a text box with a border colour', () => {
    expect(samples.some((a) => a.type === 'ink' && a.pressure)).toBe(true)
    expect(samples.some((a) => a.type === 'loupe')).toBe(true)
    expect(samples.some((a) => a.type === 'mask')).toBe(true)
    expect(samples.some((a) => a.type === 'freetext' && a.borderColor)).toBe(true)
  })

  it('stores the annotation as a Gloss file writes it', () => {
    const loupe = samples.filter((a) => a.type === 'loupe').at(-1)!
    const data = JSON.parse(savedDataFor(loupe, boundsOf(loupe))) as SavedData
    expect(data.v).toBe(1)
    expect(data.annotation.type).toBe('circle')
    expect(data.annotation.custom).toEqual({
      inkbar: { type: 'loupe', magnification: 3 },
    })
    expect(data.annotation).not.toHaveProperty('source')
    expect(data.rect).toEqual(corners(boundsOf(loupe)))
    expect(data).not.toHaveProperty('signs')
  })

  it('carries the signature field an annotation signs', () => {
    const stamp = samples.find((a) => a.type === 'stamp')!
    const json = savedDataFor(stamp, boundsOf(stamp), 'sig')
    expect((JSON.parse(json) as SavedData).signs).toBe('sig')
    expect(liftable(json, fileFor(stamp))).toEqual({ annotation: stamp, signs: 'sig' })
  })

  it("records a reply's own rect, which is what the file gets for it", () => {
    const reply = complete({
      type: 'text',
      page: 0,
      rect: { x: 300, y: 300, width: 20, height: 20 },
      inReplyTo: 'parent',
      contents: 'Agreed',
    })
    const json = savedDataFor(reply, { x: 0, y: 0, width: 1, height: 1 })
    expect((JSON.parse(json) as SavedData).rect).toEqual([300, 300, 320, 320])
    expect(liftable(json, fileFor(reply, reply.rect))).toEqual({ annotation: reply })
    expect(liftable(json, fileFor(reply, { x: 0, y: 0, width: 1, height: 1 }))).toBe(
      undefined
    )
  })

  it("takes the file's page", () => {
    const a = samples[0]!
    const lifted = liftable(savedDataFor(a, boundsOf(a)), { ...fileFor(a), page: 4 })
    expect(lifted?.annotation.page).toBe(4)
  })

  it('leaves out viewer state the stored JSON carries', () => {
    const a = samples[0]!
    const data = JSON.parse(savedDataFor(a, boundsOf(a))) as SavedData
    const json = JSON.stringify({
      ...data,
      annotation: {
        ...data.annotation,
        source: 'pdf',
        locked: true,
        hasAppearance: true,
      },
    })
    expect(liftable(json, fileFor(a))).toEqual({ annotation: a })
  })

  describe('gives undefined', () => {
    const a = samples.find((s) => s.type === 'square')!
    const json = savedDataFor(a, boundsOf(a))
    const data = JSON.parse(json) as SavedData

    it('for broken JSON', () => {
      expect(liftable(json.slice(0, -3), fileFor(a))).toBeUndefined()
      expect(liftable('', fileFor(a))).toBeUndefined()
      expect(liftable('null', fileFor(a))).toBeUndefined()
    })

    it('for another version', () => {
      expect(liftable(JSON.stringify({ ...data, v: 2 }), fileFor(a))).toBeUndefined()
    })

    it('for an annotation that fails the schema', () => {
      const bad = { ...data, annotation: { ...data.annotation, color: 'red' } }
      expect(liftable(JSON.stringify(bad), fileFor(a))).toBeUndefined()
      const { modifiedAt: _m, ...undated } = data.annotation
      expect(
        liftable(JSON.stringify({ ...data, annotation: undated }), fileFor(a))
      ).toBeUndefined()
    })

    it('for a stored rect that is not four numbers', () => {
      const short = { ...data, rect: data.rect.slice(0, 3) }
      expect(liftable(JSON.stringify(short), fileFor(a))).toBeUndefined()
      const signs = { ...data, signs: 3 }
      expect(liftable(JSON.stringify(signs), fileFor(a))).toBeUndefined()
    })

    it.each([0, 1, 2, 3])('for a /Rect whose number %i moved by 0.02', (i) => {
      const file = fileFor(a)
      const rect = [...file.rect] as typeof file.rect
      rect[i] = rect[i]! + 0.02
      expect(liftable(json, { ...file, rect })).toBeUndefined()
    })

    it('for a later /M', () => {
      expect(
        liftable(json, { ...fileFor(a), modified: 'D:20261117104516Z' })
      ).toBeUndefined()
    })

    it('for a file annotation with no /M, or one that is not a date', () => {
      expect(liftable(json, { ...fileFor(a), modified: undefined })).toBeUndefined()
      expect(liftable(json, { ...fileFor(a), modified: 'yesterday' })).toBeUndefined()
    })
  })

  describe('lifts', () => {
    const a = samples.find((s) => s.type === 'circle')!
    const json = savedDataFor(a, boundsOf(a))

    it('a /Rect off by 0.005', () => {
      const file = fileFor(a)
      const rect = file.rect.map((n, i) =>
        i % 2 ? n - 0.005 : n + 0.005
      ) as typeof file.rect
      expect(liftable(json, { ...file, rect })?.annotation).toEqual(a)
    })

    it('an /M at the same instant in another offset', () => {
      // 10:45:15Z is 11:45:15 at +01:00.
      expect(
        liftable(json, { ...fileFor(a), modified: "D:20261117114515+01'00'" })?.annotation
      ).toEqual(a)
    })
  })
})
