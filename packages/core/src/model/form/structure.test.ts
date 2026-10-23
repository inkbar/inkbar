import { fixtureBytes, type FixtureName } from '@inkbar/fixtures'
import { describe, expect, it } from 'vitest'

import { readFormExtras } from '../../pdf/form-fields'
import { openPdfObjects } from '../../pdf/objects'
import { nodeAssets } from '../../pdfjs/node-assets'
import { openDocument } from '../document'

import { buildFormFields } from './structure'

import type { FormField } from './types'
import type { PdfjsAnnotationData } from '../../pdfjs/types'

/** Fields built from the widgets PDF.js reports for an opened fixture, by name. */
async function fieldsOf(name: FixtureName): Promise<Map<string, FormField>> {
  const doc = await openDocument(await fixtureBytes(name), { assets: nodeAssets() })
  await doc.ready
  const raw: { page: number; data: PdfjsAnnotationData }[] = []
  for (let page = 0; page < doc.pages.length; page++) {
    const annots = (await (
      await doc._pdfjs.getPage(page)
    ).getAnnotations()) as PdfjsAnnotationData[]
    for (const data of annots) if (data.subtype === 'Widget') raw.push({ page, data })
  }
  doc.destroy()
  const objs = (await openPdfObjects(await fixtureBytes(name)))!
  const extras = await readFormExtras(
    objs,
    raw.map((r) => r.data.id)
  )
  return new Map(buildFormFields(raw, extras).map((f) => [f.name, f]))
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
    expect(names.at(-1)).toBe('rotated')
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
  })

  it('reads a /DA font through the resource dictionary', async () => {
    const styled = (await fieldsOf('form-fields')).get('styled')!
    expect(styled.widgets[0]!.appearance).toMatchObject({
      font: { family: 'Times', fontWeight: 'bold' },
      fontSize: 10,
      color: '#0000FF',
    })
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
})
