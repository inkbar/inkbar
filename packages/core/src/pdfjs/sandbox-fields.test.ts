import { FIXTURE_NAMES, fixtureBytes, manifest } from '@inkbar/fixtures'
import { afterAll, describe, expect, it } from 'vitest'

import { openDocument, type InkDocument } from '../model/document'
import { expectSameRead, sandboxView } from '../test-support/sandbox-view'

import { nodeAssets } from './node-assets'
import { sandboxFieldObjects } from './sandbox-fields'

import type {
  FileField,
  FileFieldContainer,
  FileScripts,
  FileWidget,
} from '../reader/file'
import type { FixtureName } from '@inkbar/fixtures/urls'

const opened: InkDocument[] = []
afterAll(() => {
  for (const doc of opened.splice(0)) doc.destroy()
})

async function open(name: FixtureName): Promise<InkDocument> {
  const { password } = manifest[name]
  const doc = await openDocument(await fixtureBytes(name), {
    assets: nodeAssets(),
    ...(password === undefined ? {} : { password }),
  })
  opened.push(doc)
  await doc.ready
  expect(doc._reader.kind).toBe('pdfjs')
  return doc
}

describe('the field objects the sandbox is started with', () => {
  it.each(FIXTURE_NAMES.filter((name) => manifest[name].opens))(
    'builds the field objects PDF.js builds, on %s',
    async (name) => {
      const doc = await open(name)
      const reader = doc._reader
      const scripts = await reader.scripts()
      // Without JavaScript the sandbox is never started.
      if (!scripts) return
      const built = sandboxFieldObjects(await reader.form(), scripts)
      const theirs = await reader.sandboxFields()
      expectSameRead(
        { fields: sandboxView(built) },
        { fields: sandboxView(theirs) },
        name,
        'builder'
      )
    }
  )
})

const widget = (over: Partial<FileWidget> = {}): FileWidget => ({
  id: '10R',
  page: 0,
  at: 0,
  rect: [0, 0, 100, 20],
  flags: 4,
  hasAppearance: true,
  actions: {},
  ...over,
})

const scriptsFor = (
  fields: readonly FileField[],
  over: Partial<FileScripts> = {}
): FileScripts => ({
  calculationOrder: [],
  calculationOrderIds: [],
  document: [],
  documentActions: {},
  fields: fields.map((f) => ({ name: f.name, widgets: f.widgets.map((w) => w.id) })),
  ...over,
})

/** A text field with `format` and `keystroke` scripts; `merged` when the reader merged them. */
const textField = (
  format: string[],
  keystroke?: string[],
  merged = false
): FileField => ({
  name: 'when',
  kind: 'text',
  flags: 0,
  value: '',
  widgets: [
    widget({
      actions: {
        scripts: { Format: format, ...(keystroke ? { Keystroke: keystroke } : {}) },
        ...(merged ? { keystrokeInFormat: true as const } : {}),
      },
    }),
  ],
})

const container = (kids: string[], over: Partial<FileFieldContainer> = {}) => ({
  fullName: 'c',
  kids,
  page: -1,
  rotation: 0,
  ...over,
})

const objectOf = (field: FileField): Record<string, unknown> => {
  const objects = sandboxFieldObjects([field], scriptsFor([field]))
  return objects!.get(field.name)![0] as Record<string, unknown>
}

