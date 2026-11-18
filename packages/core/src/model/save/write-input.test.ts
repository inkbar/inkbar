import { describe, expect, it } from 'vitest'

import { staticDefaults } from '../annotations/defaults'
import { describeDrawing } from '../annotations/drawing/describe'
import { paintDrawing, UnpaintableError } from '../annotations/drawing/pdf/paint'
import { measureWith, standardMeasure } from '../annotations/drawing/text/measure'
import { createAnnotationStore } from '../annotations/store'

import { AnnotationUnwritable, buildWriteInput, writeFields } from './write-input'

import type { Drawing, TextMeasure } from '../annotations/drawing/types'
import type { SavedData } from '../annotations/saved-data'
import type { Annotation, AnnotationInput } from '../annotations/types'
import type { FormField } from '../form/types'
import type { PageInfo } from '../pages'

function make(inputs: (AnnotationInput | ((made: Annotation[]) => AnnotationInput))[]) {
  let n = 0
  const store = createAnnotationStore({
    mode: { mode: 'uncontrolled' },
    defaults: staticDefaults,
    now: () => '2026-11-17T09:00:00.000Z',
    id: () => `a-${++n}`,
  })
  const made: Annotation[] = []
  for (const input of inputs)
    made.push(store.add(typeof input === 'function' ? input(made) : input))
  return made
}

const page = (index: number): PageInfo => ({
  index,
  box: { x: 0, y: 0, width: 612, height: 792 },
  rotate: 0,
  userUnit: 1,
  width: 612,
  height: 792,
})
const pages = [page(0), page(1)]

const base = { pages, lifted: [], fields: {}, signs: new Map(), helpers: {} }

