import { beforeAll, describe, expect, it, vi } from 'vitest'

import { formFieldsOf } from '../../test-support/form'

import { createFormController } from './controller'

import type { FieldsChange, FieldValues, FormField } from './types'

let fields: FormField[]

beforeAll(async () => {
  fields = await formFieldsOf('form-fields')
})

function controlled(initial: FieldValues = {}, loaded = true) {
  const onChange = vi.fn((_next: FieldValues, _change: FieldsChange) => undefined)
  const form = createFormController({
    fields: loaded ? fields : [],
    mode: { mode: 'controlled', initial, onChange },
    onError: () => undefined,
  })
  return { form, onChange }
}

describe('FormController (controlled)', () => {
  it('commit applies locally then emits the full map once', () => {
    const { form, onChange } = controlled()
    form.set({ name: 'Ada', agree: 'Yes' })
    expect(form.get('name')).toBe('Ada')
    expect(onChange).toHaveBeenCalledTimes(1)
    const [next, change] = onChange.mock.calls[0]!
    expect(next.name).toBe('Ada')
    expect(next.agree).toBe('Yes')
    expect(next.plan).toBe('monthly')
    expect(next.locked).toBe('fixed')
    expect(change).toEqual({ kind: 'commit', names: ['name', 'agree'] })
  })

  it('a rejected or unchanged commit emits nothing', () => {
    const { form, onChange } = controlled()
    form.set({ nope: 'x', name: 'Sam' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a reset emits once', () => {
    const { form, onChange } = controlled({ plan: 'monthly' })
    form.reset(['plan'])
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![1]).toEqual({ kind: 'reset', names: ['plan'] })
  })

  it('starts from the host value over the PDF', () => {
    const { form } = controlled({ name: 'Bo' })
    expect(form.get('name')).toBe('Bo')
    expect(form.get('plan')).toBe('monthly')
  })

  it('a host push wins', () => {
    const { form, onChange } = controlled()
    const v = form.values.get()
    form.setControlledValue({ ...v, name: 'Bo' })
    expect(form.get('name')).toBe('Bo')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a push publishes once', () => {
    const { form } = controlled()
    const seen = vi.fn()
    form.values.subscribe(seen)
    form.setControlledValue({ ...form.values.get(), name: 'Bo', agree: 'Yes', pin: '12' })
    expect(seen).toHaveBeenCalledTimes(1)
    expect(form.get('pin')).toBe('12')
  })

  it('a push or an import keeps the typed text of fields it leaves alone', () => {
    const { form } = controlled()
    const notes = fields.find((f) => f.name === 'notes')!.widgets[0]!.id
    const name = fields.find((f) => f.name === 'name')!.widgets[0]!.id
    form._keystroke(notes, 'draft', 0, 0)
    form._keystroke(name, 'X', 0, 3)
    form.setControlledValue({ ...form.values.get(), name: 'Bo' })
    expect(form._keystroke(notes, '!', 5, 5).value).toBe('draft!')
    expect(form._keystroke(name, '?', 2, 2).value).toBe('Bo?')
    form._import({ pin: '12' })
    expect(form._keystroke(notes, '?', 6, 6).value).toBe('draft!?')
  })

  it('a host push syncs the sandbox and emits what calculation changed', () => {
    const { form, onChange } = controlled()
    form._attachScripting({
      commit: (_name, value) => value,
      sync(values, calculate) {
        if (calculate)
          form._store.update('notes', { value: `hi ${values.name as string}` })
      },
      dispatch: () => undefined,
      keystroke: () => undefined,
      pageEvent: () => Promise.resolve(),
      destroy: () => undefined,
    })
    form.setControlledValue({ ...form.values.get(), name: 'Bo' })
    expect(form.get('notes')).toBe('hi Bo')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0].notes).toBe('hi Bo')
    expect(onChange.mock.calls[0]![1]).toEqual({ kind: 'calculate', names: ['notes'] })
  })

  it('a commit names the fields its calculation changed', () => {
    const { form, onChange } = controlled()
    form._attachScripting({
      commit(name, value) {
        if (name === 'name') form._scriptValues({ notes: `hi ${value as string}` })
        return value
      },
      sync: () => undefined,
      dispatch: () => undefined,
      keystroke: () => undefined,
      pageEvent: () => Promise.resolve(),
      destroy: () => undefined,
    })
    expect(form.hasScripts).toBe(true)
    form.set({ name: 'Bo' })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![1]).toEqual({
      kind: 'commit',
      names: ['name', 'notes'],
    })
  })

  it('a push equal to the current map emits nothing', () => {
    const { form, onChange } = controlled()
    const sync = vi.fn()
    form._attachScripting({
      commit: (_name, value) => value,
      sync,
      dispatch: () => undefined,
      keystroke: () => undefined,
      pageEvent: () => Promise.resolve(),
      destroy: () => undefined,
    })
    form.setControlledValue({ ...form.values.get() })
    expect(onChange).not.toHaveBeenCalled()
    expect(sync).not.toHaveBeenCalled()
  })

  it('a push before ready is applied once ready', () => {
    const { form, onChange } = controlled({ name: 'Ada' }, false)
    expect(form.values.get()).toEqual({})
    form.setControlledValue({ name: 'Bo', agree: 'Yes' })
    expect(form.get('name')).toBeUndefined()
    form._load(fields)
    expect(form.fields.get()).toBe(fields)
    expect(form.get('name')).toBe('Bo')
    expect(form.get('agree')).toBe('Yes')
    expect(form.get('plan')).toBe('monthly')
    expect(onChange).not.toHaveBeenCalled()
  })
})
