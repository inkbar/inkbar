import { InkError } from '../model/errors'
import { submitValues } from '../model/form/submit'
import { safeAddress, safeUrl } from '../model/form/url'
import { sameValue } from '../model/form/values'

import { ACTION_COMMAND, patchSandboxSource } from './sandbox-patch'

import type { PdfjsSandbox, QuickJSSandbox } from '#pdfjs-sandbox'
import type { PdfAssets, PdfjsDocument } from './types'
import type {
  FormController,
  FormScripting,
  KeystrokeResult,
} from '../model/form/controller'
import type {
  FieldValue,
  FormAction,
  FormEvent,
  FormField,
  FormWidget,
  WidgetOverride,
} from '../model/form/types'

/** Where the sandbox module comes from. An object, so tests can see whether it was loaded. */
export const sandboxLoader = {
  load: (): Promise<{ QuickJSSandbox: typeof QuickJSSandbox }> =>
    import('#pdfjs-sandbox'),
}

export interface FormScriptingOptions {
  proxy: PdfjsDocument
  assets: PdfAssets
  form: FormController
  info: { title?: string | undefined; author?: string | undefined; pageCount: number }
  /**
   * Whether the values the form starts from (a host's initial values over the file's) run
   * calculate once the sandbox starts. Off for a controlled host, which hears of nothing
   * before it opened the document.
   */
  calculateAtStart?: boolean | undefined
  /** Tests only: the result carries the PDF.js sandbox as `_sandboxForTesting`. */
  testing?: boolean | undefined
}

/** What the sandbox sends: a widget update (with `id`) or a command. */
type Update = Record<string, unknown> & { id?: unknown; command?: unknown }

/** The event PDF.js's sandbox dispatches to a widget's scripts. */
type SandboxEvent = Record<string, unknown> & { id: string; name: string }

/**
 * Runs the document's JavaScript in PDF.js's QuickJS sandbox, wired to `form`. Resolves
 * `undefined` without loading the sandbox when the document has no JavaScript. A sandbox that
 * fails to load or start is reported as a `FormScriptError` on `form`, and resolves `undefined`,
 * so the form stays fillable without scripts.
 *
 * The sandbox gets its own `window`: alerts go to `form`'s `alert` event, `app.response` returns
 * `null` and asks the host with a `prompt` action, and timers are tracked and cleared on destroy.
 * Nothing reaches the page's `window.alert`, `prompt` or `confirm`, and nothing is fetched.
 */
