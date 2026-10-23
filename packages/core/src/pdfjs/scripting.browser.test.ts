import { browserAssets } from '@inkbar/fixtures/browser-assets'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { openFixtureInBrowser } from '../dom/test-utils'
import { staticDefaults } from '../model/annotations/defaults'
import { createHistory } from '../model/annotations/history'
import { createAnnotationStore } from '../model/annotations/store'
import { createFormController, type FormController } from '../model/form/controller'

import { createFormScripting, sandboxLoader } from './scripting'

import type { PdfjsDocument } from './types'
import type { InkDocument } from '../model/document'
import type { InkError } from '../model/errors'
import type { FormAction, FormField, FormFieldType } from '../model/form/types'
import type { FixtureName } from '@inkbar/fixtures/urls'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((f) => f())
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function open(name: FixtureName): Promise<InkDocument> {
  const doc = await openFixtureInBrowser(name)
  cleanup.push(() => doc.destroy())
  return doc
}

const widgetOf = (form: FormController, name: string): string =>
  form.fields.get().find((f) => f.name === name)!.widgets[0]!.id

const actionsOf = (form: FormController): FormAction[] => {
  const list: FormAction[] = []
  form.on('action', (a) => list.push(a))
  return list
}

const press = (form: FormController, name: string) =>
  form._dispatch({ widget: widgetOf(form, name), name: 'Action' })