describe('buildWriteInput', () => {
  it("gives the engine plain data it can clone, even from a host's proxies", async () => {
    // As a framework hands its state over: every object and array behind a Proxy (Vue's
    // `reactive`, Svelte's `$state`), which `structuredClone` refuses.
    const deep = <T>(value: T): T =>
      value !== null && typeof value === 'object'
        ? new Proxy(value, {
            get: (target, key, receiver): unknown =>
              deep(Reflect.get(target, key, receiver) as unknown),
          })
        : value
    const list = make([
      { type: 'square', page: 0, rect: { x: 10, y: 10, width: 50, height: 40 } },
      {
        type: 'text',
        page: 0,
        rect: { x: 100, y: 100, width: 20, height: 20 },
        contents: 'Hi',
      },
    ]).map(deep)
    expect(() => structuredClone(list)).toThrow()
    const input = await buildWriteInput({
      ...base,
      annotations: list,
      fields: deep({ colours: { value: ['red', 'blue'] } }),
    })
    const copy = structuredClone(input)
    expect(copy.annotations).toHaveLength(2)
    expect(copy.annotations![0]!.annotation).toMatchObject({ type: 'square' })
    expect(copy.fields).toEqual({ colours: { value: ['red', 'blue'] } })
    expect(copy.annotations![0]!.appearance!.bounds).toEqual(
      input.annotations![0]!.appearance!.bounds
    )
  })

  it("writes a page's dimming mask first, the rest in list order", async () => {
    const list = make([
      { type: 'square', page: 0, rect: { x: 10, y: 10, width: 50, height: 40 } },
      {
        type: 'mask',
        page: 0,
        shape: 'rect',
        rect: { x: 100, y: 100, width: 50, height: 50 },
      },
      { type: 'circle', page: 1, rect: { x: 10, y: 10, width: 50, height: 40 } },
      {
        type: 'mask',
        page: 0,
        shape: 'rect',
        rect: { x: 100, y: 600, width: 50, height: 50 },
      },
      { type: 'line', page: 0, start: { x: 0, y: 0 }, end: { x: 50, y: 50 } },
    ])
    const input = await buildWriteInput({ ...base, annotations: list })
    expect(input.annotations?.map((w) => [w.page, w.annotation.id])).toEqual([
      [0, 'a-4'],
      [0, 'a-1'],
      [0, 'a-2'],
      [0, 'a-5'],
      [1, 'a-3'],
    ])
  })

  it('writes a reply with no appearance, after its parent', async () => {
    const list = make([
      (): AnnotationInput => ({
        type: 'text',
        page: 0,
        rect: { x: 500, y: 700, width: 20, height: 20 },
        contents: 'A reply',
        inReplyTo: 'a-2',
      }),
      {
        type: 'text',
        page: 0,
        rect: { x: 500, y: 700, width: 20, height: 20 },
        contents: 'A note',
      },
    ])
    const input = await buildWriteInput({ ...base, annotations: list })
    const [parent, reply] = input.annotations!
    expect(parent!.annotation.id).toBe('a-2')
    expect(parent!.appearance).toBeDefined()
    expect(reply!.annotation.id).toBe('a-1')
    expect(reply!.appearance).toBeUndefined()
    expect((JSON.parse(reply!.data) as SavedData).rect).toEqual([500, 700, 520, 720])
  })

  it('removes the lifted file copies', async () => {
    const lifted = [{ page: 0, objectNumber: 12 }]
    const input = await buildWriteInput({ ...base, annotations: [], lifted })
    expect(input.remove).toEqual(lifted)
  })

  it('keeps a signature out of the fields and stores it with its annotation', async () => {
    const [stamp] = make([
      {
        type: 'stamp',
        page: 0,
        subject: 'Signature',
        rect: { x: 72, y: 100, width: 200, height: 40 },
        imagedata:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
    ])
    const formFields = [
      { name: 'sig', type: 'signature' },
      { name: 'name', type: 'text' },
      { name: 'agree', type: 'checkbox' },
      { name: 'colours', type: 'list' },
    ] as FormField[]
    const { fields, signs } = writeFields(
      {
        sig: { value: { signature: stamp!.id } },
        name: { value: 'Ada', text: 'ADA' },
        agree: { value: null },
        colours: { value: null },
      },
      formFields
    )
    expect(fields).toEqual({
      name: { value: 'Ada', text: 'ADA' },
      agree: { value: 'Off' },
      colours: { value: [] },
    })
    const input = await buildWriteInput({ ...base, annotations: [stamp!], fields, signs })
    expect(input.fields).toEqual(fields)
    expect((JSON.parse(input.annotations![0]!.data) as SavedData).signs).toBe('sig')
  })

  it('lays text out with the measure it is given, as the screen does', async () => {
    // Cyrillic is outside the tables: the standard measure charges it half a size a letter,
    // this one a whole size, so the box wraps it into more lines.
    const wide = measureWith((run, _font, size) => [...run].length * size)
    const list = make([
      {
        type: 'freetext',
        page: 0,
        rect: { x: 100, y: 100, width: 200, height: 120 },
        defaultStyle: { textAlign: 'center' },
        contents: 'Привет мир, как дела сегодня',
      },
    ])
    const textPicture = () =>
      Promise.resolve({ png: new Uint8Array([1]), width: 10, ascent: 9, descent: 3 })
    const written = await buildWriteInput({
      ...base,
      annotations: list,
      helpers: { textPicture },
      measure: wide,
    })
    const context = { page: { box: page(0).box, rotate: 0 as const, userUnit: 1 } }
    const appearance = async (measure: TextMeasure) =>
      (
        await paintDrawing(describeDrawing(list[0]!, { ...context, measure })!, {
          page: 0,
          textPicture,
        })
      ).content
    const linesOf = (d: Drawing | undefined) =>
      JSON.stringify(
        d?.items.flatMap((i) =>
          i.kind === 'group'
            ? i.items.flatMap((t) => (t.kind === 'text' ? t.lines : []))
            : []
        )
      )
    expect(written.annotations![0]!.appearance!.content).toEqual(await appearance(wide))
    expect(written.annotations![0]!.appearance!.content).not.toEqual(
      await appearance(standardMeasure)
    )
    // The two measures do lay the text out differently, so the test can tell them apart.
    expect(linesOf(describeDrawing(list[0]!, { ...context, measure: wide }))).not.toBe(
      linesOf(describeDrawing(list[0]!, { ...context, measure: standardMeasure }))
    )
  })

  it('rejects a text box it cannot set without a text picture, naming the annotation', async () => {
    const list = make([
      { type: 'square', page: 0, rect: { x: 10, y: 10, width: 20, height: 20 } },
      {
        type: 'freetext',
        page: 0,
        rect: { x: 100, y: 100, width: 200, height: 40 },
        contents: '你好，世界',
      },
    ])
    const failed = await buildWriteInput({ ...base, annotations: list }).catch(
      (e: unknown) => e
    )
    expect(failed).toBeInstanceOf(AnnotationUnwritable)
    expect((failed as AnnotationUnwritable).annotation).toBe(list[1]!.id)
    expect((failed as AnnotationUnwritable).cause).toBeInstanceOf(UnpaintableError)
  })

  it('gives a drawing with no area a box, and stores that box with it', async () => {
    const [stamp] = make([
      {
        type: 'stamp',
        page: 0,
        subject: 'Approved',
        rect: { x: 300, y: 380, width: 0, height: 40 },
        imagedata:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        opacity: 0.5,
      },
    ])
    const written = await buildWriteInput({ ...base, annotations: [stamp!] })
    const { appearance, data } = written.annotations![0]!
    // 0.01 point wide about the centre; the height it had is kept.
    expect(appearance!.bounds.x).toBeCloseTo(299.995, 6)
    expect(appearance!.bounds.width).toBeCloseTo(0.01, 6)
    expect(appearance!.bounds.y).toBe(380)
    expect(appearance!.bounds.height).toBe(40)
    // The see-through group inside it gets a box too.
    for (const form of Object.values(appearance!.forms ?? {})) {
      expect(form.bounds.width).toBeGreaterThan(0)
      expect(form.bounds.height).toBeGreaterThan(0)
    }
    const { x, y, width, height } = appearance!.bounds
    expect((JSON.parse(data) as { rect: number[] }).rect).toEqual([
      x,
      y,
      x + width,
      y + height,
    ])
  })
})