export async function createFormScripting(
  opts: FormScriptingOptions
): Promise<(FormScripting & { _sandboxForTesting?: PdfjsSandbox }) | undefined> {
  const { proxy, assets, form } = opts
  // The sandbox runs on a browser page; elsewhere (Node) the form works without scripts.
  if (typeof window === 'undefined') return undefined
  // Cheap, and never misses JavaScript; the stricter check below needs the field objects.
  if (!(await proxy.hasJSActions())) return undefined
  const [objects, calculationOrder, actions] = await Promise.all([
    proxy.getFieldObjects(),
    proxy.getCalculationOrderIds(),
    proxy.getJSActions(),
  ])
  const hasFieldScripts = [...(objects?.values() ?? [])].some((list) =>
    list.some((o) => hasEntries((o as { actions?: unknown }).actions))
  )
  if (!hasFieldScripts && !hasEntries(actions)) return undefined

  const fields = form.fields.get()
  const byName = new Map(fields.map((f) => [f.name, f]))
  const byWidget = new Map(
    fields.flatMap((f) => f.widgets.map((w) => [w.id, f] as const))
  )
  const widgets = new Map(fields.flatMap((f) => f.widgets.map((w) => [w.id, w] as const)))
  /** What the sandbox holds, by field name, in the form's terms. */
  const mirror = new Map<string, FieldValue>()
  for (const f of fields) if (f.value !== undefined) mirror.set(f.name, f.value)

  let dead = false
  /** Updates sent during a synchronous dispatch, applied together once it returns. */
  let buffer: Update[] | undefined
  const report = (cause: unknown) => {
    if (dead) return
    const message = cause instanceof Error ? cause.message : String(cause)
    form._error(new InkError('FormScriptError', message, {}, cause))
  }
  const onSend = (detail: unknown) => {
    if (dead || typeof detail !== 'object' || detail === null) return
    if (buffer) buffer.push(detail as Update)
    else apply([detail as Update], { values: true })
  }

  const win = createWindow(form, onSend, report, () => dead)
  let sandbox: PdfjsSandbox
  try {
    sandbox = await withTimeout(
      sandboxLoader.load().then(({ QuickJSSandbox }) => QuickJSSandbox(assets.wasm)),
      SANDBOX_TIMEOUT_MS
    )
    const support = sandbox.support
    const engine = sandbox._module
    if (!support || !engine) throw new Error('The PDF.js sandbox has no engine')
    support.win = win.shim
    const patch = patchSandboxSource(engine)
    try {
      sandbox.create({
        objects,
        calculationOrder,
        appInfo: { platform: navigator.platform, language: navigator.language },
        docInfo: {
          Title: opts.info.title ?? '',
          Author: opts.info.author ?? '',
          numPages: opts.info.pageCount,
          URL: '',
          baseURL: '',
          actions,
        },
      })
    } catch (cause) {
      win.clear()
      throw patch.failure() ?? cause
    }
  } catch (cause) {
    dead = true
    form._error(
      new InkError(
        'FormScriptError',
        "The form's scripts could not start; it can still be filled in",
        {},
        cause
      )
    )
    return undefined
  }

  /** Page events run one after another. */
  let pages: Promise<void> = Promise.resolve()
  /** Pages whose actions the sandbox already has. */
  const visited = new Set<number>()

  /** Dispatches `event` and returns what the scripts sent while it ran. */
  const run = (event: SandboxEvent): Update[] => {
    const outer = buffer
    const got: Update[] = []
    buffer = got
    try {
      sandbox.dispatchEvent(event)
    } catch (cause) {
      report(cause)
    } finally {
      buffer = outer
    }
    return got
  }

  const fieldOf = (id: unknown) => (typeof id === 'string' ? byWidget.get(id) : undefined)
  const ownOf = (u: Update, field: FormField) => fieldOf(u.id) === field

  /**
   * Applies updates. `values: false` keeps the sandbox's values out of the form (an undo
   * replaying a state calculate already produced). The `source` field's own updates are
   * skipped when its commit was rejected, and its value always, since the form writes it.
   */
  function apply(
    updates: readonly Update[],
    o: { values: boolean; source?: { field: FormField; accepted: boolean } }
  ) {
    const next: Record<string, FieldValue> = {}
    for (const u of updates) {
      if (dead) return
      if (u.id === undefined || u.id === null) {
        command(u)
        continue
      }
      const field = fieldOf(u.id)
      if (!field) continue
      const own = o.source?.field === field
      if (own && !o.source?.accepted) continue
      if ('value' in u) {
        const value = fromSandbox(field, u.id as string, u.value)
        if (value !== undefined) {
          mirror.set(field.name, value)
          if (o.values && !own) next[field.name] = value
        }
      }
      if ('formattedValue' in u)
        form._setFormatted(
          field.name,
          typeof u.formattedValue === 'string' ? u.formattedValue : undefined
        )
      const override = overrideOf(u)
      if (override) {
        const siblings: unknown[] = Array.isArray(u.siblings)
          ? (u.siblings as unknown[])
          : []
        for (const id of [u.id, ...siblings])
          if (typeof id === 'string' && widgets.has(id))
            form._setWidgetState(id, override)
      }
      if (u.focus === true) form._focus(u.id as string)
    }
    if (Object.keys(next).length > 0) form._scriptValues(next)
  }

  function command(u: Update) {
    switch (u.command) {
      case 'print':
        form._emitAction({ kind: 'print' })
        break
      case ACTION_COMMAND: {
        const action = scriptAction(u.method, u.args, form)
        if (action) form._emitAction(action)
        break
      }
      case 'error':
        report(new Error(typeof u.value === 'string' ? u.value : 'A form script failed'))
        break
      // `println`, `clear` and the viewer commands (zoom, page, layout, menu items) have no
      // place in the form, so they are dropped.
    }
  }

  /**
   * Commits `value` to `field` in the sandbox: validate, calculate and format run. Returns the
   * value the sandbox kept, which a script may have changed, or `undefined` when rejected.
   */
  const commitTo = (
    field: FormField,
    value: FieldValue,
    values: boolean
  ): FieldValue | undefined => {
    const event = commitEvent(field, value)
    if (!event) {
      mirror.set(field.name, value)
      return value
    }
    const updates = run(event)
    // PDF.js answers a rejected commit with an empty value and a selection; an accepted one
    // reports the value and its formatted text without one.
    const accepted = !updates.some((u) => ownOf(u, field) && 'selRange' in u)
    apply(updates, { values, source: { field, accepted } })
    if (!accepted) return undefined
    // The sandbox reports a text value as the string it was given (it keeps the original
    // alongside any number it parses), so a difference here is a script's change.
    const echo = updates.filter((u) => ownOf(u, field) && 'value' in u).at(-1)
    const kept = echo ? fromSandbox(field, echo.id as string, echo.value) : undefined
    const stored = kept !== undefined && !sameValue(kept, value) ? kept : value
    mirror.set(field.name, stored)
    return stored
  }

  const scripting: FormScripting & { _sandboxForTesting?: PdfjsSandbox } = {
    commit(name, value) {
      const field = byName.get(name)
      if (dead || !field) return value
      return commitTo(field, value, true)
    },
    sync(values, calculate) {
      if (dead) return
      for (const field of fields) {
        const value = values[field.name]
        if (value === undefined || sameValue(value, mirror.get(field.name))) continue
        commitTo(field, value, calculate)
        if (dead) return
      }
    },
    dispatch(event) {
      const field = byWidget.get(event.widget)
      const widget = widgets.get(event.widget)
      if (dead || !field || !widget) return
      const value = event.value ?? currentValue(form, field, widget)
      apply(run(toSandboxEvent(event, value)), { values: true })
    },
    keystroke(widget, text, change, selStart, selEnd) {
      const field = byWidget.get(widget)
      if (dead || !field) return undefined
      const updates = run({
        id: widget,
        name: 'Keystroke',
        value: text,
        change,
        selStart,
        selEnd,
        willCommit: false,
      })
      // The sandbox now holds the typed text as the field's value; the next sync puts the
      // committed value back.
      mirror.delete(field.name)
      apply(updates, { values: true, source: { field, accepted: false } })
      return keystrokeResult(updates, field, text, change, selStart, selEnd)
    },
    pageEvent(page, name) {
      if (dead) return Promise.resolve()
      // In order, so a page's close follows its open. Like PDF.js's viewer, the page's own
      // actions go with its first open; the sandbox keeps them for later events.
      const step = pages.then(async () => {
        let actions: unknown = null
        if (name === 'PageOpen' && !visited.has(page)) {
          visited.add(page)
          actions = await (await proxy.getPage(page + 1)).getJSActions()
        }
        if (dead) return
        apply(run({ id: 'page', name, pageNumber: page + 1, actions }), { values: true })
      })
      pages = step.catch(report)
      return pages
    },
    destroy() {
      if (dead) return
      dead = true
      win.clear()
      try {
        sandbox.nukeSandbox()
      } catch {
        // The engine is being dropped either way; nothing else holds it.
      }
    },
  }
  if (opts.testing) scripting._sandboxForTesting = sandbox

  apply(run({ id: 'doc', name: 'Open' }), { values: true })
  // The form may start from values other than the file's (a host's initial values).
  scripting.sync(form.values.get(), opts.calculateAtStart === true)
  return scripting
}

