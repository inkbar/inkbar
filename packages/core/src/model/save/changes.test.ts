import { describe, expect, it } from 'vitest'

import { staticDefaults } from '../annotations/defaults'
import { createAnnotationStore } from '../annotations/store'

import { changedFields, hasChanges, takeSnapshot } from './changes'

import type { Annotation } from '../annotations/types'
import type { FieldValues, FormField, FormFieldType } from '../form/types'

function annotations(): Annotation[] {
  let n = 0
  const store = createAnnotationStore({
    mode: { mode: 'uncontrolled' },
    defaults: staticDefaults,
    now: () => '2026-11-17T09:00:00.000Z',
    id: () => `a-${++n}`,
  })
  return [
    store.add({ type: 'square', page: 0, rect: { x: 10, y: 10, width: 50, height: 40 } }),
    store.add({ type: 'circle', page: 1, rect: { x: 80, y: 10, width: 30, height: 30 } }),
  ]
}

const flags = {
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
}

function field(
  name: string,
  type: FormFieldType,
  value?: FormField['value'],
  locked = false
): FormField {
  return {
    name,
    type,
    flags,
    options: [],
    widgets: [],
    locked,
    ...(value === undefined ? {} : { value }),
  }
}

const fields = [
  field('name', 'text', 'Sam'),
  field('amount', 'text'),
  field('agree', 'checkbox', 'Off'),
  field('sig', 'signature'),
  field('sealed', 'signature', undefined, true),
]

const fileValues: FieldValues = { name: 'Sam', agree: 'Off' }

const snapshot = (list: readonly Annotation[], values = fileValues, formatted = {}) =>
  takeSnapshot({
    annotations: list,
    fields: changedFields({ fields, values, formatted }, { formatted: {} }),
  })

describe('hasChanges', () => {
  it('finds none between equal lists, copies included', () => {
    const list = annotations()
    const copies = list.map((a) => JSON.parse(JSON.stringify(a)) as Annotation)
    expect(hasChanges(snapshot(list), snapshot(list))).toBe(false)
    expect(hasChanges(snapshot(copies), snapshot(list))).toBe(false)
  })

  it('finds none when the keys of an annotation come in another order', () => {
    const list = annotations()
    const reordered = list.map(
      (a) => Object.fromEntries(Object.entries(a).reverse()) as Annotation
    )
    expect(hasChanges(snapshot(reordered), snapshot(list))).toBe(false)
  })

  it('finds a moved rect', () => {
    const list = annotations()
    const moved = [{ ...list[0]!, rect: { ...list[0]!.rect, x: 11 } }, list[1]!]
    expect(hasChanges(snapshot(moved), snapshot(list))).toBe(true)
  })

  it('finds an added or a removed annotation', () => {
    const list = annotations()
    expect(hasChanges(snapshot(list), snapshot(list.slice(0, 1)))).toBe(true)
    expect(hasChanges(snapshot(list.slice(1)), snapshot(list))).toBe(true)
  })

  it('finds a changed field', () => {
    const list = annotations()
    expect(
      hasChanges(snapshot(list, { ...fileValues, name: 'Ada' }), snapshot(list))
    ).toBe(true)
  })

  it('ignores a patch to a file annotation', () => {
    const list = annotations()
    const file: Annotation = { ...list[0]!, id: 'pdf-1', source: 'pdf', locked: true }
    const patched: Annotation = { ...file, color: '#00FF00' }
    expect(hasChanges(snapshot([...list, patched]), snapshot([...list, file]))).toBe(
      false
    )
    expect(snapshot([...list, patched]).annotations).toEqual(list)
  })
})

describe('changedFields', () => {
  it('lists only values that differ from the file, an emptied one as null', () => {
    expect(
      changedFields(
        {
          fields,
          values: { name: 'Ada', agree: 'Off', sig: { signature: 'a-1' } },
          formatted: {},
        },
        { formatted: {} }
      )
    ).toEqual({ name: { value: 'Ada' }, sig: { value: { signature: 'a-1' } } })
    expect(
      changedFields(
        { fields, values: { agree: 'Off' }, formatted: {} },
        { formatted: {} }
      )
    ).toEqual({ name: { value: null } })
  })

  it('takes an emptied field the file left empty as no change', () => {
    expect(
      changedFields(
        { fields, values: { ...fileValues, amount: '' }, formatted: {} },
        { formatted: {} }
      )
    ).toEqual({})
    // The file's 'Off' and no value at all are the same unticked box.
    expect(
      changedFields({ fields, values: { name: 'Sam' }, formatted: {} }, { formatted: {} })
    ).toEqual({})
  })

  it('lists a field whose formatted text alone changed, with that text', () => {
    expect(
      changedFields(
        { fields, values: fileValues, formatted: { name: 'SAM' } },
        { formatted: {} }
      )
    ).toEqual({ name: { value: 'Sam', text: 'SAM' } })
    expect(
      changedFields(
        { fields, values: fileValues, formatted: { name: 'SAM' } },
        { formatted: { name: 'SAM' } }
      )
    ).toEqual({})
  })

  it('carries the formatted text with a changed value', () => {
    expect(
      changedFields(
        {
          fields,
          values: { ...fileValues, amount: '1234.5' },
          formatted: { amount: '$1,234.50' },
        },
        { formatted: {} }
      )
    ).toEqual({ amount: { value: '1234.5', text: '$1,234.50' } })
  })

  it('skips locked fields', () => {
    expect(
      changedFields(
        { fields, values: { ...fileValues, sealed: 'x' }, formatted: {} },
        { formatted: {} }
      )
    ).toEqual({})
  })
})
