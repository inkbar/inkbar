import { readFile } from 'node:fs/promises'

import { fixtureBytes } from '@inkbar/fixtures'
import { beforeAll, describe, expect, test } from 'vitest'

import { engineOver } from '../engine.ts'
import { EngineCore } from '../native/core.ts'
import { loadNative, type NativeModule } from '../native/module.ts'
import { withFunctions } from '../native/testing.ts'

import { InThreadTransport } from './in-thread.ts'
import { serve, type WorkerScope } from './worker-host.ts'
import { createWorkerTransport } from './worker.ts'

import type { Engine } from '../engine.ts'
import type { Native } from '../native/functions.ts'
import type { FromWorker, ToWorker } from '../protocol.ts'

let wasm: Uint8Array
let bytes: Uint8Array

beforeAll(async () => {
  wasm = await readFile(new URL('../../vendor/inkbar-pdfium.wasm', import.meta.url))
  bytes = await fixtureBytes('text-simple')
})

/** A NUL-terminated copy of `text` in module memory, freed with `free`. */
function written(native: NativeModule, text: string): number {
  const encoded = new TextEncoder().encode(text)
  const pointer = native.fn.malloc(encoded.length + 1)
  native.HEAPU8.set(encoded, pointer)
  native.HEAPU8[pointer + encoded.length] = 0
  return pointer
}

/**
 * An engine whose core answers from the module with `change` applied to its functions, over the
 * transport named: in this thread, or through the worker host and the page's worker transport,
 * with every message structured-cloned as `postMessage` would.
 */
async function engineWith(
  transport: 'in-thread' | 'worker',
  change: (native: NativeModule) => Partial<Native>
): Promise<Engine> {
  const native = await loadNative({ wasm })
  const core = new EngineCore(withFunctions(native, { ...native.fn, ...change(native) }))
  if (transport === 'in-thread') return engineOver(new InThreadTransport(core))
  const toHost = new EventTarget()
  const toPage = new EventTarget()
  const scope: WorkerScope = {
    postMessage(message: FromWorker) {
      const data = structuredClone(message)
      queueMicrotask(() => toPage.dispatchEvent(new MessageEvent('message', { data })))
    },
    addEventListener: (
      type: string,
      listener: (event: MessageEvent<ToWorker>) => void
    ) => {
      toHost.addEventListener(type, listener as EventListener)
    },
  }
  serve(scope, () => Promise.resolve(core))
  const worker = Object.assign(toPage, {
    postMessage(message: ToWorker) {
      const data = structuredClone(message)
      queueMicrotask(() => toHost.dispatchEvent(new MessageEvent('message', { data })))
    },
    terminate() {},
  })
  return engineOver(await createWorkerTransport(worker as unknown as Worker, wasm))
}

const FONT = {
  name: 'F',
  fixedPitch: false,
  serif: true,
  italic: false,
  bold: false,
  vertical: false,
  ascent: 0.75,
  descent: -0.25,
  descriptorAscent: 0.7,
  descriptorDescent: 0.2,
  standard: 'Times-Roman',
}

const DEST = {
  page: 0,
  pageRef: [3, 0],
  fit: 'XYZ',
  args: [72, 600, null, null],
  argCount: 3,
  argKinds: ['number', 'number', 'null'],
  argIndirect: false,
  fitKind: 'name',
  pageKind: 'ref',
}

const ANNOT = {
  index: 0,
  subtype: 'Link',
  flags: 4,
  obj: 9,
  generation: 1,
  rectOk: true,
  hasQuads: true,
  quadsOk: false,
}

const LINK = {
  index: 0,
  rect: [0, 0, 10, 10],
  quads: null,
  dest: null,
  destInvalid: true,
  action: { s: 'JavaScript', js: 'app.al', scriptTruncated: true },
  aa: { s: 'URI', uriHex: '', uriKind: null },
}

const pageLinks = (annot: object = ANNOT, link: object = LINK) =>
  JSON.stringify({ annots: [annot], links: [link] })