/** A scalar from the sandbox as text; anything else is empty. */
function textOf(v: unknown): string {
  if (typeof v === 'string') return v
  return typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''
}

/** How long the sandbox may take to load before the form goes on without scripts. */
const SANDBOX_TIMEOUT_MS = 10_000

/**
 * Rejects when `promise` takes longer than `ms`, so a stalled wasm load never holds up the
 * document. A sandbox that arrives late is torn down.
 */
function withTimeout(promise: Promise<PdfjsSandbox>, ms: number): Promise<PdfjsSandbox> {
  return new Promise((resolve, reject) => {
    let late = false
    const timer = setTimeout(() => {
      late = true
      reject(new Error(`The PDF.js sandbox did not load within ${ms} ms`))
    }, ms)
    promise.then(
      (sandbox) => {
        clearTimeout(timer)
        if (late) sandbox.nukeSandbox()
        else resolve(sandbox)
      },
      (cause: unknown) => {
        clearTimeout(timer)
        reject(cause instanceof Error ? cause : new Error(String(cause)))
      }
    )
  })
}

function hasEntries(value: unknown): boolean {
  if (value instanceof Map) return value.size > 0
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0
}

interface ShimWindow {
  shim: Record<string, unknown>
  /** Clears every timer the scripts started. */
  clear(): void
}

