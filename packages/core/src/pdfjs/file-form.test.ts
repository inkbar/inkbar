import { describe, expect, it } from 'vitest'

import { fileFieldsFromPdfjs } from './file-form'

import type { PdfjsAnnotationData } from './types'
import type { FileField } from '../reader/file'

const widget = (
  id: string,
  extra: Partial<PdfjsAnnotationData> = {}
): PdfjsAnnotationData => ({
  id,
  subtype: 'Widget',
  annotationType: 20,
  rect: [10, 20, 110, 40],
  fieldName: 'name',
  fieldType: 'Tx',
  ...extra,
})

const one = (data: PdfjsAnnotationData): FileField => {
  const fields = fileFieldsFromPdfjs([{ page: 0, at: 0, data }])
  expect(fields).toHaveLength(1)
  return fields[0]!
}

describe('fileFieldsFromPdfjs', () => {
  it('gives a bare text field its name, kind, flags and one widget, and nothing else', () => {
    expect(fileFieldsFromPdfjs([{ page: 2, at: 5, data: widget('7R') }])).toStrictEqual([
      {
        name: 'name',
        kind: 'text',
        flags: 0,
        widgets: [
          {
            id: '7R',
            page: 2,
            at: 5,
            rect: [10, 20, 110, 40],
            flags: 0,
            hasAppearance: false,
            actions: {},
          },
        ],
      },
    ])
  })

  it("groups one field's widgets across pages, in page then place order", () => {
    const fields = fileFieldsFromPdfjs([
      { page: 0, at: 1, data: widget('1R', { fieldName: 'a' }) },
      { page: 0, at: 3, data: widget('2R', { fieldName: 'b' }) },
      { page: 1, at: 0, data: widget('3R', { fieldName: 'a' }) },
    ])
    expect(fields.map((f) => f.name)).toEqual(['a', 'b'])
    expect(fields[0]!.widgets.map((w) => [w.id, w.page, w.at])).toEqual([
      ['1R', 0, 1],
      ['3R', 1, 0],
    ])
  })

  it.each([
    ['text', { fieldType: 'Tx' }],
    ['combo', { fieldType: 'Ch', combo: true }],
    ['list', { fieldType: 'Ch' }],
    ['signature', { fieldType: 'Sig' }],
    ['button', { fieldType: 'Btn', pushButton: true }],
    ['radio', { fieldType: 'Btn', radioButton: true }],
    ['checkbox', { fieldType: 'Btn', checkBox: true }],
  ] satisfies [FileField['kind'], Partial<PdfjsAnnotationData>][])(
    'reads the kind %s',
    (kind, extra) => {
      expect(one(widget('1R', extra)).kind).toBe(kind)
    }
  )

  it('leaves out a widget whose field type PDF.js cannot name, and one with no name', () => {
    const fields = fileFieldsFromPdfjs([
      { page: 0, at: 0, data: widget('1R', { fieldName: 'odd', fieldType: 'Btn' }) },
      { page: 0, at: 1, data: widget('2R', { fieldName: 'none', fieldType: null }) },
      { page: 0, at: 2, data: widget('3R', { fieldName: '' }) },
      { page: 0, at: 3, data: widget('4R', { fieldName: 'kept' }) },
    ])
    expect(fields.map((f) => f.name)).toEqual(['kept'])
  })

  it("takes the field's kind and facts from its first widget", () => {
    const fields = fileFieldsFromPdfjs([
      {
        page: 0,
        at: 0,
        data: widget('1R', {
          fieldFlags: 4096,
          fieldValue: 'first',
          defaultFieldValue: 'dv',
          maxLen: 8,
        }),
      },
      {
        page: 0,
        at: 1,
        data: widget('2R', { fieldType: 'Sig', fieldFlags: 1, fieldValue: 'second' }),
      },
    ])
    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatchObject({
      kind: 'text',
      flags: 4096,
      value: 'first',
      defaultValue: 'dv',
      maxLength: 8,
    })
    expect(fields[0]!.widgets).toHaveLength(2)
  })

  it("gives a choice field's options and list values", () => {
    const options = [{ exportValue: 'gb', displayValue: 'United Kingdom' }]
    expect(
      one(
        widget('1R', {
          fieldType: 'Ch',
          options,
          fieldValue: ['gb'],
          defaultFieldValue: null,
        })
      )
    ).toMatchObject({ kind: 'list', options, value: ['gb'] })
  })

  it.each([
    ['exportValue', { fieldType: 'Btn', checkBox: true, exportValue: 'Yes' }],
    ['buttonValue', { fieldType: 'Btn', radioButton: true, buttonValue: 'Yes' }],
  ] satisfies [string, Partial<PdfjsAnnotationData>][])(
    'reads %s as the on value',
    (_, extra) => {
      expect(one(widget('1R', extra)).widgets[0]!.onValue).toBe('Yes')
    }
  )

  it.each([
    ['a Map', new Map([['Keystroke', ['k()']]])],
    ['an object', { Keystroke: ['k()'] }],
  ])('reads scripts given as %s', (_, actions) => {
    expect(one(widget('1R', { actions })).widgets[0]!.actions).toEqual({
      scripts: { Keystroke: ['k()'] },
    })
  })

  it("gives a widget's looks, place and actions", () => {
    const resetForm = { fields: ['a'], refs: ['9R'], include: false }
    const w = one(
      widget('1R', {
        annotationFlags: 4,
        hasAppearance: true,
        borderStyle: { width: 2, style: 2 },
        borderColor: new Uint8ClampedArray([255, 0, 0]),
        backgroundColor: new Uint8ClampedArray([0, 0, 255]),
        rotation: 90,
        textAlignment: 1,
        alternativeText: 'Your name',
        defaultAppearanceData: {
          fontSize: 12,
          fontName: 'Helv',
          fontColor: new Uint8ClampedArray([0, 0, 0]),
        },
        url: 'https://example.com/',
        newWindow: true,
        action: 'Print',
        resetForm,
      })
    ).widgets[0]!
    expect(w).toStrictEqual({
      id: '1R',
      page: 0,
      at: 0,
      rect: [10, 20, 110, 40],
      flags: 4,
      hasAppearance: true,
      border: { width: 2, style: 2 },
      borderColor: [255, 0, 0],
      backgroundColor: [0, 0, 255],
      rotation: 90,
      alignment: 1,
      tooltip: 'Your name',
      defaultAppearance: { fontSize: 12, fontName: 'Helv', color: [0, 0, 0] },
      actions: {
        url: 'https://example.com/',
        newWindow: true,
        named: 'Print',
        resetForm,
      },
    })
  })

  it("gives a reset's reference to a left-out widget as that widget's field name", () => {
    const fields = fileFieldsFromPdfjs([
      { page: 0, at: 0, data: widget('9R', { fieldName: 'odd', fieldType: 'Btn' }) },
      { page: 0, at: 1, data: widget('2R', { fieldName: 'kept' }) },
      {
        page: 0,
        at: 2,
        data: widget('1R', {
          fieldName: 'reset',
          fieldType: 'Btn',
          pushButton: true,
          resetForm: { fields: ['x'], refs: ['9R', '2R'], include: true },
        }),
      },
    ])
    expect(fields.map((f) => f.name)).toEqual(['kept', 'reset'])
    expect(fields[1]!.widgets[0]!.actions.resetForm).toEqual({
      fields: ['x', 'odd'],
      refs: ['2R'],
      include: true,
    })
  })

  it('leaves out a colour with fewer than three components', () => {
    const w = one(widget('1R', { backgroundColor: new Uint8ClampedArray([]) }))
      .widgets[0]!
    expect(w).not.toHaveProperty('backgroundColor')
  })

  it('reports a widget PDF.js hides as a barcode with the Hidden flag', () => {
    // PDF.js hides a text widget with `/PMD` without changing the flags it reports.
    const w = one(widget('1R', { annotationFlags: 4, hidden: true })).widgets[0]!
    expect(w.flags).toBe(4 | 2)
    const noView = one(widget('2R', { annotationFlags: 32, hidden: true })).widgets[0]!
    expect(noView.flags).toBe(32)
  })
})
