import { describe, expect, it } from 'vitest'

import { factDifferences, formDifferences } from './form'

import type { FileField, FileWidget } from './data'

const widget = (id: string, extra: Partial<FileWidget> = {}): FileWidget => ({
  id,
  page: 0,
  at: 0,
  rect: [10, 20, 110, 32],
  flags: 4,
  hasAppearance: true,
  actions: {},
  ...extra,
})

const field = (name: string, extra: Partial<FileField> = {}): FileField => ({
  name,
  kind: 'text',
  flags: 0,
  value: 'x',
  widgets: [widget(`${name}-1`)],
  ...extra,
})

describe('formDifferences', () => {
  it('finds equal fields the same', () => {
    const form = () => [
      field('a', { widgets: [widget('1R'), widget('2R', { page: 1 })] }),
      field('b', { kind: 'combo', options: [{ exportValue: 'x', displayValue: 'X' }] }),
    ]
    expect(formDifferences(form(), form())).toEqual([])
  })

  it('keeps a rect within 0.01 pt the same', () => {
    const near = field('a', { widgets: [widget('a-1', { rect: [10.005, 20, 110, 32] })] })
    expect(formDifferences([field('a')], [near])).toEqual([])
  })

  it('names the field when one is renamed', () => {
    const widgets = [widget('2R')]
    expect(
      formDifferences(
        [field('a'), field('b', { widgets })],
        [field('a'), field('c', { widgets })]
      )
    ).toEqual(['field 2: name: PDF.js "b", engine "c"'])
  })

  it('still compares the rest of two fields paired by place', () => {
    expect(
      formDifferences(
        [field('b', { widgets: [widget('2R')] })],
        [field('c', { flags: 2, widgets: [widget('3R')] })]
      )
    ).toEqual([
      'field 1: name: PDF.js "b", engine "c"',
      'field 1: flags: PDF.js 0, engine 2',
      'field 1: widget 1: id: PDF.js 2R, engine 3R',
    ])
  })

  it('tells a key set to undefined from a key left out', () => {
    const { value: _value, ...valueless } = field('a')
    const unset = { ...valueless, value: undefined } as unknown as FileField
    expect(formDifferences([valueless], [unset])).toEqual([
      'field "a": value: PDF.js none, engine undefined',
    ])
  })

  it('names the field and the widget when a widget is missing', () => {
    const two = field('a', { widgets: [widget('1R'), widget('2R')] })
    const one = field('a', { widgets: [widget('1R')] })
    expect(formDifferences([two], [one])).toEqual([
      'field "a": widget 2R: only PDF.js gives it',
    ])
  })

  it('names the field, the widget and the rect when a rect moves 0.02 pt', () => {
    const moved = field('a', { widgets: [widget('a-1', { rect: [10, 20, 110.02, 32] })] })
    expect(formDifferences([field('a')], [moved])).toEqual([
      'field "a": widget a-1: rect: PDF.js [10,20,110,32], engine [10,20,110.02,32]',
    ])
  })

  it('holds every number but a rect exact', () => {
    const off = field('a', { widgets: [widget('a-1', { borderColor: [0, 0, 255.005] })] })
    const on = field('a', { widgets: [widget('a-1', { borderColor: [0, 0, 255] })] })
    expect(formDifferences([on], [off])).toEqual([
      'field "a": widget a-1: borderColor: PDF.js [0,0,255], engine [0,0,255.005]',
    ])
  })

  it('names the field and the key that differs', () => {
    const scripted = (source: string) =>
      field('a', {
        flags: 2,
        widgets: [widget('a-1', { actions: { scripts: { Keystroke: [source] } } })],
      })
    expect(
      formDifferences(
        [scripted('AFNumber_Keystroke(2)')],
        [scripted('AFNumber_Keystroke(3)')]
      )
    ).toEqual([
      'field "a": widget a-1: actions.scripts.Keystroke: PDF.js ["AFNumber_Keystroke(2)"], engine ["AFNumber_Keystroke(3)"]',
    ])
    const { value: _value, ...valueless } = field('a')
    expect(formDifferences([field('a')], [valueless])).toEqual([
      'field "a": value: PDF.js "x", engine none',
    ])
  })

  it('names the order when the fields come in a different order', () => {
    expect(formDifferences([field('a'), field('b')], [field('b'), field('a')])).toEqual([
      'fields in a different order: PDF.js "a", "b"; engine "b", "a"',
    ])
  })

  it('pairs two fields of one name in turn', () => {
    const twice = [field('a'), field('a', { value: 'y' })]
    expect(formDifferences(twice, twice)).toEqual([])
    expect(formDifferences(twice, [field('a'), field('a', { value: 'z' })])).toEqual([
      'field "a": value: PDF.js "y", engine "z"',
    ])
  })
})

describe('factDifferences', () => {
  it('finds equal facts the same and names a fact that differs', () => {
    const facts = { title: 'T', encrypted: false }
    expect(factDifferences(facts, { ...facts })).toEqual([])
    expect(factDifferences(facts, { encrypted: false })).toEqual([
      'title: PDF.js "T", engine none',
    ])
  })
})