/** The `window` the sandbox sees. */
function createWindow(
  form: FormController,
  onSend: (detail: unknown) => void,
  report: (cause: unknown) => void,
  isDead: () => boolean
): ShimWindow {
  type Id = ReturnType<typeof setTimeout>
  const timers = new Map<Id, 'timeout' | 'interval'>()
  const clear = (id: Id) => {
    const kind = timers.get(id)
    if (!kind) return
    timers.delete(id)
    if (kind === 'interval') clearInterval(id)
    else clearTimeout(id)
  }
  const noop = () => undefined
  class ShimEvent {
    readonly type: string
    readonly detail: unknown
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type
      this.detail = init?.detail
    }
  }
  const shim = {
    alert: (message: string) => {
      if (!isDead()) form._alert(message)
    },
    confirm: () => false,
    // PDF.js calls this synchronously, so it cannot wait for an answer: the host is asked
    // and the script gets the cancel result.
    prompt: (message: string) => {
      if (!isDead()) form._emitAction({ kind: 'prompt', message })
      return null
    },
    setTimeout: (fn: () => void, ms: number) => {
      if (isDead()) return 0
      const id = setTimeout(() => {
        timers.delete(id)
        if (!isDead()) fn()
      }, ms)
      timers.set(id, 'timeout')
      return id
    },
    setInterval: (fn: () => void, ms: number) => {
      if (isDead()) return 0
      const id = setInterval(() => {
        if (!isDead()) fn()
      }, ms)
      timers.set(id, 'interval')
      return id
    },
    clearTimeout: clear,
    clearInterval: clear,
    console: { log: noop, info: noop, warn: noop, debug: noop, error: report },
    URL,
    CustomEvent: ShimEvent,
    dispatchEvent: (event: ShimEvent) => {
      if (event.type === 'updatefromsandbox') onSend(event.detail)
      return true
    },
  }
  return {
    shim,
    clear() {
      for (const id of [...timers.keys()]) clear(id)
    },
  }
}

/** The event that commits `value` the way a person would, or none for a field without one. */
function commitEvent(field: FormField, value: FieldValue): SandboxEvent | undefined {
  const first = field.widgets[0]
  if (!first) return undefined
  switch (field.type) {
    case 'checkbox':
    case 'radio': {
      const on = field.widgets.find((w) => w.onState !== undefined && w.onState === value)
      // A radio group has no widget to turn off; the sandbox keeps its choice.
      if (!on && (value !== 'Off' || field.type === 'radio')) return undefined
      return { id: (on ?? first).id, name: 'Validate', value: on !== undefined }
    }
    case 'text':
    case 'combo':
    case 'list': {
      if (typeof value !== 'string' && !Array.isArray(value)) return undefined
      const end = typeof value === 'string' ? value.length : 0
      return {
        id: first.id,
        name: 'Keystroke',
        value,
        change: '',
        willCommit: true,
        commitKey: 1,
        selStart: end,
        selEnd: end,
      }
    }
    default:
      return undefined
  }
}

