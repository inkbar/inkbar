import { fixtureBytes } from '@inkbar/fixtures'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../../pdfjs/node-assets'
import { formFieldsOf } from '../../test-support/form'
import { openDocument, type OpenOptions } from '../document'

import { fieldsFromGloss, fieldsToGloss } from './gloss'

import type { FieldsChange, FieldValues, FormField } from './types'

let fields: FormField[]

beforeAll(async () => {
  fields = await formFieldsOf('form-fields')
})

async function formDoc(options: Partial<OpenOptions> = {}) {
  return openDocument(await fixtureBytes('form-fields'), {
    assets: nodeAssets(),
    ...options,
  })
}

describe('fieldsToGloss', () => {
  it('export includes valued fields and skips no-export', () => {
    const out = fieldsToGloss({ name: 'Sam', internal: 'x', nope: 'y' }, fields)
    expect(out).toEqual({ name: 'Sam' })
  })

  it('export of a multi-select keeps option order', () => {
    const out = fieldsToGloss({ interests: ['poetry', 'maths'] }, fields)
    expect(out.interests).toEqual(['maths', 'poetry'])
  })
})

describe('fieldsFromGloss', () => {
  it('reports unknown, read-only and invalid values', () => {
    const { values, rejected } = fieldsFromGloss(
      {
        name: 'Ada',
        nope: 'x',
        locked: 'y',
        country: 'de',
        sig: { signature: '' },
        plan: 3,
      },
      fields
    )
    expect(values).toEqual({ name: 'Ada' })
    expect(rejected).toEqual([
      { name: 'nope', reason: 'unknown' },
      { name: 'locked', reason: 'readOnly' },
      { name: 'country', reason: 'invalid' },
      { name: 'sig', reason: 'invalid' },
      { name: 'plan', reason: 'invalid' },
    ])
  })

  it('keeps only the signature id of a signature value', () => {
    const { values } = fieldsFromGloss({ sig: { signature: 'a7', extra: 1 } }, fields)
    expect(values).toEqual({ sig: { signature: 'a7' } })
  })

  it('applies nothing from a value that is not a map', () => {
    expect(fieldsFromGloss(undefined, fields)).toEqual({ values: {}, rejected: [] })
  })
})

describe('doc.exportAnnotations and importAnnotations with fields', () => {
  it('export includes valued fields and skips no-export', async () => {
    const doc = await formDoc()
    doc.form.set({ interests: ['poetry', 'maths'] })
    const out = doc.exportAnnotations('json')
    expect(out.fields?.name).toBe('Sam')
    expect(out.fields?.interests).toEqual(['maths', 'poetry'])
    expect(out.fields).not.toHaveProperty('internal')
    expect(out.fields).not.toHaveProperty('city')
    doc.destroy()
  })

  it('export of a document without fields has no fields', async () => {
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    expect(doc.exportAnnotations('json')).not.toHaveProperty('fields')
    doc.destroy()
  })

  it('import applies fields and reports rejections', async () => {
    const doc = await formDoc()
    const result = doc.importAnnotations({
      format: 'gloss',
      version: 1,
      annotations: [],
      fields: { name: 'Ada', interests: ['engines'], nope: 'x' },
    })
    expect(result.fields).toEqual({
      applied: ['name', 'interests'],
      rejected: [{ name: 'nope', reason: 'unknown' }],
    })
    expect(doc.form.get('name')).toBe('Ada')
    expect(doc.form.get('interests')).toEqual(['engines'])
    doc.destroy()
  })

  it('import of a document without fields leaves values alone', async () => {
    const doc = await formDoc()
    doc.form.set({ name: 'Ada' })
    const result = doc.importAnnotations({ format: 'gloss', version: 1, annotations: [] })
    expect(result.fields).toEqual({ applied: [], rejected: [] })
    expect(doc.form.get('name')).toBe('Ada')
    doc.destroy()
  })

  it('a controlled import emits once with the imported names', async () => {
    const onChange = vi.fn((_next: FieldValues, _change: FieldsChange) => undefined)
    const doc = await formDoc({ fields: { mode: 'controlled', initial: {}, onChange } })
    doc.importAnnotations(
      JSON.stringify({
        format: 'gloss',
        version: 1,
        annotations: [],
        fields: { pin: '12' },
      })
    )
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0].pin).toBe('12')
    expect(onChange.mock.calls[0]![1]).toEqual({ kind: 'import', names: ['pin'] })
    doc.destroy()
  })

  // Needs gloss-format 1.3, which adds `fields` to the Gloss document.
  it.todo('round-trips through GlossDocument.parse')
})
