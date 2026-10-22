import { Emitter } from '../events'
import { readonly, writable, type Readable } from '../readable'
import { createRecordStore, type RecordStore } from '../records'

import { checkValue, normaliseValue, resetValue, sameValue, suits } from './values'

import type { InkError } from '../errors'
import type {
  FieldsChange,
  FieldsMode,
  FieldValue,
  FieldValues,
  FormAction,
  FormEvent,
  FormField,
  FormSetResult,
  WidgetOverride,
} from './types'

export interface FieldRecord {
  readonly id: string
  readonly value: FieldValue
}

export interface FormController {
  /** Structure, read once on load. */
  readonly fields: Readable<readonly FormField[]>
  /** What the screen and the sandbox hold, keyed by full name. */
  readonly values: Readable<FieldValues>
  /** Formatted text per field, for display when not focused; set by scripts. */
  readonly formatted: Readable<Readonly<Record<string, string>>>
  /** Script-driven widget state: hidden, readOnly, required, colours, by widget id. */
  readonly widgetState: Readable<Readonly<Record<string, WidgetOverride>>>
  readonly hasScripts: boolean
  get(name: string): FieldValue | undefined
  /**
   * Commits `values` as a person would: each runs its validate and calculate scripts, and the
   * whole call is one undo step. A value that is unknown, read-only, invalid for the field or
   * rejected by a script is left out and listed in `rejected`. In controlled mode the full map
   * is reported once afterwards.
   */
  set(values: FieldValues): FormSetResult
  /**
   * Restores the PDF's default values of `names`, or of every field. Read-only fields reset
   * too, as in Acrobat; locked fields keep theirs.
   */
  reset(names?: readonly string[]): void
  /**
   * Controlled mode only: the host pushes its values. Names it leaves out keep their value.
   * Pushing what the form already holds does nothing; otherwise calculate scripts run, and a
   * calculation that changes more is reported once. Before the fields load, the push waits for
   * them.
   */
  setControlledValue(next: FieldValues): void
  on(event: 'action', fn: (a: FormAction) => void): () => void
  on(event: 'alert', fn: (message: string) => void): () => void
  /** A script failed. The document keeps working; the form layer shows or logs it. */
  on(event: 'error', fn: (e: InkError) => void): () => void
  /** @internal The scripting seam and the form layer. */
  readonly _store: RecordStore<FieldRecord>
  _attachScripting(s: FormScripting): void
  _emitAction(a: FormAction): void
  /** Without scripting: no-op, except that a Blur drops the widget's uncommitted text. */
  _dispatch(event: FormEvent): void
  /**
   * Applies a keystroke to the widget's text as typed so far (its uncommitted text, else the
   * field's value). Without scripting it accepts every keystroke. The uncommitted text is dropped
   * when the field's value changes or the widget blurs.
   */
  _keystroke(
    widget: string,
    change: string,
    selStart: number,
    selEnd: number
  ): { accepted: boolean; value: string; selStart: number; selEnd: number }
  /** @internal Sets a field's formatted text; `undefined` clears it. */
  _setFormatted(name: string, text: string | undefined): void
  /** @internal Merges into a widget's override; `undefined` clears it. */
  _setWidgetState(widgetId: string, override: WidgetOverride | undefined): void
  /** @internal Reports a script error to `onError` and the `error` listeners. */
  _error(e: InkError): void
  /** @internal Sets the structure once the file's fields are read, applying any waiting push. */
  _load(fields: readonly FormField[]): void
  /**
   * @internal Applies values already checked by `fieldsFromGloss`, as an import: not an undo
   * step, and reported to a controlled host as `import`.
   */
  _import(values: FieldValues): void
  /** @internal Destroys the scripting and drops every listener. */
  _destroy(): void
}

export interface FormScripting {
  /** Runs validate for `name` with `value`; false = rejected. Then calculate. Synchronous. */
  commit(name: string, value: FieldValue): boolean
  /** After values change without a user commit (host push, import, reset, undo). */
  sync(values: FieldValues, calculate: boolean): void
  destroy(): void
}

export interface FormControllerOptions {
  fields: readonly FormField[]
  mode: FieldsMode
  onError(e: InkError): void
  /** Runs `fn` as one undo step. Defaults to running it. */
  batch?: ((fn: () => void) => void) | undefined
}

/**
 * The document's form values, in a record store keyed by field name (`{ id: name, value }`).
 * In controlled mode the store is the working copy: a change shows and reaches the sandbox at
 * once, and the host hears of it after.
 */