/** The value an event carries when the form layer gives none: what the widget shows. */
function currentValue(
  form: FormController,
  field: FormField,
  widget: FormWidget
): string | boolean | readonly string[] | undefined {
  const value = form.get(field.name)
  switch (field.type) {
    case 'checkbox':
    case 'radio':
      return widget.onState !== undefined && value === widget.onState
    case 'text':
    case 'combo':
    case 'list':
      return typeof value === 'string' || Array.isArray(value) ? value : ''
    default:
      return undefined
  }
}

function toSandboxEvent(
  event: FormEvent,
  value: string | boolean | readonly string[] | undefined
): SandboxEvent {
  const out: SandboxEvent = { id: event.widget, name: event.name }
  if (value !== undefined) out.value = value
  for (const key of ['change', 'selStart', 'selEnd', 'willCommit', 'commitKey'] as const)
    if (event[key] !== undefined) out[key] = event[key]
  return out
}

/** A value from the sandbox in the form's terms; `undefined` for a field without one. */
function fromSandbox(
  field: FormField,
  id: string,
  value: unknown
): FieldValue | undefined {
  switch (field.type) {
    case 'checkbox':
    case 'radio': {
      if (value === 'Off' || value === '' || value === null || value === undefined)
        return 'Off'
      // The sandbox holds export values and sends the widget it turned on.
      const on =
        field.widgets.find((w) => w.id === id && w.onState !== undefined) ??
        field.widgets.find((w) => w.onState === value)
      return on?.onState ?? textOf(value)
    }
    case 'list':
      if (field.flags.multiSelect)
        return Array.isArray(value)
          ? value.map(textOf)
          : value === ''
            ? []
            : [textOf(value)]
      return Array.isArray(value) ? textOf(value[0]) : textOf(value)
    case 'text':
    case 'combo':
      return Array.isArray(value) ? textOf(value[0]) : textOf(value)
    default:
      return undefined
  }
}

