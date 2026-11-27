import { fixtureBytes, manifest, type FixtureName } from '@inkbar/fixtures'
import { describe, expect, it } from 'vitest'

import { emptyFormExtras, readFormExtras } from '../../pdf/form-fields'
import { openPdfObjects } from '../../pdf/objects'
import { formFieldsOf } from '../../test-support/form'
import { nodeAssets } from '../../test-support/node-assets'
import { openDocument } from '../document'

import { buildFormFields } from './structure'

import type { FormField } from './types'
import type { FileField, FileWidget } from '../../reader/file'

/** A 10-point widget at the origin, its page and place among the page's annotations given. */
const widget = (
  id: string,
  page: number,
  at: number,
  rest: Partial<FileWidget> = {}
): FileWidget => ({
  id,
  page,
  at,
  rect: [0, 0, 10, 10],
  flags: 0,
  hasAppearance: false,
  actions: {},
  ...rest,
})

/** A field of `kind` over `widgets`. */
const field = (
  name: string,
  kind: FileField['kind'],
  widgets: FileWidget[],
  rest: Partial<FileField> = {}
): FileField => ({ name, kind, flags: 0, widgets, ...rest })

/** Fields built from fields given as a reader reads them. */
const build = (fields: FileField[], extras = emptyFormExtras()) =>
  buildFormFields(fields, extras)

/** Fields built from the fields the engine reader reads in a fixture, by name. */
async function fieldsOf(name: FixtureName): Promise<Map<string, FormField>> {
  return new Map((await formFieldsOf(name)).map((f) => [f.name, f]))
}

