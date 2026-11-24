import { describe, expect, it } from 'vitest'

import { en } from '../messages/en'

import { controlLabel } from './form-label'

import type { FieldOption, FormField, FormWidget } from '../model/form/types'

function field(
  over: Partial<FormField> & { options?: FieldOption[] },
  states: string[] = []
): FormField {
  return {
    name: 'membership',
    type: 'radio',
    flags: {} as FormField['flags'],
    options: [],
    widgets: states.map((onState, i) => ({ id: `${i}R`, onState }) as FormWidget),
    locked: false,
    ...over,
  }
}

describe('controlLabel', () => {
  it('names a radio by its option, then its group', () => {
    const f = field(
      {
        tooltip: 'Membership',
        options: [
          { value: '0', label: 'Adult' },
          { value: '1', label: 'Junior' },
        ],
      },
      ['0', '1']
    )
    expect(f.widgets.map((w) => controlLabel(f, w, en))).toEqual([
      'Adult, Membership',
      'Junior, Membership',
    ])
  })

  it('uses a radio state name when the field lists no option for it', () => {
    const f = field({ name: 'billing.plan' }, ['monthly'])
    expect(controlLabel(f, f.widgets[0], en)).toBe('monthly, plan')
  })

  it('leaves out an option that only numbers the radio or repeats the group', () => {
    const numbered = field({ tooltip: 'Size' }, ['0'])
    expect(controlLabel(numbered, numbered.widgets[0], en)).toBe('Size')
    const repeated = field({ tooltip: 'Yes' }, ['Yes'])
    expect(controlLabel(repeated, repeated.widgets[0], en)).toBe('Yes')
  })

  it('names other fields by their tooltip, else the last part of the name', () => {
    const box = field({ type: 'checkbox', name: 'terms.agree' }, ['Yes'])
    expect(controlLabel(box, box.widgets[0], en)).toBe('agree')
    const text = field({ type: 'text', name: 'a.b', tooltip: ' Full name ' })
    expect(controlLabel(text, undefined, en)).toBe('Full name')
    const blank = field({ type: 'text', name: '' })
    expect(controlLabel(blank, undefined, en)).toBe(en.forms.unnamed)
  })
})
