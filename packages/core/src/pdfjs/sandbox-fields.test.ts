import { FIXTURE_NAMES, fixtureBytes, manifest } from '@inkbar/fixtures'
import { afterAll, describe, expect, it } from 'vitest'

import { openDocument, type InkDocument } from '../model/document'
import { expectSameRead, sandboxView } from '../test-support/sandbox-view'

import { nodeAssets } from './node-assets'
import { sandboxFieldObjects } from './sandbox-fields'

import type { FileField, FileScripts, FileWidget } from '../reader/file'
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
        name
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

const textField = (format: string[], keystroke?: string[]): FileField => ({
  name: 'when',
  kind: 'text',
  flags: 0,
  value: '',
  widgets: [
    widget({
      actions: {
        scripts: { Format: format, ...(keystroke ? { Keystroke: keystroke } : {}) },
      },
    }),
  ],
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
      textField(['AFDate_FormatEx("dd/mm/yyyy");', 'AFDate_KeystrokeEx("dd/mm/yyyy");'])
    )
    expect(merged).toMatchObject({ datetimeFormat: 'dd/mm/yyyy', hasDatetimeHTML: true })
    // A numbered format names an entry of the standard list.
    expect(
      objectOf(textField(['AFTime_Format(2);', 'AFTime_Keystroke(2);']))
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
        fields: [{ name: 'pick', id: '10R', widgets: ['12R', '11R'] }],
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
})