const nulls = {
  ascent: null,
  descent: null,
  descriptorAscent: null,
  descriptorDescent: null,
  standard: null,
}

describe.each(['in-thread', 'worker'] as const)('over the %s transport', (transport) => {
  /** The first page's text with the font table and cut flag the module is made to give. */
  async function textWith(fontTable: string, truncated = 0) {
    const engine = await engineWith(transport, (native) => ({
      INK_Text_FontTable: () => written(native, fontTable),
      INK_Text_Truncated: () => truncated,
    }))
    try {
      return await (await engine.open(bytes)).pageText(0)
    } finally {
      await engine.destroy()
    }
  }

  async function linksWith(json: string) {
    const engine = await engineWith(transport, (native) => ({
      INK_Links_Page: () => written(native, json),
      INK_Json_Free: (pointer: number) => {
        native.fn.free(pointer)
      },
    }))
    try {
      return await (await engine.open(bytes)).pageLinks(0)
    } finally {
      await engine.destroy()
    }
  }

  async function reportsWith(annots: string, form: string, facts: string) {
    const engine = await engineWith(transport, (native) => ({
      INK_Annots_Page: () => written(native, annots),
      INK_Form: () => written(native, form),
      INK_Doc_Facts: () => written(native, facts),
      INK_Json_Free: (pointer: number) => {
        native.fn.free(pointer)
      },
    }))
    try {
      const doc = await engine.open(bytes)
      return {
        annotations: await doc.pageAnnotations(0),
        form: await doc.formFields(),
        facts: await doc.documentFacts(),
      }
    } finally {
      await engine.destroy()
    }
  }

  test("a file's facts, annotations and form cross with their bytes intact", async () => {
    const bytesOf = { bytes: '00ff' }
    const result = await reportsWith(
      JSON.stringify({
        tabs: 'S',
        annots: [
          {
            index: 0,
            subtype: 'Text',
            rect: null,
            rectOk: false,
            flags: 0,
            hasAppearance: false,
            appearance: null,
            contents: bytesOf,
          },
        ],
        truncated: false,
      }),
      JSON.stringify({
        kind: 'acroform',
        needAppearances: true,
        fields: [
          {
            name: 'f',
            origin: 'recovered',
            kind: 'button',
            flags: 65536,
            valueKind: 'none',
            defaultValueKind: 'none',
            widgets: [
              {
                page: 0,
                annotIndex: 0,
                rect: [0, 0, 1, 1],
                rectOk: true,
                flags: 4,
                hasAppearance: false,
                appearance: null,
                scripts: { A: ['go()'] },
                action: { s: 'URI', uriHex: '6869' },
              },
            ],
          },
        ],
        calculationOrder: [0],
        calculationOrderRefs: [null],
        fieldTreeDepth: 0,
        fieldTreeRevisits: false,
        tooLarge: false,
        truncated: false,
      }),
      JSON.stringify({ title: bytesOf, encrypted: false, openedAs: 'none' })
    )
    const expected = { bytes: new Uint8Array([0, 255]) }
    expect(result.annotations).toMatchObject({
      tabs: 'S',
      annotations: [{ subtype: 'Text', rect: null, contents: expected }],
    })
    expect(result.form.fields[0]?.widgets[0]).toMatchObject({
      scripts: { A: ['go()'] },
      action: { kind: 'URI', uri: new TextEncoder().encode('hi') },
    })
    expect(result.facts).toEqual({ title: expected, encrypted: false, openedAs: 'none' })
  })

  test('a document facts report the module cannot give at open rejects it', async () => {
    const engine = await engineWith(transport, () => ({ INK_Doc_Facts: () => 0 }))
    try {
      await expect(engine.open(bytes)).rejects.toMatchObject({ code: 'engine-failure' })
    } finally {
      await engine.destroy()
    }
  })

  test('a page, form or facts report the module cannot give rejects with engine-failure', async () => {
    let facts = true
    const engine = await engineWith(transport, (native) => ({
      INK_Annots_Page: () => 0,
      INK_Form: () => 0,
      // The open reads the facts; later reads get none.
      INK_Doc_Facts: (doc: number) => (facts ? native.fn.INK_Doc_Facts(doc) : 0),
    }))
    try {
      const doc = await engine.open(bytes)
      facts = false
      await expect(doc.pageAnnotations(0)).rejects.toMatchObject({
        code: 'engine-failure',
      })
      await expect(doc.formFields()).rejects.toMatchObject({ code: 'engine-failure' })
      await expect(doc.documentFacts()).rejects.toMatchObject({ code: 'engine-failure' })
      // The document still answers.
      expect((await doc.pageInfo(0)).width).toBeGreaterThan(0)
    } finally {
      await engine.destroy()
    }
  })

  test('a write reads no document facts', async () => {
    let reads = 0
    const engine = await engineWith(transport, (native) => ({
      INK_Doc_Facts: (doc: number) => {
        reads++
        return native.fn.INK_Doc_Facts(doc)
      },
    }))
    try {
      const doc = await engine.open(bytes)
      await doc.write({})
      expect(reads).toBe(1)
    } finally {
      await engine.destroy()
    }
  })

  test.each([
    ['annotations', 'pageAnnotations'],
    ['form', 'formFields'],
  ] as const)('malformed %s reject with engine-failure', async (_, call) => {
    const empty = JSON.stringify({ tabs: null, annots: [], truncated: false })
    const form = JSON.stringify({
      kind: 'none',
      needAppearances: false,
      fields: [],
      calculationOrder: [],
      calculationOrderRefs: [],
      fieldTreeDepth: 0,
      fieldTreeRevisits: false,
      tooLarge: false,
      truncated: false,
    })
    const engine = await engineWith(transport, (native) => ({
      INK_Annots_Page: () => written(native, call === 'pageAnnotations' ? '[]' : empty),
      INK_Form: () => written(native, call === 'formFields' ? '{"kind":1}' : form),
      INK_Json_Free: (pointer: number) => {
        native.fn.free(pointer)
      },
    }))
    try {
      const doc = await engine.open(bytes)
      const read = call === 'pageAnnotations' ? doc.pageAnnotations(0) : doc.formFields()
      await expect(read).rejects.toMatchObject({ code: 'engine-failure' })
    } finally {
      await engine.destroy()
    }
  })

  test('font metrics, the standard font and the cut flag cross as the module gives them', async () => {
    const text = await textWith(JSON.stringify([FONT, { ...FONT, ...nulls }]), 1)
    expect(text.truncated).toBe(true)
    expect(text.fontTable).toEqual([FONT, { ...FONT, ...nulls }])
    expect((await textWith(JSON.stringify([FONT]), 0)).truncated).toBe(false)
  })

  test.each([
    ['ascent missing', { ascent: undefined }],
    ['descent a string', { descent: '-0.2' }],
    ['descriptorAscent missing', { descriptorAscent: undefined }],
    ['descriptorDescent a boolean', { descriptorDescent: false }],
    ['standard an unknown name', { standard: 'Arial' }],
    ['standard missing', { standard: undefined }],
    ['standard a number', { standard: 1 }],
  ])('a font table entry with %s rejects with engine-failure', async (_, change) => {
    const error = await textWith(JSON.stringify([{ ...FONT, ...change }])).catch(
      (e: unknown) => e
    )
    expect(error).toMatchObject({
      code: 'engine-failure',
      message: "A page's font table could not be read.",
    })
    // The cause stays in the thread that read the table: it names the key at fault.
    if (transport === 'in-thread')
      expect((error as Error).cause).toMatchObject({
        message: expect.stringMatching(
          new RegExp(`^${Object.keys(change)[0]}: expected`)
        ) as unknown,
      })
  })

  test('a metric that is not finite rejects with engine-failure', async () => {
    // JSON cannot hold Infinity; a number past the float range parses to it.
    await expect(
      textWith(JSON.stringify([FONT]).replace('0.75', '1e999'))
    ).rejects.toMatchObject({ code: 'engine-failure' })
  })

  test.each([2, -1])('a cut flag of %s rejects with engine-failure', async (flag) => {
    await expect(textWith(JSON.stringify([FONT]), flag)).rejects.toMatchObject({
      code: 'engine-failure',
    })
  })

  test('the new link facts cross as the module gives them', async () => {
    const { annotations, links } = await linksWith(pageLinks())
    expect(annotations).toEqual([
      {
        index: 0,
        subtype: 'Link',
        flags: 4,
        objectNumber: 9,
        generation: 1,
        rectOk: true,
        hasQuads: true,
        quadsOk: false,
      },
    ])
    expect(links).toEqual([
      {
        index: 0,
        rect: { x: 0, y: 0, width: 10, height: 10 },
        destinationInvalid: true,
        action: { kind: 'JavaScript', script: 'app.al', scriptTruncated: true },
        additionalAction: { kind: 'URI', uri: new Uint8Array(0) },
      },
    ])
    const remote = await linksWith(
      pageLinks(ANNOT, {
        ...LINK,
        dest: DEST,
        destInvalid: null,
        action: {
          s: 'GoToR',
          fileHex: '612e706466',
          fileKind: 'spec',
          dest: DEST,
          newWindow: null,
        },
        aa: { s: 'URI', uriHex: '78', uriKind: 'name' },
      })
    )
    const destination = {
      page: 0,
      pageRef: { objectNumber: 3, generation: 0 },
      fit: 'XYZ',
      args: [72, 600, null, null],
      argCount: 3,
      argKinds: ['number', 'number', 'null'],
      argIndirect: false,
      fitKind: 'name',
      pageKind: 'ref',
    }
    expect(remote.links[0]).toEqual({
      index: 0,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      destination,
      action: {
        kind: 'GoToR',
        file: new TextEncoder().encode('a.pdf'),
        fileKind: 'spec',
        destination,
      },
      additionalAction: {
        kind: 'URI',
        uri: new TextEncoder().encode('x'),
        uriKind: 'name',
      },
    })
  })

  test.each([
    ['hasQuads missing', pageLinks({ ...ANNOT, hasQuads: undefined })],
    ['generation a string', pageLinks({ ...ANNOT, generation: '0' })],
    ['destInvalid false', pageLinks(ANNOT, { ...LINK, destInvalid: false })],
    [
      'scriptTruncated 1',
      pageLinks(ANNOT, { ...LINK, action: { ...LINK.action, scriptTruncated: 1 } }),
    ],
    [
      'an unknown uriKind',
      pageLinks(ANNOT, { ...LINK, aa: { ...LINK.aa, uriKind: 'text' } }),
    ],
    [
      'an unknown fileKind',
      pageLinks(ANNOT, {
        ...LINK,
        action: { s: 'Launch', fileHex: null, fileKind: 'path' },
      }),
    ],
    [
      'an unknown fitKind',
      pageLinks(ANNOT, { ...LINK, destInvalid: null, dest: { ...DEST, fitKind: 'int' } }),
    ],
    [
      'an unknown pageKind',
      pageLinks(ANNOT, {
        ...LINK,
        destInvalid: null,
        dest: { ...DEST, pageKind: 'ind' },
      }),
    ],
    [
      'an unknown argKind',
      pageLinks(ANNOT, {
        ...LINK,
        destInvalid: null,
        dest: { ...DEST, argKinds: ['number', 'number', 'string'] },
      }),
    ],
    [
      'argCount missing',
      pageLinks(ANNOT, {
        ...LINK,
        destInvalid: null,
        dest: { ...DEST, argCount: undefined },
      }),
    ],
    [
      'argIndirect missing',
      pageLinks(ANNOT, {
        ...LINK,
        destInvalid: null,
        dest: { ...DEST, argIndirect: undefined },
      }),
    ],
    [
      'a pageRef with a negative number',
      pageLinks(ANNOT, {
        ...LINK,
        destInvalid: null,
        dest: { ...DEST, pageRef: [-3, 0] },
      }),
    ],
  ])('links with %s reject with engine-failure', async (_, json) => {
    await expect(linksWith(json)).rejects.toMatchObject({ code: 'engine-failure' })
  })
})