describe('buildFormFields', () => {
  it('reads every field type from form-fields', async () => {
    const fields = await fieldsOf('form-fields')
    const types = Object.fromEntries([...fields.values()].map((f) => [f.name, f.type]))
    expect(types).toEqual({
      name: 'text',
      notes: 'text',
      pin: 'text',
      code: 'text',
      auto: 'text',
      locked: 'text',
      email: 'text',
      internal: 'text',
      agree: 'checkbox',
      plan: 'radio',
      shared: 'radio',
      country: 'combo',
      city: 'combo',
      interests: 'list',
      'header.ref': 'text',
      rotated: 'text',
      styled: 'text',
      sig: 'signature',
      sig2: 'signature',
      reset: 'button',
    })
    expect(fields.get('plan')!.options).toEqual([
      { value: 'monthly', label: 'monthly' },
      { value: 'yearly', label: 'yearly' },
    ])
    expect(fields.get('country')!.options).toEqual([
      { value: 'gb', label: 'United Kingdom' },
      { value: 'fr', label: 'France' },
    ])
    expect(fields.get('agree')!.options).toEqual([{ value: 'Yes', label: 'Yes' }])
    expect(fields.get('reset')!.widgets[0]!.action).toEqual({
      kind: 'reset',
      fields: [],
      include: true,
    })
  })

  it('keeps first-widget order', async () => {
    const names = [...(await fieldsOf('form-fields')).keys()]
    expect(names.slice(0, 3)).toEqual(['name', 'notes', 'pin'])
    expect(names.slice(-2)).toEqual(['rotated', 'sig2'])
  })

  it("numbers each widget by its place among its page's annotations", () => {
    // One field's two widgets on page 0 sit either side of another field's and a link.
    const fields = build([
      field('a', 'text', [widget('a1', 0, 0), widget('a2', 0, 3)]),
      field('b', 'text', [widget('b1', 0, 1), widget('b2', 1, 0)]),
      field('c', 'text', [widget('c1', 1, 1)]),
    ])
    const order = Object.fromEntries(
      fields.flatMap((f) => f.widgets.map((w) => [w.id, w.order]))
    )
    expect(order).toEqual({ a1: 0, a2: 3, b1: 1, b2: 0, c1: 1 })
  })

  it('reads flags', async () => {
    const fields = await fieldsOf('form-fields')
    const f = (n: string) => fields.get(n)!
    expect(f('locked').flags.readOnly).toBe(true)
    expect(f('email').flags.required).toBe(true)
    expect(f('internal').flags.noExport).toBe(true)
    expect(f('code').flags.comb && f('code').maxLength === 6).toBe(true)
    expect(f('interests').flags.multiSelect).toBe(true)
    expect(f('city').flags.editable).toBe(true)
    expect(f('notes').flags.multiline).toBe(true)
    expect(f('pin').flags.password && f('pin').maxLength === 4).toBe(true)
    expect(f('name').flags).toEqual({
      readOnly: false,
      required: false,
      noExport: false,
      multiline: false,
      password: false,
      comb: false,
      fileSelect: false,
      doNotSpellCheck: false,
      doNotScroll: false,
      multiSelect: false,
      editable: false,
      radiosInUnison: false,
    })
    expect(f('name').locked).toBe(false)
  })

  it('reads the stored values', async () => {
    const fields = await fieldsOf('form-fields')
    expect(fields.get('name')!.value).toBe('Sam')
    expect(fields.get('agree')!.value).toBe('Off')
    expect(fields.get('country')!.value).toBe('gb')
    expect(fields.get('plan')!.value).toBe('monthly')
    expect(fields.get('shared')!.value).toBe('Off')
    expect(fields.get('interests')!.value).toEqual([])
    expect(fields.get('header.ref')!.value).toBe('REF-0042')
  })

  it('groups widgets of one field', async () => {
    const ref = (await fieldsOf('form-fields')).get('header.ref')!
    expect(ref.widgets.map((w) => w.page)).toEqual([0, 1])
    expect(ref.widgets.map((w) => w.rotation)).toEqual([0, 90])
  })

  it('reads appearance', async () => {
    const fields = await fieldsOf('form-fields')
    expect(fields.get('name')!.widgets[0]!.appearance).toMatchObject({
      font: { family: 'Helvetica' },
      fontSize: 12,
      color: '#000000',
      align: 'left',
    })
    expect(fields.get('notes')!.widgets[0]!.appearance.align).toBe('center')
    expect(fields.get('auto')!.widgets[0]!.appearance.fontSize).toBe(0)
    // Checkboxes and radios say whether the file has their on look; text fields do not.
    expect(fields.get('agree')!.widgets[0]!.appearance.onAppearance).toBe(true)
    expect(fields.get('plan')!.widgets.map((w) => w.appearance.onAppearance)).toEqual([
      true,
      true,
    ])
    expect(fields.get('name')!.widgets[0]!.appearance.onAppearance).toBeUndefined()
  })

  it('reads which appearances the file has', async () => {
    const full = await fieldsOf('form-fields')
    expect(full.get('name')!.widgets[0]!.appearance.fileAppearance).toBe(true)
    expect(full.get('agree')!.widgets[0]!.appearance).toMatchObject({
      onAppearance: true,
      offAppearance: true,
    })
    const bare = await fieldsOf('form-bare-appearances')
    // On, with no /Off look: off, the file draws nothing for it.
    expect(bare.get('agree')!.widgets[0]!.appearance).toMatchObject({
      onAppearance: true,
      offAppearance: false,
    })
    expect(bare.get('note')!.widgets[0]!.appearance.fileAppearance).toBe(false)
  })

  it('reads a /DA font through the resource dictionary', async () => {
    const styled = (await fieldsOf('form-fields')).get('styled')!
    expect(styled.widgets[0]!.appearance).toMatchObject({
      font: { family: 'Times', fontWeight: 'bold' },
      fontSize: 10,
      color: '#0000FF',
    })
  })

  it("reads a field's /TU when its widget is a separate kid", async () => {
    const fields = await fieldsOf('form-fields')
    expect(fields.get('email')!.tooltip).toBe('Email address')
    expect(fields.get('name')!.tooltip).toBeUndefined()
    // The non-terminal `header` has a /TU; it names that node, not `header.ref`.
    expect(fields.get('header.ref')!.tooltip).toBeUndefined()
  })

  it('reads default values as state names', async () => {
    const fields = await fieldsOf('form-fields')
    // PDF.js reports both of shared's states as the export value "A".
    expect(fields.get('shared')!.defaultValue).toBe('1')
    expect(fields.get('plan')!.defaultValue).toBe('yearly')
    expect(fields.get('agree')!.defaultValue).toBe('Off')
  })

  it('keeps rects in user space on a rotated page', async () => {
    const rotated = (await fieldsOf('form-fields')).get('rotated')!
    // The /Rect pdf-lib wrote for { x: 120, y: 600, width: 200, height: 22, rotate: 90 }.
    expect(rotated.widgets[0]!.rect).toEqual({
      x: 97.5,
      y: 599.5,
      width: 23,
      height: 201,
    })
    expect(rotated.widgets[0]!.rotation).toBe(90)
  })

  it('keeps shared export values apart', async () => {
    const shared = (await fieldsOf('form-fields')).get('shared')!
    expect(shared.widgets.map((w) => w.onState)).toEqual(['0', '1'])
    expect(shared.options).toEqual([
      { value: '0', label: 'A' },
      { value: '1', label: 'A' },
    ])
  })

  it('marks scripted and hidden widgets', async () => {
    const fields = await fieldsOf('form-scripted')
    expect(fields.get('qty')!.widgets[0]!.hasScripts).toBe(true)
    expect(fields.get('send')!.widgets[0]!.hasScripts).toBe(false)
    expect(fields.get('extra')!.widgets[0]!.hidden).toBe(true)
    expect(fields.get('site')!.widgets[0]!.action).toEqual({
      kind: 'uri',
      url: 'https://example.com/',
    })
    expect(fields.get('send')!.widgets[0]!.action).toMatchObject({ kind: 'submit' })
    // PDF.js reads a URL out of `app.launchURL(...)`; the script reports that call itself.
    expect(fields.get('link')!.widgets[0]!.action).toBeUndefined()
  })

  it('locks a certificate-signed field and everything under DocMDP P=1', async () => {
    const fields = await fieldsOf('form-signed')
    expect(fields.get('cert')).toMatchObject({ signed: 'certificate', locked: true })
    expect(fields.get('name')!.locked).toBe(true)
  })

  it('locks only the fields a signed /Lock names', async () => {
    const fields = await fieldsOf('form-fieldmdp')
    expect(fields.get('amount')!.locked).toBe(true)
    expect(fields.get('memo')!.locked).toBe(false)
  })

  it('opens a document with fields', async () => {
    const doc = await openDocument(await fixtureBytes('form-fields'), {
      assets: nodeAssets(),
    })
    await expect(doc.ready).resolves.toBeUndefined()
    expect(doc.annotations.list.get()).toEqual([])
    doc.destroy()
  })

  it('reads GoTo actions to explicit and named destinations', async () => {
    const fields = await fieldsOf('form-goto')
    const action = (name: string) => fields.get(name)!.widgets[0]!.action
    expect(action('explicit')).toEqual({ kind: 'goto', page: 2 })
    expect(action('named')).toEqual({ kind: 'goto', page: 2 })
    expect(action('legacy')).toEqual({ kind: 'goto', page: 1 })
    expect(action('missing')).toBeUndefined()
    // A GoTo with JavaScript in its /Next keeps its GoTo, and its widget has scripts.
    expect(action('goto-script')).toEqual({ kind: 'goto', page: 1 })
    expect(fields.get('goto-script')!.widgets[0]!.hasScripts).toBe(true)
    expect(action('scripted')).toBeUndefined()
    expect(fields.get('scripted')!.widgets[0]!.next).toEqual([{ kind: 'goto', page: 2 }])
    expect(fields.get('chain')!.widgets[0]!.next).toEqual([
      { kind: 'uri', url: 'https://example.com/next' },
      { kind: 'goto', page: 1 },
      { kind: 'named', name: 'Print' },
    ])
  })

  it("keeps app.launchURL's new-window flag on a script button's fallback", async () => {
    const fields = await fieldsOf('form-scripted')
    expect(fields.get('link')!.widgets[0]!.fallback).toEqual({
      kind: 'uri',
      url: 'https://example.com/',
      newWindow: true,
    })
  })

  it('opening a document resolves named GoTo destinations', async () => {
    const doc = await openDocument(await fixtureBytes('form-goto'), {
      assets: nodeAssets(),
    })
    await doc.ready
    const named = doc.form.fields.get().find((f) => f.name === 'named')!
    expect(named.widgets[0]!.action).toEqual({ kind: 'goto', page: 2 })
    doc.destroy()
  })

  it('reads NoView with Print as print-only, and NoView alone as hidden', () => {
    const flagged = (id: string, flags: number) =>
      field(id, 'text', [widget(id, 0, 0, { flags })])
    const fields = build([
      flagged('screen', 4),
      flagged('print', 32 | 4),
      flagged('never', 32),
    ])
    const w = (i: number) => fields[i]!.widgets[0]!
    expect([w(0).hidden, w(0).printOnly]).toEqual([false, false])
    expect([w(1).hidden, w(1).printOnly]).toEqual([true, true])
    expect([w(2).hidden, w(2).printOnly]).toEqual([true, false])
  })

  it('drops a /DV that is not one of the options', () => {
    const list = (name: string, dv: string) =>
      field(name, 'list', [widget(`${name}1`, 0, 0)], {
        options: [{ exportValue: 'a', displayValue: 'A' }],
        defaultValue: dv,
      })
    const extras = emptyFormExtras()
    extras.widgets.set('r1', { onState: 'one' })
    extras.widgets.set('r2', { onState: 'two', defaultState: 'three' })
    const fields = new Map(
      build(
        [
          field(
            'pick',
            'radio',
            [
              widget('r1', 0, 0, { onValue: 'one' }),
              widget('r2', 0, 0, { onValue: 'two' }),
            ],
            { value: 'Off', defaultValue: 'three' }
          ),
          list('good', 'a'),
          list('bad', 'z'),
        ],
        extras
      ).map((f) => [f.name, f])
    )
    expect(fields.get('pick')!.defaultValue).toBeUndefined()
    expect(fields.get('good')!.defaultValue).toBe('a')
    expect(fields.get('bad')!.defaultValue).toBeUndefined()
  })
})