describe('form scripts', () => {
  it('calculates a total', async () => {
    const { form } = await open('form-scripted')
    expect(form.set({ qty: '3' }).applied).toEqual(['qty'])
    expect(form.set({ price: '2.5' }).applied).toEqual(['price'])
    expect(form.get('total')).toBe('7.5')
    expect(form.formatted.get().price).toBe('£2.50')
    expect(form.formatted.get().total).toBe('£7.50')
  })

  it('rejects a keystroke AFNumber_Keystroke refuses', async () => {
    const { form } = await open('form-scripted')
    const qty = widgetOf(form, 'qty')
    expect(form._keystroke(qty, 'a', 0, 0).accepted).toBe(false)
    expect(form._keystroke(qty, '4', 0, 0)).toEqual({
      accepted: true,
      value: '4',
      selStart: 1,
      selEnd: 1,
    })
  })

  it('a validate script rejects a value', async () => {
    const { form } = await open('form-scripted')
    expect(form.set({ age: '7' })).toEqual({
      applied: [],
      rejected: [{ name: 'age', reason: 'script' }],
    })
    expect(form.get('age')).toBe('')
    expect(form.set({ age: '30' }).applied).toEqual(['age'])
    expect(form.get('age')).toBe('30')
  })

  it('a mouse-up script shows a field', async () => {
    const { form } = await open('form-scripted')
    const extra = widgetOf(form, 'extra')
    form.set({ more: 'Yes' })
    form._dispatch({ widget: widgetOf(form, 'more'), name: 'Mouse Up' })
    expect(form.widgetState.get()[extra]?.hidden).toBe(false)
    form.set({ more: 'Off' })
    form._dispatch({ widget: widgetOf(form, 'more'), name: 'Mouse Up' })
    expect(form.widgetState.get()[extra]?.hidden).toBe(true)
  })

  it('app.alert reaches the alert channel, not window.alert', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    const { form } = await open('form-scripted')
    const heard: string[] = []
    form.on('alert', (m) => heard.push(m))
    press(form, 'hello')
    expect(heard).toEqual(['Hello'])
    expect(alert).not.toHaveBeenCalled()
  })

  it('app.response returns null and emits a prompt action', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => 'typed')
    const { form } = await open('form-scripted')
    const actions = actionsOf(form)
    press(form, 'ask')
    expect(actions).toEqual([{ kind: 'prompt', message: 'Name?' }])
    expect(prompt).not.toHaveBeenCalled()
  })

  it('submitForm, mailDoc, launchURL and print become actions', async () => {
    const { form } = await open('form-scripted')
    form.set({ qty: '3' })
    const actions = actionsOf(form)
    for (const name of ['submit', 'mail', 'link', 'print']) press(form, name)
    expect(actions).toEqual([
      {
        kind: 'submit',
        url: 'https://example.com/submit',
        fields: expect.objectContaining({ qty: '3', more: 'Off' }) as unknown,
        format: 'fdf',
      },
      { kind: 'mail', to: 'forms@example.com', withData: false },
      { kind: 'open-url', url: 'https://example.com', newWindow: true },
      { kind: 'print' },
    ])
  })

  it('non-JS actions become actions or resets', async () => {
    const { form } = await open('form-scripted')
    form.set({ qty: '3', more: 'Yes' })
    const actions = actionsOf(form)
    press(form, 'send')
    press(form, 'site')
    expect(actions).toEqual([
      {
        kind: 'submit',
        url: 'https://example.com/xfdf',
        fields: expect.objectContaining({ qty: '3', more: 'Yes' }) as unknown,
        format: 'xfdf',
      },
      { kind: 'open-url', url: 'https://example.com/', newWindow: false },
    ])
    press(form, 'clear')
    expect(form.get('qty')).toBe('')
    expect(form.get('more')).toBe('Off')
  })

  it('no network', async () => {
    const { form } = await open('form-scripted')
    const fetchSpy = vi.spyOn(window, 'fetch')
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const xhrSend = vi.spyOn(XMLHttpRequest.prototype, 'send')
    const beacon = vi.spyOn(navigator, 'sendBeacon')
    const winOpen = vi.spyOn(window, 'open').mockImplementation(() => null)
    for (const name of [
      'hello',
      'ask',
      'submit',
      'mail',
      'link',
      'print',
      'send',
      'site',
    ])
      press(form, name)
    for (const spy of [fetchSpy, xhrOpen, xhrSend, beacon, winOpen])
      expect(spy).not.toHaveBeenCalled()
  })

  it("the sandbox's window is the shim", async () => {
    const doc = await open('form-scripted')
    const scripting = await createFormScripting({
      proxy: doc._pdfjs.proxy,
      assets: browserAssets(),
      form: doc.form,
      info: doc.info,
      testing: true,
    })
    cleanup.push(() => scripting?.destroy())
    // Pins a PDF.js internal: the sandbox calls `support.win` for alert, prompt and timers.
    const win = scripting?._sandboxForTesting?.support?.win as Record<string, unknown>
    expect(win).toBeDefined()
    expect(win).not.toBe(window)
    expect(typeof win.alert).toBe('function')
    expect(win.alert).not.toBe(Reflect.get(window, 'alert'))
    expect(win.setTimeout).not.toBe(Reflect.get(window, 'setTimeout'))
  })

  it('does not load the sandbox for a form without scripts', async () => {
    const load = vi.spyOn(sandboxLoader, 'load')
    const doc = await open('form-fields')
    expect(doc.form.fields.get().length).toBeGreaterThan(0)
    expect(load).not.toHaveBeenCalled()
    await open('form-scripted')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('destroy clears timers and listeners', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const doc = await openFixtureInBrowser('form-timer')
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(120)
    expect(doc.form.get('ticker')).toBe('2')
    const widget = widgetOf(doc.form, 'ticker')
    doc.destroy()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(500)
    doc.form._dispatch({ widget, name: 'Focus' })
    expect(doc.form.get('ticker')).toBe('2')
  })

  it('undo replays values into the sandbox without recalculating twice', async () => {
    const { form, history } = await open('form-scripted')
    form.set({ qty: '3' })
    form.set({ price: '2.5' })
    form.set({ qty: '4' })
    expect(form.get('total')).toBe('10')
    const heard = vi.fn()
    const stop = form.values.subscribe(heard)
    heard.mockClear()
    history.undo()
    stop()
    expect(form.get('qty')).toBe('3')
    expect(form.get('total')).toBe('7.5')
    expect(heard).toHaveBeenCalledTimes(1)
    expect(history.canUndo.get()).toBe(true)
    // The sandbox holds the undone values: a new commit calculates from them.
    form.set({ price: '2' })
    expect(form.get('total')).toBe('6')
  })

  it('timer writes are no undo step, and undo keeps the timer going', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { form, history } = await open('form-timer')
    vi.advanceTimersByTime(260)
    expect(form.get('ticker')).toBe('5')
    expect(history.canUndo.get()).toBe(false)
    form.set({ note: 'mine' })
    form.set({ note: 'later' })
    vi.advanceTimersByTime(100)
    expect(form.get('ticker')).toBe('7')
    history.undo()
    expect(form.get('note')).toBe('mine')
    // Undo does not rewind what the timer wrote, and the timer goes on from there.
    expect(form.get('ticker')).toBe('7')
    vi.advanceTimersByTime(50)
    expect(form.get('ticker')).toBe('8')
    history.undo()
    expect(form.get('note')).toBeFalsy()
    expect(history.canUndo.get()).toBe(false)
    history.redo()
    expect(form.get('note')).toBe('mine')
    expect(form.get('ticker')).toBe('8')
  })

  it('a commit and the calculation it causes are one step', async () => {
    const { form, history } = await open('form-scripted')
    form.set({ qty: '3' })
    form.set({ price: '2' })
    expect(form.get('total')).toBe('6')
    history.undo()
    expect(form.get('price')).toBeFalsy()
    expect(form.get('total')).toBe('0')
    history.undo()
    expect(form.get('qty')).toBeFalsy()
    expect(history.canUndo.get()).toBe(false)
  })

  it("a reset button's mouse-up script and its reset are one step", async () => {
    const { form, history } = await open('form-scripted')
    form.set({ qty: '3', price: '2' })
    expect(form.get('total')).toBe('6')
    const clear = widgetOf(form, 'clear')
    // As the button runs them.
    form._step(() => {
      form._dispatch({ widget: clear, name: 'Mouse Up' })
      form._dispatch({ widget: clear, name: 'Action' })
    })
    expect(form.get('qty')).toBeFalsy()
    expect(form.get('price')).toBeFalsy()
    history.undo()
    expect(form.get('qty')).toBe('3')
    expect(form.get('price')).toBe('2')
    expect(form.get('total')).toBe('6')
    history.undo()
    expect(history.canUndo.get()).toBe(false)
  })

  it('a field typed into and left reverts in the sandbox', async () => {
    const { form } = await open('form-scripted')
    form.set({ qty: '3', price: '2' })
    const qty = widgetOf(form, 'qty')
    form._keystroke(qty, '9', 1, 1)
    form._dispatch({ widget: qty, name: 'Blur' })
    form.set({ price: '3' })
    expect(form.get('total')).toBe('9')
  })
})

