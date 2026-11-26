import { FIXTURE_NAMES, fixtureBytes, manifest } from '@inkbar/fixtures'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { openDocument, type InkDocument } from '../model/document'
import { nodeAssets } from '../pdfjs/node-assets'
import { createPdfjsReader } from '../pdfjs/reader'
import { expectSameRead, sandboxView } from '../test-support/sandbox-view'

import { fileScriptsFromEngine, pageScriptsFromEngine } from './scripts'

import type {
  FieldFactsShape,
  FieldGroupFactsShape,
  FieldTreeEntryShape,
  FormFactsShape,
  ScriptFactsShape,
  WidgetFactsShape,
} from './types'
import type { EngineLoader } from '../model/save/saver'
import type { PdfjsDocument } from '../pdfjs/types'
import type { DocumentReader } from '../reader/types'
import type { FixtureName } from '@inkbar/fixtures/urls'

const flag = globalThis as { __INKBAR_READER__?: unknown }

const opened: InkDocument[] = []
afterEach(() => {
  delete flag.__INKBAR_READER__
  vi.restoreAllMocks()
  for (const doc of opened.splice(0)) doc.destroy()
})

/** The script reads asked of the engine. */
let asked: string[] = []
/** The real engine, with each script read it is asked noted in `asked`. */
const noting: EngineLoader = async () => {
  const real = await import('@inkbar/engine')
  return {
    createEngine: async () => {
      const engine = await real.createEngine()
      const opening = engine.open.bind(engine)
      engine.open = async (...args) => {
        const doc = await opening(...args)
        const read = doc.scripts.bind(doc)
        doc.scripts = () => {
          asked.push('scripts')
          return read()
        }
        return doc
      }
      return engine
    },
  }
}

/** `name` opened with the engine reader. */
async function open(name: FixtureName): Promise<InkDocument> {
  flag.__INKBAR_READER__ = 'engine'
  const { password } = manifest[name]
  const doc = await openDocument(await fixtureBytes(name), {
    assets: nodeAssets(),
    engine: noting,
    ...(password === undefined ? {} : { password }),
  })
  opened.push(doc)
  await doc.ready
  expect(doc._reader.kind).toBe('engine')
  return doc
}

/** The file's JavaScript, its pages' actions and the sandbox's fields as `reader` gives them. */
async function scriptsOf(reader: DocumentReader) {
  const pages: Record<string, string[]>[] = []
  for (let page = 0; page < reader.pageCount; page++)
    pages.push(await reader.pageScripts(page))
  return {
    scripts: await reader.scripts(),
    fields: sandboxView(await reader.sandboxFields()),
    pages,
  }
}

describe("the engine reader's scripts", () => {
  it.each(FIXTURE_NAMES.filter((name) => manifest[name].opens))(
    'gives the scripts, page actions and sandbox fields PDF.js gives, on %s',
    async (name) => {
      const engineDoc = await open(name)
      // PDF.js's script reads, which the engine reader must not ask.
      const proto = Object.getPrototypeOf(engineDoc._pdfjs.proxy) as PdfjsDocument
      const pdfjsReads = (
        [
          'hasJSActions',
          'getJSActions',
          'getFieldObjects',
          'getCalculationOrderIds',
        ] as const
      ).map((method) => vi.spyOn(proto, method))
      asked = []
      const engine = await scriptsOf(engineDoc._reader)
      expect(asked.length, 'the engine read the scripts').toBeGreaterThan(0)
      for (const read of pdfjsReads) expect(read).not.toHaveBeenCalled()
      vi.restoreAllMocks()

      // PDF.js's reader over the same PDF.js document.
      const pdfjs = await scriptsOf(
        createPdfjsReader(engineDoc._pdfjs, { measure: undefined })
      )
      expect(engine.pages).toStrictEqual(pdfjs.pages)
      expectSameRead(
        { scripts: engine.scripts, fields: engine.fields },
        { scripts: pdfjs.scripts, fields: pdfjs.fields },
        name,
        'engine'
      )
    }
  )

  it('gives none for a file whose only JavaScript is a page action, as PDF.js does', async () => {
    const doc = await open('script-page-only')
    expect(await doc._reader.scripts()).toBeUndefined()
    expect(await doc._reader.pageScripts(0)).toStrictEqual({
      PageOpen: ["app.alert('page opened')"],
    })
  })
})

const noScripts: ScriptFactsShape = {
  document: [],
  documentActions: {},
  pageActions: [],
  truncated: false,
}

const widgetFacts = (over: Partial<WidgetFactsShape> = {}): WidgetFactsShape => ({
  rect: [0, 0, 10, 10],
  rectOk: true,
  flags: 4,
  hasAppearance: false,
  appearanceStates: [],
  page: 0,
  index: 0,
  objectNumber: 9,
  generation: 0,
  scripts: {},
  ...over,
})