describe('sandboxFieldObjects', () => {
  it('gives null for a form with no fields', () => {
    expect(sandboxFieldObjects([], scriptsFor([]))).toBeNull()
  })

  it('reads a date or time format as PDF.js does, its number from the standard list', () => {
    // One date keystroke and one format, merged by the reader into Format: PDF.js's date input.
    const merged = objectOf(
      textField(
        ['AFDate_FormatEx("dd/mm/yyyy");', 'AFDate_KeystrokeEx("dd/mm/yyyy");'],
        undefined,
        true
      )
    )
    expect(merged).toMatchObject({ datetimeFormat: 'dd/mm/yyyy', hasDatetimeHTML: true })
    // The same two scripts written in the file as one Format chain: no date input.
    expect(
      objectOf(
        textField(['AFDate_FormatEx("dd/mm/yyyy");', 'AFDate_FormatEx("mm/dd/yyyy");'])
      )
    ).toMatchObject({ datetimeFormat: 'dd/mm/yyyy', hasDatetimeHTML: false })
    // A numbered format names an entry of the standard list.
    expect(
      objectOf(textField(['AFTime_Format(2);', 'AFTime_Keystroke(2);'], undefined, true))
    ).toMatchObject({ datetimeFormat: 'HH:MM:ss', hasDatetimeHTML: true })
    expect(objectOf(textField(['AFDate_FormatEx("12");']))).toMatchObject({
      datetimeFormat: 'm/d/yy h:MM tt',
    })
    // A number past the list is kept as written.
    expect(objectOf(textField(['AFDate_FormatEx("14");']))).toMatchObject({
      datetimeFormat: '14',
    })
    // A format with a keystroke of its own: the format is read, but no date input.
    const own = objectOf(
      textField(
        ['AFDate_FormatEx("mm/yy");'],
        ['AFNumber_Keystroke(0, 0, 0, 0, "", true)']
      )
    )
    expect(own).toMatchObject({ datetimeFormat: 'mm/yy', hasDatetimeHTML: false })
    const none = objectOf(textField(['AFNumber_Format(2, 0, 0, 0, "", true)']))
    expect(none.datetimeFormat).toBeUndefined()
    expect(none.hasDatetimeHTML).toBe(false)
  })

  it('keeps a field named __proto__ and its event scripts as its own', () => {
    const field: FileField = {
      name: '__proto__',
      kind: 'text',
      flags: 0,
      value: 'x',
      widgets: [widget({ actions: { scripts: { Keystroke: ['event.rc = true'] } } })],
    }
    const view = sandboxView(sandboxFieldObjects([field], scriptsFor([field])))
    expect(view?.map(([name]) => name)).toEqual(['__proto__'])
    expect(view?.[0]?.[1][0]?.actions).toStrictEqual({ Keystroke: ['event.rc = true'] })
  })

  it('gives two dictionaries of one name one after the other, each widget found by its id', () => {
    // Two fields of one name, as a reader may give them apart.
    const first: FileField = {
      name: 'twin',
      kind: 'text',
      flags: 0,
      value: 'a',
      widgets: [widget({ id: '32R', actions: { scripts: { Keystroke: ['k()'] } } })],
    }
    const second: FileField = { ...first, value: 'b', widgets: [widget({ id: '34R' })] }
    const objects = sandboxFieldObjects(
      [first, second],
      scriptsFor([], {
        fields: [
          { name: 'twin', id: '31R', widgets: ['32R'], container: container(['32R']) },
          { name: 'twin', id: '33R', widgets: ['34R'], container: container(['34R']) },
        ],
      })
    )
    expect(
      objects?.get('twin')?.map((o) => {
        const { id, type, value } = o as Record<string, unknown>
        return { id, type, value }
      })
    ).toEqual([
      { id: '31R', type: '' },
      { id: '32R', type: 'text', value: 'a' },
      { id: '33R', type: '' },
      { id: '34R', type: 'text', value: 'b' },
    ])
  })

  it("gives each checkbox widget its own value, and the field's to a widget without one", () => {
    const field: FileField = {
      name: 'flags',
      kind: 'checkbox',
      flags: 0,
      value: 'q',
      widgets: [
        widget({ id: '36R', onValue: 'q', value: 'q' }),
        widget({ id: '37R', onValue: 'r', value: 'Off' }),
        widget({ id: '38R', onValue: 's' }),
      ],
    }
    const objects = sandboxFieldObjects(
      [field],
      scriptsFor([field], { fields: [{ name: 'flags', widgets: ['37R', '36R', '38R'] }] })
    )
    expect(objects?.get('flags')?.map((o) => (o as { value: unknown }).value)).toEqual([
      'Off',
      'q',
      'q',
    ])
  })

  it('hides a widget whose flags say Hidden or NoView', () => {
    const hidden = (flags: number) =>
      objectOf({ name: 'f', kind: 'text', flags: 0, widgets: [widget({ flags })] }).hidden
    expect([hidden(4), hidden(2), hidden(32)]).toEqual([false, true, true])
  })

  it('puts the field dictionary first, then the widgets in the order the field lists them', () => {
    const field: FileField = {
      name: 'pick',
      kind: 'radio',
      flags: 49152,
      value: 'b',
      widgets: [widget({ id: '11R', onValue: 'a' }), widget({ id: '12R', onValue: 'b' })],
    }
    const objects = sandboxFieldObjects(
      [field],
      scriptsFor([field], {
        fields: [
          {
            name: 'pick',
            id: '10R',
            widgets: ['12R', '11R'],
            container: container(['12R', '11R']),
          },
        ],
      })
    )
    expect(
      objects?.get('pick')?.map((o) => {
        const { id, type, exportValues } = o as Record<string, unknown>
        return { id, type, exportValues }
      })
    ).toEqual([
      { id: '10R', type: '' },
      { id: '12R', type: 'radiobutton', exportValues: 'b' },
      { id: '11R', type: 'radiobutton', exportValues: 'a' },
    ])
  })

  it('gives a parent whose kids are fields an object of its own, before them', () => {
    const child: FileField = {
      name: 'total.a',
      kind: 'text',
      flags: 0,
      value: '1',
      widgets: [widget({ id: '11R' })],
    }
    const objects = sandboxFieldObjects(
      [child],
      scriptsFor([], {
        fields: [
          {
            name: 'total',
            id: '10R',
            widgets: [],
            container: container(['11R', '12R3'], {
              fullName: 'total',
              scripts: { Focus: ['f()'] },
              page: 0,
              borderColor: [255, 0, 0],
              rotation: 90,
            }),
          },
          { name: 'total.a', widgets: ['11R'] },
        ],
      })
    )
    expect([...objects!.keys()]).toEqual(['total', 'total.a'])
    expect(objects!.get('total')).toStrictEqual([
      {
        id: '10R',
        actions: { Focus: ['f()'] },
        name: 'total',
        strokeColor: new Uint8ClampedArray([255, 0, 0]),
        fillColor: null,
        type: '',
        kidIds: ['11R', '12R3'],
        page: 0,
        rotation: 90,
      },
    ])
  })
})
