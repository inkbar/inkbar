import { fixtureBytes } from '@inkbar/fixtures'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../../pdfjs/node-assets'
import { formFieldsOf } from '../../test-support/form'
import { openDocument } from '../document'
import { InkError } from '../errors'

import { createFormController } from './controller'

import type { FormField } from './types'

let fields: FormField[]

beforeAll(async () => {
  fields = await formFieldsOf('form-fields')
})

function controller() {
  return createFormController({
    fields,
    mode: { mode: 'uncontrolled' },
    onError: () => undefined,
  })
}

describe('FormController', () => {
  it("starts from the PDF's values", () => {
    const form = controller()
    expect(form.values.get().name).toBe('Sam')
    expect(form.get('plan')).toBe('monthly')
    expect(form.get('city')).toBeUndefined()
    expect(form.fields.get()).toBe(fields)
  })

  it('starts from the initial values over the PDF', () => {
    const form = createFormController({
      fields,
      mode: { mode: 'uncontrolled', initial: { name: 'Ada', nope: 'x' } },
      onError: () => undefined,
    })
    expect(form.get('name')).toBe('Ada')
    expect(form.get('nope')).toBeUndefined()
  })

  it('set applies and reports', () => {
    const form = controller()
    expect(form.set({ name: 'Ada' })).toEqual({ applied: ['name'], rejected: [] })
    expect(form.get('name')).toBe('Ada')
    expect(form.values.get().name).toBe('Ada')
  })

  it('set rejects unknown, read-only and invalid values', () => {
    const form = controller()
    expect(form.set({ nope: 'x' }).rejected).toEqual([
      { name: 'nope', reason: 'unknown' },
    ])
    expect(form.set({ locked: 'y' }).rejected).toEqual([
      { name: 'locked', reason: 'readOnly' },
    ])
    expect(form.set({ country: 'de' }).rejected).toEqual([
      { name: 'country', reason: 'invalid' },
    ])
    expect(form.set({ interests: 'maths' }).rejected).toEqual([
      { name: 'interests', reason: 'invalid' },
    ])
    expect(form.set({ pin: '12345' }).rejected).toEqual([
      { name: 'pin', reason: 'invalid' },
    ])
    expect(form.set({ reset: 'x' }).rejected).toEqual([
      { name: 'reset', reason: 'invalid' },
    ])
    expect(form.set({ city: 'Lyon' })).toEqual({ applied: ['city'], rejected: [] })
    expect(form.get('locked')).toBe('fixed')
    expect(form.get('country')).toBe('gb')
    expect(form.get('city')).toBe('Lyon')
  })

  it('a checkbox takes only its on-state or Off', () => {
    const form = controller()
    expect(form.set({ agree: 'Yes' }).applied).toEqual(['agree'])
    expect(form.set({ agree: 'true' }).rejected).toEqual([
      { name: 'agree', reason: 'invalid' },
    ])
    expect(form.get('agree')).toBe('Yes')
    expect(form.set({ agree: 'Off' }).applied).toEqual(['agree'])
  })

  it("a radio takes one of its widgets' on states", () => {
    const form = controller()
    expect(form.set({ shared: '1' }).applied).toEqual(['shared'])
    expect(form.set({ shared: 'A' }).rejected).toEqual([
      { name: 'shared', reason: 'invalid' },
    ])
  })

  it('stores a multi-select in option order', () => {
    const form = controller()
    expect(form.set({ interests: ['poetry', 'maths'] }).applied).toEqual(['interests'])
    expect(form.get('interests')).toEqual(['maths', 'poetry'])
    expect(form.set({ interests: ['maths', 'cooking'] }).rejected).toEqual([
      { name: 'interests', reason: 'invalid' },
    ])
  })

  it('a signature field takes only a signature', () => {
    const form = controller()
    expect(form.set({ sig: 'a7' }).rejected).toEqual([{ name: 'sig', reason: 'invalid' }])
    expect(form.set({ sig: { signature: 'a7' } }).applied).toEqual(['sig'])
    expect(form.get('sig')).toEqual({ signature: 'a7' })
  })

  it("reset restores the PDF's default values", () => {
    const form = controller()
    form.set({ plan: 'monthly', agree: 'Yes', name: 'Ada', shared: '0' })
    form.reset(['plan'])
    expect(form.get('plan')).toBe('yearly')
    expect(form.get('agree')).toBe('Yes')
    form.reset()
    expect(form.get('agree')).toBe('Off')
    expect(form.get('shared')).toBe('1')
    expect(form.get('name')).toBe('')
    expect(form.get('locked')).toBe('')
  })

  it('reset leaves a locked field alone', () => {
    const form = createFormController({
      fields: fields.map((f) => (f.name === 'name' ? { ...f, locked: true } : f)),
      mode: { mode: 'uncontrolled' },
      onError: () => undefined,
    })
    form.reset()
    expect(form.get('name')).toBe('Sam')
  })

  it('accepts every keystroke without scripting', () => {
    const form = controller()
    const widget = fields.find((f) => f.name === 'name')!.widgets[0]!.id
    expect(form._keystroke(widget, 'X', 1, 2)).toEqual({
      accepted: true,
      value: 'SXm',
      selStart: 2,
      selEnd: 2,
    })
    expect(() => form._dispatch({ widget, name: 'Focus' })).not.toThrow()
  })

  it('builds on the text typed so far', () => {
    const form = controller()
    const widget = fields.find((f) => f.name === 'name')!.widgets[0]!.id
    expect(form._keystroke(widget, 'a', 3, 3).value).toBe('Sama')
    expect(form._keystroke(widget, 'b', 4, 4)).toEqual({
      accepted: true,
      value: 'Samab',
      selStart: 5,
      selEnd: 5,
    })
    expect(form.get('name')).toBe('Sam')
  })

  it('a commit, a blur or a value change drops the typed text', () => {
    const form = controller()
    const widget = fields.find((f) => f.name === 'name')!.widgets[0]!.id
    form._keystroke(widget, 'a', 3, 3)
    form.set({ name: 'Sama' })
    expect(form._keystroke(widget, '!', 4, 4).value).toBe('Sama!')
    form.set({ name: 'Sama' })
    expect(form._keystroke(widget, '?', 4, 4).value).toBe('Sama?')
    form._dispatch({ widget, name: 'Blur' })
    expect(form._keystroke(widget, '.', 4, 4).value).toBe('Sama.')
    form.reset(['name'])
    expect(form._keystroke(widget, 'x', 0, 0).value).toBe('x')
  })

  it('keeps formatted text and widget overrides set by scripts', () => {
    const form = controller()
    form._setFormatted('name', '£2.50')
    expect(form.formatted.get()).toEqual({ name: '£2.50' })
    form._setFormatted('name', undefined)
    expect(form.formatted.get()).toEqual({})
    form._setWidgetState('w1', { hidden: true })
    form._setWidgetState('w1', { required: true })
    expect(form.widgetState.get()).toEqual({ w1: { hidden: true, required: true } })
    form._setWidgetState('w1', undefined)
    expect(form.widgetState.get()).toEqual({})
  })

  it('reports script errors to onError and the error listeners', () => {
    const onError = vi.fn()
    const form = createFormController({ fields, mode: { mode: 'uncontrolled' }, onError })
    const fn = vi.fn()
    form.on('error', fn)
    const e = new InkError('FormScriptError', 'boom')
    form._error(e)
    expect(onError).toHaveBeenCalledWith(e)
    expect(fn).toHaveBeenCalledWith(e)
  })

  it('emits actions', () => {
    const form = controller()
    const fn = vi.fn()
    const off = form.on('action', fn)
    form._emitAction({ kind: 'print' })
    off()
    form._emitAction({ kind: 'print' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('reports scripting rejections and syncs after a reset', () => {
    const form = controller()
    const scripting = {
      commit: vi.fn((name: string) => name !== 'notes'),
      sync: vi.fn(),
      destroy: vi.fn(),
    }
    form._attachScripting(scripting)
    expect(form.hasScripts).toBe(false)
    expect(form.set({ name: 'Ada', notes: 'n' })).toEqual({
      applied: ['name'],
      rejected: [{ name: 'notes', reason: 'script' }],
    })
    expect(form.get('notes')).toBe('')
    form.reset()
    expect(scripting.sync).toHaveBeenCalledWith(form.values.get(), true)
  })
})

describe('doc.form', () => {
  it('is empty for a document without fields', async () => {
    const doc = await openDocument(await fixtureBytes('text-simple'), {
      assets: nodeAssets(),
    })
    expect(doc.form.fields.get()).toEqual([])
    expect(doc.form.values.get()).toEqual({})
    doc.destroy()
  })

  it('undo restores a commit in one step', async () => {
    const doc = await openDocument(await fixtureBytes('form-fields'), {
      assets: nodeAssets(),
    })
    expect(doc.form.get('name')).toBe('Sam')
    doc.form.set({ name: 'Ada', agree: 'Yes' })
    expect(doc.history.canUndo.get()).toBe(true)
    doc.history.undo()
    expect(doc.form.get('name')).toBe('Sam')
    expect(doc.form.get('agree')).toBe('Off')
    expect(doc.history.canUndo.get()).toBe(false)
    doc.history.redo()
    expect(doc.form.get('name')).toBe('Ada')
    doc.destroy()
  })

  it('no history when fields are controlled', async () => {
    const doc = await openDocument(await fixtureBytes('form-fields'), {
      assets: nodeAssets(),
      fields: { mode: 'controlled', initial: {}, onChange: () => undefined },
    })
    doc.form.set({ name: 'Ada' })
    expect(doc.history.canUndo.get()).toBe(false)
    doc.destroy()
  })
})