export function createFormController(opts: FormControllerOptions): FormController {
  const controlled = opts.mode.mode === 'controlled' ? opts.mode : undefined
  const batch = opts.batch ?? ((fn: () => void) => fn())
  const fields = writable<readonly FormField[]>([])
  let byName = new Map<string, FormField>()
  let byWidget = new Map<string, FormField>()
  let loaded = false
  /** A push that arrived before the fields loaded. */
  let waiting: FieldValues | undefined
  let scripting: FormScripting | undefined
  let destroyed = false
  const emitter = new Emitter<{ action: FormAction; alert: string; error: InkError }>()
  /** Text typed into a widget and not yet committed, by widget id. */
  const pending = new Map<string, string>()
  const formatted = writable<Readonly<Record<string, string>>>({})
  const widgetState = writable<Readonly<Record<string, WidgetOverride>>>({})

  const store = createRecordStore<FieldRecord>('form.fields')

  let cachedList: readonly FieldRecord[] | undefined
  let cachedMap: FieldValues = Object.freeze({})
  const current = (): FieldValues => {
    const list = store.list.get()
    if (list !== cachedList) {
      cachedList = list
      cachedMap = Object.freeze(Object.fromEntries(list.map((r) => [r.id, r.value])))
    }
    return cachedMap
  }
  const values: Readable<FieldValues> = {
    get: current,
    subscribe: (fn) => store.list.subscribe(() => fn(current())),
  }

  /** Drops the uncommitted text of the field's widgets. */
  const dropPending = (name: string) => {
    for (const w of byName.get(name)?.widgets ?? []) pending.delete(w.id)
  }

  store.on('change', (change) => {
    if (change.kind === 'add' || change.kind === 'remove') dropPending(change.record.id)
    else if (change.kind === 'update') dropPending(change.id)
    else
      for (const id of [...change.added, ...change.updated, ...change.removed])
        dropPending(id)
    if (change.kind !== 'replace' || change.reason !== 'history') return
    scripting?.sync(current(), false)
    if (controlled) controlled.onChange(current(), { kind: 'history' })
  })

  /** Writes one value (none removes it), skipping one equal to what is stored. */
  const write = (name: string, value: FieldValue | undefined): boolean => {
    const before = store.get(name)
    if (sameValue(before?.value, value)) return false
    if (value === undefined) store.remove(name)
    else if (before) store.update(name, { value })
    else store.add({ id: name, value })
    return true
  }

  /** Writes several values as one change, so subscribers hear of it once. */
  const writeAll = (entries: readonly (readonly [string, FieldValue])[]) => {
    const list = new Map(store.list.get().map((r) => [r.id, r]))
    for (const [name, value] of entries) list.set(name, { id: name, value })
    store.replaceAll([...list.values()], 'reset')
  }

  /** The names whose value differs between two maps. */
  const changed = (a: FieldValues, b: FieldValues): string[] =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
      (name) => !sameValue(a[name], b[name])
    )

  /** Runs `fn`, then reports to a controlled host when the values changed. */
  const reporting = (
    fn: () => void,
    change: (names: string[]) => FieldsChange | undefined
  ) => {
    const before = current()
    batch(fn)
    const after = current()
    if (!controlled || destroyed || after === before) return
    const names = changed(before, after)
    const report = names.length > 0 ? change(names) : undefined
    if (report) controlled.onChange(after, report)
  }

  /**
   * The entries of a host's values that suit their fields, normalised. Read-only only stops a
   * person, so a host may set a read-only field; a locked one keeps its value.
   */
  const valid = (next: FieldValues): [string, FieldValue][] =>
    Object.entries(next).flatMap(([name, value]): [string, FieldValue][] => {
      const field = byName.get(name)
      return field && !field.locked && suits(field, value)
        ? [[name, normaliseValue(field, value)]]
        : []
    })

  const load = (list: readonly FormField[]) => {
    loaded = true
    fields.set(list)
    byName = new Map(list.map((f) => [f.name, f]))
    byWidget = new Map(list.flatMap((f) => f.widgets.map((w) => [w.id, f] as const)))
    const start = new Map<string, FieldValue>()
    for (const f of list) if (f.value !== undefined) start.set(f.name, f.value)
    for (const [name, value] of valid(opts.mode.initial ?? {})) start.set(name, value)
    if (waiting) for (const [name, value] of valid(waiting)) start.set(name, value)
    waiting = undefined
    store.replaceAll(
      [...start].map(([id, value]) => ({ id, value })),
      'reset'
    )
  }

  const form: FormController = {
    fields: readonly(fields),
    values,
    formatted: readonly(formatted),
    widgetState: readonly(widgetState),
    get hasScripts() {
      return fields.get().some((f) => f.widgets.some((w) => w.hasScripts))
    },
    get: (name) => store.get(name)?.value,
    set(next) {
      const result: FormSetResult = { applied: [], rejected: [] }
      if (destroyed) return result
      reporting(
        () => {
          for (const [name, value] of Object.entries(next)) {
            const field = byName.get(name)
            const reason = field ? checkValue(field, value) : 'unknown'
            if (reason || !field) {
              result.rejected.push({ name, reason: reason ?? 'unknown' })
              continue
            }
            dropPending(name)
            const stored = normaliseValue(field, value)
            if (scripting && !scripting.commit(name, stored)) {
              result.rejected.push({ name, reason: 'script' })
              continue
            }
            write(name, stored)
            result.applied.push(name)
          }
        },
        () => ({ kind: 'commit', names: result.applied })
      )
      return result
    },
    reset(names) {
      if (destroyed) return
      const targets = names ? names.flatMap((n) => byName.get(n) ?? []) : fields.get()
      reporting(
        () => {
          let any = false
          for (const field of targets)
            if (!field.locked) any = write(field.name, resetValue(field)) || any
          if (any) scripting?.sync(current(), true)
        },
        (changedNames) => ({ kind: 'reset', names: changedNames })
      )
    },
    setControlledValue(next) {
      if (!controlled || destroyed) return
      if (!loaded) {
        waiting = { ...waiting, ...next }
        return
      }
      const pushed = valid(next).filter(
        ([name, value]) => !sameValue(store.get(name)?.value, value)
      )
      if (pushed.length === 0) return
      writeAll(pushed)
      const expected = current()
      scripting?.sync(expected, true)
      const after = current()
      if (after === expected) return
      const names = changed(expected, after)
      if (names.length > 0) controlled.onChange(after, { kind: 'calculate', names })
    },
    on(
      event: 'action' | 'alert' | 'error',
      fn: (payload: FormAction & string & InkError) => void
    ) {
      return emitter.on(event, fn as (payload: FormAction | string | InkError) => void)
    },
    _store: store,
    _attachScripting(s) {
      if (destroyed) {
        s.destroy()
        return
      }
      scripting?.destroy()
      scripting = s
    },
    _emitAction(a) {
      if (!destroyed) emitter.emit('action', a)
    },
    _dispatch(event) {
      // Scripts handle events once a sandbox is attached; without one there is nothing to run.
      if (event.name === 'Blur') pending.delete(event.widget)
    },
    _keystroke(widget, change, selStart, selEnd) {
      const field = byWidget.get(widget)
      const stored = field ? store.get(field.name)?.value : undefined
      const before = pending.get(widget) ?? (typeof stored === 'string' ? stored : '')
      const caret = selStart + change.length
      const value = before.slice(0, selStart) + change + before.slice(selEnd)
      if (!destroyed) pending.set(widget, value)
      return { accepted: true, value, selStart: caret, selEnd: caret }
    },
    _setFormatted(name, text) {
      if (destroyed) return
      const { [name]: _old, ...rest } = formatted.get()
      formatted.set(Object.freeze(text === undefined ? rest : { ...rest, [name]: text }))
    },
    _setWidgetState(widgetId, override) {
      if (destroyed) return
      const { [widgetId]: old, ...rest } = widgetState.get()
      widgetState.set(
        Object.freeze(
          override === undefined
            ? rest
            : { ...rest, [widgetId]: Object.freeze({ ...old, ...override }) }
        )
      )
    },
    _error(e) {
      if (destroyed) return
      opts.onError(e)
      emitter.emit('error', e)
    },
    _load: load,
    _import(next) {
      if (destroyed) return
      const before = current()
      writeAll(Object.entries(next))
      const names = changed(before, current())
      if (names.length === 0) return
      scripting?.sync(current(), true)
      if (controlled) controlled.onChange(current(), { kind: 'import', names })
    },
    _destroy() {
      if (destroyed) return
      destroyed = true
      scripting?.destroy()
      scripting = undefined
      emitter.clear()
      store.destroy()
    },
  }
  // A document builds its controller before the file's fields are read, and loads them later.
  if (opts.fields.length > 0) load(opts.fields)
  return form
}
