import { describe, expect, it } from 'vitest'

import { staticDefaults } from '../annotations/defaults'
import { UnpaintableError } from '../annotations/drawing/pdf/paint'
import { createAnnotationStore } from '../annotations/store'

import { buildWriteInput, writeFields } from './write-input'

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

  it('rejects a text box it cannot set without a text picture', async () => {
    const list = make([
      {
        type: 'freetext',
        page: 0,
        rect: { x: 100, y: 100, width: 200, height: 40 },
        contents: '你好，世界',
      },
    ])
    await expect(buildWriteInput({ ...base, annotations: list })).rejects.toBeInstanceOf(
      UnpaintableError
    )
  })
})