type Spec = { name: string; type: FormFieldType; actions?: Record<string, string[]> }

/** A form whose fields and scripts come straight from `objects`, without a PDF. */
function stage(
  specs: Spec[],
  docActions?: Record<string, string[]>,
  pageActions?: Record<string, string[]>
) {
  // An undo history over the fields, wired as a document wires it.
  const history = createHistory(
    createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
  )
  const fields: FormField[] = specs.map((s, i) => ({
    name: s.name,
    type: s.type,
    flags: {
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
    },
    options: [],
    ...(s.type === 'text' ? { value: '' } : {}),
    widgets: [
      {
        id: `${i + 1}R`,
        page: 0,
        rect: { x: 0, y: 0, width: 10, height: 10 },
        rotation: 0,
        hidden: false,
        printOnly: false,
        appearance: { fontSize: 0, align: 'left' },
        hasScripts: s.actions !== undefined,
      },
    ],
    locked: false,
  }))
  const errors: InkError[] = []
  const form = createFormController({
    fields,
    mode: { mode: 'uncontrolled' },
    onError: (e) => errors.push(e),
    batch: (fn) => history.batch(fn),
    quiet: (fn) => history.baseline(fn),
  })
  history.track(form._store)
  const objects = new Map(
    specs.map((s, i) => [
      s.name,
      [
        {
          id: `${i + 1}R`,
          type: s.type,
          name: s.name,
          value: '',
          actions: s.actions ?? null,
        },
      ],
    ])
  )
  const proxy = {
    hasJSActions: () => Promise.resolve(true),
    getFieldObjects: () => Promise.resolve(objects),
    getCalculationOrderIds: () => Promise.resolve(null),
    getJSActions: () =>
      Promise.resolve(docActions ? new Map(Object.entries(docActions)) : null),
    getPage: () =>
      Promise.resolve({ getJSActions: () => Promise.resolve(pageActions ?? null) }),
  } as unknown as PdfjsDocument
  cleanup.push(() => {
    form._destroy()
    history.destroy()
  })
  const start = () =>
    createFormScripting({ proxy, assets: browserAssets(), form, info: { pageCount: 1 } })
  return { form, errors, start, history }
}

async function scripted(
  specs: Spec[],
  docActions?: Record<string, string[]>,
  pageActions?: Record<string, string[]>
) {
  const { form, errors, start, history } = stage(specs, docActions, pageActions)
  const scripting = await start()
  if (scripting) form._attachScripting(scripting)
  return { form, scripting, errors, history, actions: actionsOf(form) }
}