const fieldFacts = (over: Partial<FieldFactsShape> = {}): FieldFactsShape => ({
  name: 'f',
  objectNumber: 9,
  generation: 0,
  origin: 'acroform',
  kind: 'text',
  flags: 0,
  valueKind: 'none',
  defaultValueKind: 'none',
  widgets: [widgetFacts()],
  ...over,
})

/** An entry of `/Kids` or `/Fields` naming object `n`, with `/T` `t` when given. */
const entry = (n: number, t?: string, hasKids = false): FieldTreeEntryShape => ({
  ref: { objectNumber: n, generation: 0 },
  dictionary: true,
  hasKids,
  ...(t === undefined ? {} : { partialName: t }),
})

/** A dictionary with `/Kids`. */
const group = (
  n: number,
  name: string,
  kids: FieldTreeEntryShape[],
  over: Partial<FieldGroupFactsShape> & { field?: number } = {}
): FieldGroupFactsShape => ({
  name,
  objectNumber: n,
  generation: 0,
  kids,
  scripts: {},
  ...over,
})

const formOf = (
  fields: FieldFactsShape[],
  over: Partial<FormFactsShape> = {}
): FormFactsShape => ({
  kind: 'acroform',
  needAppearances: false,
  fields,
  groups: [],
  fieldsRoot: [],
  calculationOrderRefs: [],
  tooLarge: false,
  truncated: false,
  ...over,
})

