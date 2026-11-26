import { fixtureBytes } from '@inkbar/fixtures'
import { afterEach, describe, expect, it } from 'vitest'

import { openDocument, type InkDocument } from '../model/document'

import { fileScriptsFromPdfjs } from './file-scripts'
import { nodeAssets } from './node-assets'
import { sandboxDocumentActions } from './sandbox'

import type { PdfjsDocument } from './types'
import type { FileScripts } from '../reader/file'
import type { FixtureName } from '@inkbar/fixtures/urls'

const opened: InkDocument[] = []
afterEach(() => {
  for (const doc of opened.splice(0)) doc.destroy()
})

const scriptsOf = async (name: FixtureName): Promise<FileScripts | undefined> => {
  const doc = await openDocument(await fixtureBytes(name), { assets: nodeAssets() })
  opened.push(doc)
  await doc.ready
  expect(doc._reader.kind).toBe('pdfjs')
  return doc._reader.scripts()
}

const none = {
  calculationOrder: [],
  calculationOrderIds: [],
  document: [],
  documentActions: {},
  fields: [],
}

describe("the PDF.js reader's scripts", () => {
  it('names the calculation order and lists the document-level script', async () => {
    const { fields, ...rest } = (await scriptsOf('form-scripted'))!
    expect(rest).toStrictEqual({
      calculationOrder: ['total', 'due'],
      calculationOrderIds: ['15R', '72R'],
      document: [{ name: 'init', source: 'var formReady = true;' }],
      documentActions: {},
    })
    // Each field's own dictionary is the parent of its one widget.
    expect(fields).toHaveLength(18)
    expect(fields[2]).toStrictEqual({
      name: 'total',
      id: '15R',
      widgets: ['16R'],
      container: {
        fullName: 'total',
        kids: ['16R'],
        // The field's own scripts, which its widget also takes.
        scripts: {
          Calculate: ['AFSimple_Calculate("PRD", new Array("qty", "price"))'],
          Format: ['AFNumber_Format(2, 0, 0, 0, "£", true)'],
        },
        page: -1,
        rotation: 0,
      },
    })
  })

  it("reads a file whose only scripts are its fields' as having scripts", async () => {
    expect(await scriptsOf('form-format')).toStrictEqual({
      ...none,
      fields: [
        {
          name: 'amount',
          id: '8R',
          widgets: ['9R'],
          container: {
            fullName: 'amount',
            kids: ['9R'],
            scripts: {
              Format: ['AFNumber_Format(2, 0, 0, 0, "$", true)'],
              Keystroke: ['AFNumber_Keystroke(2, 0, 0, 0, "$", true)'],
            },
            page: -1,
            rotation: 0,
          },
        },
      ],
    })
    const shared = await scriptsOf('form-shared-scripted')
    expect({ ...shared, fields: [] }).toStrictEqual(none)
    expect(shared?.fields.map((f) => f.name)).toEqual(['shared'])
  })

  it("lists a field's widgets in the order its /Kids gives them", async () => {
    const scripts = await scriptsOf('form-scripted-kinds')
    expect(scripts?.fields.find((f) => f.name === 'pick')).toStrictEqual({
      name: 'pick',
      id: '15R',
      widgets: ['17R', '16R'],
      container: { fullName: 'pick', kids: ['17R', '16R'], page: -1, rotation: 0 },
    })
  })

  it('keeps a document-level script whole', async () => {
    expect(await scriptsOf('form-timer')).toStrictEqual({
      ...none,
      fields: [
        {
          name: 'ticker',
          id: '8R',
          widgets: ['9R'],
          container: { fullName: 'ticker', kids: ['9R'], page: -1, rotation: 0 },
        },
        {
          name: 'note',
          id: '12R',
          widgets: ['13R'],
          container: { fullName: 'note', kids: ['13R'], page: -1, rotation: 0 },
        },
      ],
      document: [
        {
          name: 'tick',
          source:
            "var ticking = app.setInterval(\"this.getField('ticker').value = String(Number(this.getField('ticker').value || 0) + 1)\", 50)",
        },
      ],
    })
  })

  it('gives undefined for a file without JavaScript, with or without fields', async () => {
    expect(await scriptsOf('text-simple')).toBeUndefined()
    expect(await scriptsOf('form-fields')).toBeUndefined()
  })

  it('reads a page without actions as none', async () => {
    const doc = await openDocument(await fixtureBytes('form-scripted'), {
      assets: nodeAssets(),
    })
    opened.push(doc)
    await doc.ready
    expect(await doc._reader.pageScripts(0)).toStrictEqual({})
  })

  it('splits the document actions from the scripts and gives the sandbox them back as PDF.js listed them', async () => {
    // As PDF.js lists them: event actions, then the name tree in name order, then the open
    // action. A script named like an event is listed with that event.
    const actions = new Map([
      ['WillSave', ['save()', 'named like an event']],
      ['DidPrint', ['printed()']],
      ['a', ['first()']],
      ['b', ['second()', 'again()']],
      ['OpenAction', ['open()']],
    ])
    const proxy = {
      hasJSActions: () => Promise.resolve(true),
      getFieldObjects: () =>
        Promise.resolve(
          new Map([
            [
              'total',
              [
                {
                  id: '15R',
                  type: '',
                  name: 'total',
                  kidIds: ['16R'],
                  actions: new Map([['Calculate', ['sum()']]]),
                  page: 0,
                  strokeColor: new Uint8ClampedArray([255, 0, 0]),
                  fillColor: null,
                  rotation: 90,
                },
                { id: '16R', type: 'text' },
              ],
            ],
            [
              'twin',
              [
                { id: '20R', type: 'text' },
                { id: '21R', type: 'text' },
              ],
            ],
          ])
        ),
      getCalculationOrderIds: () => Promise.resolve(['21R', '99R', '15R']),
      getJSActions: () => Promise.resolve(actions),
    } as unknown as PdfjsDocument
    const scripts = await fileScriptsFromPdfjs(proxy)
    expect(scripts).toStrictEqual({
      calculationOrder: ['twin', 'total'],
      calculationOrderIds: ['21R', '99R', '15R'],
      document: [
        { name: 'a', source: 'first()' },
        { name: 'b', source: 'second()' },
        { name: 'b', source: 'again()' },
      ],
      documentActions: {
        WillSave: ['save()', 'named like an event'],
        DidPrint: ['printed()'],
        OpenAction: ['open()'],
      },
      // A container's id is kept apart from its widgets'.
      fields: [
        {
          name: 'total',
          id: '15R',
          widgets: ['16R'],
          container: {
            fullName: 'total',
            kids: ['16R'],
            scripts: { Calculate: ['sum()'] },
            page: 0,
            borderColor: [255, 0, 0],
            rotation: 90,
          },
        },
        { name: 'twin', widgets: ['20R', '21R'] },
      ],
    })
    const back = sandboxDocumentActions(scripts!)
    expect(back).toStrictEqual(actions)
    expect([...back!.keys()]).toEqual([...actions.keys()])
    expect(sandboxDocumentActions(none)).toBeNull()
  })
})