describe('rewritten methods', () => {
  it('report this.x(), bare x() and the object form', async () => {
    const { form, actions } = await scripted([
      { name: 'out', type: 'text' },
      {
        name: 'go',
        type: 'button',
        actions: {
          Action: [
            'this.submitForm("https://example.com/this")',
            'submitForm({ cURL: "https://example.com/bare", cSubmitAs: "HTML", bGet: true, aFields: ["out"] })',
            'mailForm(false, "a@example.com", "c@example.com", "", "Hi", "Body")',
            'this.mailDoc({ cTo: "b@example.com" })',
            'app.launchURL({ cURL: "https://example.com/new", bNewFrame: false })',
            'print()',
          ],
        },
      },
    ])
    form.set({ out: 'x' })
    press(form, 'go')
    expect(actions).toEqual([
      {
        kind: 'submit',
        url: 'https://example.com/this',
        fields: { out: 'x' },
        format: 'fdf',
      },
      {
        kind: 'submit',
        url: 'https://example.com/bare',
        fields: { out: 'x' },
        format: 'html',
        method: 'GET',
      },
      {
        kind: 'mail',
        to: 'a@example.com',
        cc: 'c@example.com',
        bcc: '',
        subject: 'Hi',
        body: 'Body',
        withData: true,
      },
      { kind: 'mail', to: 'b@example.com', withData: false },
      { kind: 'open-url', url: 'https://example.com/new', newWindow: false },
      { kind: 'print' },
    ])
  })

  it('app.response gives the script null', async () => {
    const { form, actions } = await scripted([
      { name: 'out', type: 'text' },
      {
        name: 'go',
        type: 'button',
        actions: { Action: ['this.getField("out").value = String(app.response("Q?"))'] },
      },
    ])
    press(form, 'go')
    expect(form.get('out')).toBe('null')
    expect(actions).toEqual([{ kind: 'prompt', message: 'Q?' }])
  })

  it('a throwing script is a FormScriptError and the form keeps working', async () => {
    const { form, errors } = await scripted([
      { name: 'out', type: 'text' },
      { name: 'go', type: 'button', actions: { Action: ['throw new Error("boom")'] } },
    ])
    const heard: InkError[] = []
    form.on('error', (e) => heard.push(e))
    press(form, 'go')
    expect(heard.map((e) => e.code)).toEqual(['FormScriptError'])
    expect(heard[0]!.message).toContain('boom')
    expect(errors).toHaveLength(1)
    expect(form.set({ out: 'still' }).applied).toEqual(['out'])
  })

  it('a document-level script runs at open', async () => {
    const { form } = await scripted([{ name: 'out', type: 'text' }], {
      init: ['this.getField("out").value = "ready"'],
    })
    expect(form.get('out')).toBe('ready')
  })

  it('runs page open and close scripts', async () => {
    // Page scripts alone do not load the sandbox, as in PDF.js: the field has one too.
    const out: Spec = {
      name: 'out',
      type: 'text',
      actions: { Keystroke: ['event.rc = true'] },
    }
    const { form, errors } = await scripted([out], undefined, {
      PageOpen: ['this.getField("out").value = "opened " + this.pageNum'],
      PageClose: ['this.getField("out").value = "closed"'],
    })
    await form._pageEvent(0, 'PageOpen')
    expect(errors).toEqual([])
    expect(form.get('out')).toBe('opened 0')
    await form._pageEvent(0, 'PageClose')
    expect(form.get('out')).toBe('closed')
    await form._pageEvent(0, 'PageOpen')
    expect(form.get('out')).toBe('opened 0')
  })

  it('page scripts that run after open are no undo step, and undo leaves them', async () => {
    const out: Spec = {
      name: 'out',
      type: 'text',
      actions: { Keystroke: ['event.rc = true'] },
    }
    const note: Spec = { name: 'note', type: 'text' }
    const { form, history } = await scripted([out, note], undefined, {
      PageOpen: ['this.getField("out").value = "opened"'],
      PageClose: ['this.getField("out").value = "closed"'],
    })
    await form._pageEvent(0, 'PageOpen')
    expect(form.get('out')).toBe('opened')
    expect(history.canUndo.get()).toBe(false)
    form.set({ note: 'mine' })
    await form._pageEvent(0, 'PageClose')
    expect(form.get('out')).toBe('closed')
    history.undo()
    expect(form.get('note')).toBe('')
    expect(form.get('out')).toBe('closed')
    expect(history.canUndo.get()).toBe(false)
  })

  it('a sandbox that cannot load is a FormScriptError and no scripts run', async () => {
    vi.spyOn(sandboxLoader, 'load').mockRejectedValue(new Error('offline'))
    const { form, scripting, errors } = await scripted([
      { name: 'out', type: 'text', actions: { Keystroke: ['event.rc = false'] } },
    ])
    expect(scripting).toBeUndefined()
    expect(errors.map((e) => e.code)).toEqual(['FormScriptError'])
    expect(form._keystroke(widgetOf(form, 'out'), 'a', 0, 0).accepted).toBe(true)
    expect(form.set({ out: 'a' }).applied).toEqual(['out'])
  })
})