describe('fileScriptsFromEngine', () => {
  it('reads each document script as PDF.js does: its own source, without NULs, as written', () => {
    const { scripts, hasScripts } = fileScriptsFromEngine(
      {
        ...noScripts,
        // `a`'s action has a /Next; `b` is only NULs; `c` keeps its white space.
        document: [
          { name: 'a', source: 'first()' },
          { name: 'a', source: 'next()' },
          { name: 'b', source: '\0\0' },
          { name: 'c', source: ' c()\0 ' },
          { name: { bytes: new Uint8Array([0xfe, 0xff, 0, 0x64]) }, source: 'd()' },
        ],
      },
      undefined
    )
    expect(hasScripts).toBe(true)
    expect(scripts.document).toStrictEqual([
      { name: 'a', source: 'first()' },
      { name: 'c', source: ' c() ' },
      { name: 'd', source: 'd()' },
    ])
  })

  it("reads the document's actions by PDF.js's event names, trimmed, and only its own open action", () => {
    const { scripts } = fileScriptsFromEngine(
      {
        ...noScripts,
        documentActions: {
          OpenAction: ['open()', 'openNext()'],
          WC: [' close() '],
          WS: ['\0'],
          XX: ['unknown()'],
          ['__proto__']: ['proto()'],
        },
      },
      undefined
    )
    expect(scripts.documentActions).toStrictEqual({
      WillClose: ['close()'],
      OpenAction: ['open()'],
    })
    expect(Object.getPrototypeOf(scripts.documentActions)).toBe(Object.prototype)
  })

  it('keeps a document script named like an event with that event', () => {
    const { scripts } = fileScriptsFromEngine(
      {
        ...noScripts,
        document: [{ name: 'WillSave', source: 'named()' }],
        documentActions: { WS: ['save()'] },
      },
      undefined
    )
    expect(scripts.document).toStrictEqual([])
    expect(scripts.documentActions).toStrictEqual({ WillSave: ['save()', 'named()'] })
  })

  it("has none for a file whose only scripts are its pages'", () => {
    const { hasScripts } = fileScriptsFromEngine(
      { ...noScripts, pageActions: [{ page: 0, scripts: { O: ['open()'] } }] },
      formOf([])
    )
    expect(hasScripts).toBe(false)
  })

  it("counts a field's scripts as PDF.js does: of an object PDF.js builds on its walk of /Fields", () => {
    const scripted = { scripts: { K: ['event.rc = true'] } }
    const has = (
      field: Partial<FieldFactsShape>,
      widget = {},
      over: Partial<FormFactsShape> = {}
    ) =>
      fileScriptsFromEngine(
        noScripts,
        formOf(
          [fieldFacts({ ...field, widgets: [widgetFacts({ ...scripted, ...widget })] })],
          { fieldsRoot: [entry(9, 'f')], ...over }
        )
      ).hasScripts
    expect(has({})).toBe(true)
    // On a widget on no page.
    expect(has({}, { page: -1, index: -1 })).toBe(true)
    // A field /Fields does not reach, or reaches only as a direct entry.
    expect(has({}, {}, { fieldsRoot: [] })).toBe(false)
    expect(has({}, {}, { fieldsRoot: [{ ...entry(9, 'f'), ref: null }] })).toBe(false)
    expect(has({ kind: 'unknown' })).toBe(false)
    expect(has({ kind: 'signature' })).toBe(false)
    // Only NULs, or an additional-action key PDF.js does not read.
    expect(has({}, { scripts: { K: ['\0'] } })).toBe(false)
    expect(has({}, { scripts: { Q: ['x()'] } })).toBe(false)
    // A parent's own script, on its container object.
    expect(
      has(
        { objectNumber: 9 },
        { scripts: {}, objectNumber: 10 },
        {
          fieldsRoot: [entry(8, 'p', true)],
          groups: [group(8, 'p', [entry(9, 'f', true)], { scripts: { Fo: ['f()'] } })],
        }
      )
    ).toBe(true)
  })

  it('walks /Fields as PDF.js does, naming each dictionary by the walk, and names /CO by it', () => {
    const { scripts } = fileScriptsFromEngine(
      noScripts,
      formOf(
        [
          // Its own dictionary is its widget.
          fieldFacts({ name: 'merged' }),
          fieldFacts({
            name: 'kids',
            objectNumber: 20,
            widgets: [
              widgetFacts({ objectNumber: 22 }),
              widgetFacts({ objectNumber: 21, generation: 3 }),
            ],
          }),
          fieldFacts({
            name: 'parent.a',
            objectNumber: 41,
            widgets: [widgetFacts({ objectNumber: 41 })],
          }),
          fieldFacts({
            name: 'link.x',
            objectNumber: 51,
            widgets: [widgetFacts({ objectNumber: 51 })],
          }),
          fieldFacts({ name: 'found', origin: 'recovered', objectNumber: 30 }),
        ],
        {
          fieldsRoot: [
            entry(9, 'merged'),
            entry(20, 'kids', true),
            entry(40, 'parent', true),
            entry(50, 'link', true),
          ],
          groups: [
            group(
              20,
              'kids',
              [entry(22), { ...entry(21), ref: { objectNumber: 21, generation: 3 } }],
              {
                field: 1,
              }
            ),
            group(40, 'parent', [entry(41, 'a')], {
              borderColor: [1, 0, 0],
              rotate: 90,
              page: 0,
              scripts: { K: [' k() '], Q: ['q()'] },
            }),
            group(50, 'link', [entry(51, 'x')], { subtype: 'Link' }),
          ],
          calculationOrderRefs: [
            { objectNumber: 20, generation: 0 },
            null,
            { objectNumber: 9, generation: 0 },
            { objectNumber: 40, generation: 0 },
            { objectNumber: 51, generation: 0 },
          ],
        }
      )
    )
    expect(scripts.fields).toStrictEqual([
      { name: 'merged', widgets: ['9R'] },
      {
        name: 'kids',
        id: '20R',
        widgets: ['22R', '21R3'],
        container: { fullName: 'kids', kids: ['22R', '21R3'], page: -1, rotation: 0 },
      },
      {
        name: 'parent',
        id: '40R',
        widgets: [],
        container: {
          fullName: 'parent',
          kids: ['41R'],
          scripts: { Keystroke: ['k()'] },
          page: 0,
          borderColor: [255, 0, 0],
          rotation: 0,
        },
      },
      { name: 'parent.a', widgets: ['41R'] },
    ])
    expect(scripts.calculationOrderIds).toStrictEqual(['20R', '9R', '40R', '51R'])
    expect(scripts.calculationOrder).toStrictEqual(['kids', 'merged', 'parent'])
  })

  it('names a dictionary without /T by the walk, and keeps an empty /T in a full name', () => {
    const { scripts } = fileScriptsFromEngine(
      noScripts,
      formOf(
        [
          fieldFacts({
            name: 'r',
            objectNumber: 60,
            kind: 'radio',
            widgets: [widgetFacts({ objectNumber: 62 })],
          }),
        ],
        {
          fieldsRoot: [entry(59, '', true)],
          groups: [
            group(59, '', [entry(60, 'r', true)]),
            group(60, 'r', [entry(62)], { field: 0, rotation: 180, rotate: 90 }),
          ],
        }
      )
    )
    expect(scripts.fields).toStrictEqual([
      {
        name: '',
        id: '59R',
        widgets: [],
        container: { fullName: '', kids: ['60R'], page: -1, rotation: 0 },
      },
      {
        name: 'r',
        id: '60R',
        widgets: ['62R'],
        // PDF.js keeps the empty /T above: ".r". /MK /R wins over /Rotate.
        container: { fullName: '.r', kids: ['62R'], page: -1, rotation: 180 },
      },
    ])
  })
})

describe('pageScriptsFromEngine', () => {
  it("gives the page's open and close scripts by PDF.js's names, trimmed", () => {
    const facts: ScriptFactsShape = {
      ...noScripts,
      pageActions: [
        { page: 1, scripts: { O: [' opened() ', '\0'], C: ['closed()'], X: ['x()'] } },
      ],
    }
    expect(pageScriptsFromEngine(facts, 1)).toStrictEqual({
      PageOpen: ['opened()'],
      PageClose: ['closed()'],
    })
    expect(pageScriptsFromEngine(facts, 0)).toStrictEqual({})
  })
})