/** `["RGB", r, g, b]`, `["G", g]`, `["CMYK", c, m, y, k]` or `["T"]` as `#rrggbb`. */
function colorOf(value: unknown): string | undefined {
  if (!Array.isArray(value) || typeof value[0] !== 'string') return undefined
  const [space, ...raw] = value as [string, ...unknown[]]
  const n = raw.map((v) => (typeof v === 'number' ? Math.min(1, Math.max(0, v)) : 0))
  let rgb: number[]
  if (space === 'T') return 'transparent'
  if (space === 'G') rgb = [n[0] ?? 0, n[0] ?? 0, n[0] ?? 0]
  else if (space === 'RGB') rgb = [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0]
  else if (space === 'CMYK') {
    const k = n[3] ?? 0
    rgb = [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0].map((c) => (1 - c) * (1 - k))
  } else return undefined
  return `#${rgb
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

function overrideOf(u: Update): WidgetOverride | undefined {
  const o: WidgetOverride = {}
  if (typeof u.hidden === 'boolean') o.hidden = u.hidden
  // `display`: 0 visible, 1 hidden, 2 no print, 3 no view.
  if (typeof u.display === 'number') o.hidden = u.display % 2 === 1
  if (typeof u.readonly === 'boolean') o.readOnly = u.readonly
  if (typeof u.required === 'boolean') o.required = u.required
  const text = colorOf(u.textColor ?? u.fgColor)
  const fill = colorOf(u.fillColor ?? u.bgColor)
  const stroke = colorOf(u.strokeColor ?? u.borderColor)
  if (text) o.textColor = text
  if (fill) o.fillColor = fill
  if (stroke) o.strokeColor = stroke
  if (typeof u.textSize === 'number' && Number.isFinite(u.textSize) && u.textSize >= 0)
    o.textSize = u.textSize
  return Object.keys(o).length > 0 ? o : undefined
}

function keystrokeResult(
  updates: readonly Update[],
  field: FormField,
  text: string,
  change: string,
  selStart: number,
  selEnd: number
): KeystrokeResult {
  const merged = text.slice(0, selStart) + change + text.slice(selEnd)
  const caret = selStart + change.length
  const own = updates.filter((u) => {
    const id = typeof u.id === 'string' ? u.id : undefined
    return id !== undefined && field.widgets.some((w) => w.id === id) && 'value' in u
  })
  const last = own.at(-1)
  if (!last) return { accepted: true, value: merged, selStart: caret, selEnd: caret }
  const value = textOf(last.value)
  // A refused keystroke comes back as the text before it.
  const accepted = !(value === text && merged !== text)
  const range = Array.isArray(last.selRange) ? last.selRange : []
  const start = typeof range[0] === 'number' ? range[0] : caret
  const end = typeof range[1] === 'number' ? range[1] : start
  return accepted
    ? { accepted, value, selStart: start, selEnd: end }
    : { accepted, value: text, selStart, selEnd }
}

/** Maps a rewritten method's call (positional or Acrobat's single-object form) to an action. */
function scriptAction(
  method: unknown,
  args: unknown,
  form: FormController
): FormAction | undefined {
  const list = Array.isArray(args) ? (args as unknown[]) : []
  const first = list[0]
  const named =
    typeof first === 'object' && first !== null && !Array.isArray(first)
      ? (first as Record<string, unknown>)
      : undefined
  const arg = (key: string, index: number): unknown => (named ? named[key] : list[index])
  const str = (key: string, index: number): string | undefined => {
    const v = arg(key, index)
    return typeof v === 'string' ? v : undefined
  }
  switch (method) {
    case 'submitForm': {
      const url = safeUrl(str('cURL', 0) ?? '')
      if (!url) return undefined
      const format = submitFormat(
        str('cSubmitAs', 15),
        arg('bPDF', 8),
        arg('bXML', 6),
        arg('bFDF', 1)
      )
      const raw = arg('aFields', 3)
      const names = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).filter(
        (n): n is string => typeof n === 'string'
      )
      return {
        kind: 'submit',
        url,
        fields: submitValues(form.values.get(), form.fields.get(), names, true),
        format,
        ...(format === 'html'
          ? { method: arg('bGet', 4) === true ? 'GET' : 'POST' }
          : {}),
      }
    }
    case 'mailDoc':
    case 'mailForm': {
      const out: FormAction & { kind: 'mail' } = {
        kind: 'mail',
        withData: method === 'mailForm',
      }
      const to = str('cTo', 1)
      const cc = str('cCc', 2)
      const bcc = str('cBcc', 3)
      const subject = str('cSubject', 4)
      const body = str('cMsg', 5)
      for (const address of [to, cc, bcc])
        if (address !== undefined && safeAddress(address) === undefined) return undefined
      if (to !== undefined) out.to = to
      if (cc !== undefined) out.cc = cc
      if (bcc !== undefined) out.bcc = bcc
      if (subject !== undefined) out.subject = subject
      if (body !== undefined) out.body = body
      return out
    }
    case 'launchURL': {
      const url = safeUrl(str('cURL', 0) ?? '')
      return url
        ? { kind: 'open-url', url, newWindow: arg('bNewFrame', 1) === true }
        : undefined
    }
    default:
      return undefined
  }
}

/** `cSubmitAs` wins, then `bPDF`, then `bXML`; otherwise FDF, or HTML when `bFDF` is false. */
function submitFormat(
  submitAs: string | undefined,
  pdf: unknown,
  xml: unknown,
  fdf: unknown
): 'fdf' | 'xfdf' | 'html' | 'pdf' {
  switch (submitAs?.toUpperCase()) {
    case 'FDF':
      return 'fdf'
    case 'XFDF':
    case 'XFD':
    case 'XML':
      return 'xfdf'
    case 'HTML':
      return 'html'
    case 'PDF':
      return 'pdf'
  }
  if (pdf === true) return 'pdf'
  if (xml === true) return 'xfdf'
  return fdf === false ? 'html' : 'fdf'
}