describe('fix round', () => {
  it('drops script URLs that are not http, https, mailto or tel', async () => {
    const { form, actions } = await scripted([
      {
        name: 'go',
        type: 'button',
        actions: {
          Action: [
            'app.launchURL("javascript:alert(1)", true)',
            'this.submitForm({ cURL: "javascript:alert(1)" })',
            'submitForm("data:text/html,hi")',
            'app.launchURL("/relative")',
            'this.mailDoc(false, "javascript:alert(1)")',
            'app.launchURL("https://example.com/ok")',
            'this.submitForm("mailto:forms@example.com")',
          ],
        },
      },
    ])
    press(form, 'go')
    expect(actions).toEqual([
      { kind: 'open-url', url: 'https://example.com/ok', newWindow: false },
      { kind: 'submit', url: 'mailto:forms@example.com', fields: {}, format: 'fdf' },
    ])
  })

  it('keeps the value a validate script changed', async () => {
    const { form } = await open('form-uppercase')
    expect(form.set({ code: 'abc' }).applied).toEqual(['code'])
    expect(form.get('code')).toBe('ABC')
  })

  it('keeps a committed number as typed', async () => {
    const { form } = await open('form-scripted')
    form.set({ price: '2.50', qty: '2' })
    expect(form.get('price')).toBe('2.50')
    expect(form.get('total')).toBe('5')
  })

  it('keeps a committed date as typed', async () => {
    const { form } = await open('form-scripted')
    expect(form.set({ when: '25/12/2026' }).applied).toEqual(['when'])
    expect(form.get('when')).toBe('25/12/2026')
    expect(form.formatted.get().when).toBe('25/12/2026')
  })

  it('keeps the radio chosen from two that share an export value', async () => {
    const { form } = await open('form-shared-scripted')
    expect(form.set({ shared: '1' }).applied).toEqual(['shared'])
    expect(form.get('shared')).toBe('1')
    expect(form.set({ shared: '0' }).applied).toEqual(['shared'])
    expect(form.get('shared')).toBe('0')
  })

  it('a document without fields or scripts loads nothing', async () => {
    const first = await open('form-fields')
    const proto = Object.getPrototypeOf(first._pdfjs.proxy) as PdfjsDocument
    const getFieldObjects = vi.spyOn(proto, 'getFieldObjects')
    const load = vi.spyOn(sandboxLoader, 'load')
    await open('text-simple')
    expect(getFieldObjects).not.toHaveBeenCalled()
    await open('form-fields')
    expect(load).not.toHaveBeenCalled()
  })

  it('a sandbox that never loads times out without scripts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(sandboxLoader, 'load').mockReturnValue(new Promise(() => undefined))
    const { form, errors, start } = stage([
      { name: 'out', type: 'text', actions: { Keystroke: ['event.rc = false'] } },
    ])
    const pending = start()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await pending).toBeUndefined()
    expect(errors.map((e) => e.code)).toEqual(['FormScriptError'])
    expect(form.set({ out: 'a' }).applied).toEqual(['out'])
  })

  it('initial values calculate at open when uncontrolled', async () => {
    const doc = await openFixtureInBrowser('form-scripted', {
      fields: { mode: 'uncontrolled', initial: { qty: '2', price: '3' } },
    })
    cleanup.push(() => doc.destroy())
    expect(doc.form.get('total')).toBe('6')
    expect(doc.history.canUndo.get()).toBe(false)
  })

  it('initial values do not calculate at open when controlled', async () => {
    const onChange = vi.fn()
    const doc = await openFixtureInBrowser('form-scripted', {
      fields: { mode: 'controlled', initial: { qty: '2', price: '3' }, onChange },
    })
    cleanup.push(() => doc.destroy())
    expect(doc.form.get('total')).toBe('')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores a negative text size', async () => {
    const { form } = await scripted([
      { name: 'out', type: 'text' },
      {
        name: 'go',
        type: 'button',
        actions: {
          Action: ['var f = this.getField("out"); f.textSize = -3; f.textSize = 12;'],
        },
      },
      {
        name: 'bad',
        type: 'button',
        actions: { Action: ['this.getField("out").textSize = -1'] },
      },
    ])
    const out = widgetOf(form, 'out')
    press(form, 'bad')
    expect(form.widgetState.get()[out]?.textSize).toBeUndefined()
    press(form, 'go')
    expect(form.widgetState.get()[out]?.textSize).toBe(12)
  })
})