describe('a reset naming a field of a kind the reader leaves out', () => {
  it.each([true, false])(
    'keeps that field name, matching no field, with include %s',
    (include) => {
      // The reader leaves out the field `odd`, and gives the reset's reference to its widget as
      // the field's name.
      const fields = build([
        field('reset', 'button', [
          widget('1R', 0, 1, {
            actions: { resetForm: { fields: ['odd'], refs: [], include } },
          }),
        ]),
      ])
      expect(fields.map((f) => f.name)).toEqual(['reset'])
      // Not `fields: []`, which would name every field.
      expect(fields[0]!.widgets[0]!.action).toEqual({
        kind: 'reset',
        fields: ['odd'],
        include,
      })
    }
  )
})

describe('form building across the fixtures', () => {
  const opening = (Object.keys(manifest) as FixtureName[]).filter(
    (n) => manifest[n].opens
  )

  it.each(opening)(
    "builds every fixture's fields from the engine reader's data: %s",
    async (name) => {
      const doc = await openDocument(await fixtureBytes(name), {
        assets: nodeAssets(),
        password: manifest[name].password,
      })
      try {
        await doc.ready
        const reader = doc._reader
        const fields = await reader.form()
        if (fields.length === 0) {
          expect(buildFormFields(fields, emptyFormExtras())).toEqual([])
          return
        }
        // As the document builds them: the extras read from the file's objects, a named
        // destination's page through the reader.
        const extras = await readFormExtras(
          await openPdfObjects(await fixtureBytes(name)),
          fields.flatMap((f) => f.widgets.map((w) => w.id)),
          {
            destinationPage: (dest) =>
              reader.resolveDestination(dest).then(
                (d) => d?.page,
                () => undefined
              ),
          }
        )
        expect(buildFormFields(fields, extras)).toMatchSnapshot()
      } finally {
        doc.destroy()
      }
    },
    30_000
  )
})
