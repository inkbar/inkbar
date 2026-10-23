import { Emitter } from '../events'
import { readonly, writable, type Readable } from '../readable'
import { createRecordStore, type RecordStore } from '../records'

import { submitValues } from './submit'
import { safeUrl } from './url'
import { checkValue, normaliseValue, resetValue, sameValue, suits } from './values'

import type { AnnotationEdit, AnnotationStore } from '../annotations/store'
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
  FormWidget,
  WidgetAction,
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
  /**
   * Whether the form has JavaScript: a widget's scripts, or document-level or page scripts
   * running in the sandbox.
   */
  readonly hasScripts: boolean
  get(name: string): FieldValue | undefined
  /**
   * Commits `values` as a person would: each runs its validate and calculate scripts, and the
   * whole call is one undo step. A value that is unknown, read-only, invalid for the field or
   * rejected by a script is left out and listed in `rejected`. In controlled mode the full map
   * is reported once afterwards, as a `commit` naming the fields set and the fields a
   * calculation changed.
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
  /**
   * A script failed. The document keeps working; the form layer shows or logs it. Errors from
   * before the first listener (a sandbox that failed to start while the document opened) go to
   * that listener once, as it subscribes.
   */
  on(event: 'error', fn: (e: InkError) => void): () => void
  /** A script asked to move focus to this widget (by id). */
  on(event: 'focus', fn: (widgetId: string) => void): () => void
  /** A widget's `/GoTo` action ran: show this page (zero-based). */
  on(event: 'goto', fn: (page: number) => void): () => void
  /** @internal The scripting seam and the form layer. */
  readonly _store: RecordStore<FieldRecord>
  _attachScripting(s: FormScripting): void
  _emitAction(a: FormAction): void
  /**
   * Runs the widget's scripts for `event`, and on `Action` its non-script action (reset,
   * submit, URI, named Print, GoTo). A Blur drops the widget's uncommitted text.
   */
  _dispatch(event: FormEvent): void
  /**
   * @internal Runs `fn` as one undo step, so a widget's activation (its new value, its Mouse Up
   * and its Action, with the scripts and reset they run) undoes at once.
   */
  _step(fn: () => void): void
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
  ): KeystrokeResult
  /**
   * @internal A page's form layer mounted (`PageOpen`) or went (`PageClose`): runs the page's
   * open or close scripts. Resolves once they ran; nothing runs without scripts.
   */
  _pageEvent(page: number, name: PageEventName): Promise<void>
  /** @internal Sets a field's formatted text; `undefined` clears it. */
  _setFormatted(name: string, text: string | undefined): void
  /** @internal Merges into a widget's override; `undefined` clears it. */
  _setWidgetState(widgetId: string, override: WidgetOverride | undefined): void
  /** @internal Reports a script error to `onError` and the `error` listeners. */
  _error(e: InkError): void
  /** @internal A script's `app.alert`. */
  _alert(message: string): void
  /** @internal A script moved focus to a widget. */
  _focus(widgetId: string): void
  /**
   * @internal Values a script set (a calculation, or a script assigning a field). Read-only
   * fields take them; locked fields and values that do not suit the field are skipped. Inside
   * a commit, reset or widget event they join its undo step. Outside one (a timer, a page's
   * open or close script, a keystroke script) they are no undo step: they become the history's
   * baseline, so undo never rewinds them. A controlled host hears of them as `calculate`.
   */
  _scriptValues(values: FieldValues): void
  /** @internal Each page's `/Tabs`, for pages that set one; set with the fields. */
  readonly _tabs: ReadonlyMap<number, 'R' | 'C' | 'S' | 'W'>
  /** @internal Sets the structure once the file's fields are read, applying any waiting push. */
  _load(
    fields: readonly FormField[],
    tabs?: ReadonlyMap<number, 'R' | 'C' | 'S' | 'W'>
  ): void
  /**
   * @internal Applies values already checked by `fieldsFromGloss`, as an import: neither the
   * values nor what they calculate are an undo step. A controlled host hears of both as one
   * `import`.
   */
  _import(values: FieldValues): void
  /**
   * @internal Keeps signature fields and the annotations that sign them in step, from now
   * until `_destroy`. Each signing annotation is pinned in the store. Removing one (by a person,
   * an import, a controlled host that drops it, or undo) clears its field, and clearing the
   * field (a reset, a host's push of another value, an import) removes the annotation.
   */
  _linkAnnotations(link: SignatureLink): void
  /**
   * @internal Signs signature field `name` with annotation `id`, reported to a controlled
   * host as a `commit`. When the annotation is not in the list yet (a controlled host has it
   * proposed), the field is signed once it arrives, and stays empty if the host drops it.
   */
  _signWith(name: string, id: string): void
  /**
   * @internal Whether `name` waits for a signature a controlled host has proposed and not
   * applied or dropped yet.
   */
  _awaitingSignature(name: string): boolean
  /** @internal Destroys the scripting and drops every listener. */
  _destroy(): void
}

/** What `_linkAnnotations` needs from the document. */
export interface SignatureLink {
  store: AnnotationStore
  /** The history's `react`: runs inside a person's edit, so the field clears in the same step. */
  react(fn: (edit: AnnotationEdit) => void): () => void
  /**
   * True when undo and redo replay the field values together with the annotations, so an
   * annotation replay leaves the fields to theirs.
   */
  replays: boolean
}

/** A page event a page's scripts may handle. */
export type PageEventName = 'PageOpen' | 'PageClose'

export interface KeystrokeResult {
  accepted: boolean
  value: string
  selStart: number
  selEnd: number
}

export interface FormScripting {
  /**
   * Runs validate for `name` with `value`, then calculate. Synchronous. Returns the value to
   * store (a script may change it), or `undefined` when a script rejected it.
   */
  commit(name: string, value: FieldValue): FieldValue | undefined
  /** After values change without a user commit (host push, import, reset, undo). */
  sync(values: FieldValues, calculate: boolean): void
  /** Runs a widget event's scripts. Synchronous. */
  dispatch(event: FormEvent): void
  /**
   * Runs the widget's keystroke scripts on `text`, the text typed so far. `undefined` when the
   * widget has no field in the sandbox.
   */
  keystroke(
    widget: string,
    text: string,
    change: string,
    selStart: number,
    selEnd: number
  ): KeystrokeResult | undefined
  /** Runs `page`'s (zero-based) open or close scripts; resolves once they ran. */
  pageEvent(page: number, name: PageEventName): Promise<void>
  destroy(): void
}

export interface FormControllerOptions {
  fields: readonly FormField[]
  mode: FieldsMode
  onError(e: InkError): void
  /** Runs `fn` as one undo step. Defaults to running it. */
  batch?: ((fn: () => void) => void) | undefined
  /**
   * Runs `fn` without an undo step: what it changes becomes the history's baseline. Defaults
   * to running it.
   */
  quiet?: ((fn: () => void) => void) | undefined
}

/** How many errors from before the first `error` listener are kept for it. */
const UNHEARD_LIMIT = 20

/**
 * The document's form values, in a record store keyed by field name (`{ id: name, value }`).
 * In controlled mode the store is the working copy: a change shows and reaches the sandbox at
 * once, and the host hears of it after.
 */
export function createFormController(opts: FormControllerOptions): FormController {
  const controlled = opts.mode.mode === 'controlled' ? opts.mode : undefined
  const batch = opts.batch ?? ((fn: () => void) => fn())
  const quiet = opts.quiet ?? ((fn: () => void) => fn())
  const fields = writable<readonly FormField[]>([])
  let byName = new Map<string, FormField>()
  let byWidget = new Map<string, FormField>()
  let widgets = new Map<string, FormWidget>()
  let loaded = false
  let tabs: ReadonlyMap<number, 'R' | 'C' | 'S' | 'W'> = new Map()
  /** A push that arrived before the fields loaded. */
  let waiting: FieldValues | undefined
  let scripting: FormScripting | undefined
  let destroyed = false
  const emitter = new Emitter<{
    action: FormAction
    alert: string
    error: InkError
    focus: string
    goto: number
  }>()
  /**
   * Errors reported before anything listened for them, the newest `UNHEARD_LIMIT`;
   * `undefined` once something has.
   */
  let unheard: InkError[] | undefined = []
  /** How many changes are running whose values are reported when they finish. */
  let depth = 0
  /** Text typed into a widget and not yet committed, by widget id. */
  const pending = new Map<string, string>()
  const formatted = writable<Readonly<Record<string, string>>>({})
  const widgetState = writable<Readonly<Record<string, WidgetOverride>>>({})

  const store = createRecordStore<FieldRecord>('form.fields')
  /** The annotations signature fields are signed with, once linked. */
  let annotations: AnnotationStore | undefined
  /** Whether undo and redo replay the field values along with the annotations. */
  let replays = false
  /** Signatures proposed to a controlled host and not in the list yet: annotation id to field. */
  const awaiting = new Map<string, string>()
  /**
   * Signatures whose annotation went and cleared their field, by annotation id, when the
   * field values have no undo history of their own (controlled fields). Undo or redo that
   * brings the annotation back signs its field again.
   */
  const dropped = new Map<string, string>()
  const unlink: (() => void)[] = []

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
    // Only an uncontrolled document has undo history, so no controlled host hears of this.
    if (change.kind !== 'replace' || change.reason !== 'history') return
    within(() => scripting?.sync(current(), false))
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

  /**
   * Runs `fn` as one undo step (or through `step`), then reports to a controlled host when the
   * values changed.
   */
  const reporting = (
    fn: () => void,
    change: (names: string[]) => FieldsChange | undefined,
    step = batch
  ) => {
    const before = current()
    depth++
    try {
      step(fn)
    } finally {
      depth--
    }
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

  /** Runs `fn` as part of a change the caller reports itself. */
  const within = (fn: () => void) => {
    depth++
    try {
      fn()
    } finally {
      depth--
    }
  }

  /** The names an action's include or exclude list picks; every field when the list is empty. */
  const picked = (names: readonly string[], include: boolean): string[] => {
    const all = fields.get().map((f) => f.name)
    if (names.length === 0) return all
    const listed = (name: string) =>
      names.some((n) => name === n || name.startsWith(`${n}.`))
    return all.filter((name) => listed(name) === include)
  }

  /** A widget's non-script action. Inkbar never sends, opens or prints; the host is told. */
  const runAction = (action: WidgetAction) => {
    switch (action.kind) {
      case 'reset':
        form.reset(picked(action.fields, action.include))
        break
      case 'submit': {
        // The file's own URLs get the same check as a script's.
        const url = safeUrl(action.url)
        if (!url) break
        form._emitAction({
          kind: 'submit',
          url,
          fields: submitValues(current(), fields.get(), action.fields, action.include),
          format: action.format,
          ...(action.method ? { method: action.method } : {}),
        })
        break
      }
      case 'uri': {
        const url = safeUrl(action.url)
        if (url) form._emitAction({ kind: 'open-url', url, newWindow: false })
        break
      }
      case 'named':
        if (action.name === 'Print') form._emitAction({ kind: 'print' })
        break
      case 'goto':
        if (!destroyed) emitter.emit('goto', action.page)
        break
    }
  }

  const load = (
    list: readonly FormField[],
    pageTabs?: ReadonlyMap<number, 'R' | 'C' | 'S' | 'W'>
  ) => {
    loaded = true
    tabs = pageTabs ?? new Map()
    fields.set(list)
    byName = new Map(list.map((f) => [f.name, f]))
    byWidget = new Map(list.flatMap((f) => f.widgets.map((w) => [w.id, f] as const)))
    widgets = new Map(list.flatMap((f) => f.widgets.map((w) => [w.id, w] as const)))
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

  /** The annotation a signature field's value names, if it has one. */
  const signatureOf = (name: string): string | undefined => {
    const value = store.get(name)?.value
    return typeof value === 'object' && !Array.isArray(value)
      ? (value as { signature: string }).signature
      : undefined
  }

  /** Each signed signature field's annotation id, by field name. */
  const signedFields = (): Map<string, string> => {
    const out = new Map<string, string>()
    for (const f of fields.get()) {
      if (f.type !== 'signature') continue
      const id = signatureOf(f.name)
      if (id !== undefined) out.set(f.name, id)
    }
    return out
  }

  const pin = () => annotations?._setPinned(new Set(signedFields().values()))

  /**
   * Clears the signature fields whose annotation has gone, as a commit. One a controlled host
   * still has proposed (an import's, say) has not gone; it goes once the host drops it.
   */
  const dropDangling = () => {
    const linked = annotations
    if (!linked || destroyed) return
    const gone = [...signedFields()].filter(
      ([, id]) => !linked.get(id) && !linked._getProposed(id)
    )
    if (gone.length > 0)
      reporting(
        () => {
          for (const [name, id] of gone) {
            if (!replays) dropped.set(id, name)
            write(name, undefined)
          }
        },
        (names) => ({ kind: 'commit', names })
      )
    pin()
  }

  /** Signs again the fields whose dropped signature an undo or redo brought back. */
  const restore = () => {
    const linked = annotations
    if (!linked || destroyed) return
    for (const [id, name] of [...dropped]) {
      if (!linked.get(id)) continue
      dropped.delete(id)
      const field = byName.get(name)
      if (field?.type === 'signature' && !field.locked && signatureOf(name) === undefined)
        sign(name, id)
    }
  }

  /** Writes a signature, as a commit. */
  const sign = (name: string, id: string) =>
    reporting(
      () => {
        write(name, Object.freeze({ signature: id }))
      },
      (names) => ({ kind: 'commit', names })
    )

  /** Signs the fields whose proposed annotation has arrived, and forgets ones a host dropped. */
  const land = () => {
    const linked = annotations
    if (!linked) return
    for (const [id, name] of [...awaiting]) {
      if (linked.get(id)) {
        awaiting.delete(id)
        if (byName.get(name)?.type === 'signature' && signatureOf(name) === undefined)
          sign(name, id)
      } else if (!linked._getProposed(id)) awaiting.delete(id)
    }
  }

  const form: FormController = {
    fields: readonly(fields),
    values,
    formatted: readonly(formatted),
    widgetState: readonly(widgetState),
    get hasScripts() {
      return (
        scripting !== undefined ||
        fields.get().some((f) => f.widgets.some((w) => w.hasScripts))
      )
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
            const stored = normaliseValue(field, value)
            const kept = scripting ? scripting.commit(name, stored) : stored
            // A value the scripts reject leaves the typed text, so the user can correct it.
            if (kept === undefined) {
              result.rejected.push({ name, reason: 'script' })
              continue
            }
            dropPending(name)
            write(name, suits(field, kept) ? normaliseValue(field, kept) : stored)
            result.applied.push(name)
          }
        },
        (changedNames) => ({
          kind: 'commit',
          names: [...new Set([...result.applied, ...changedNames])],
        })
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
      within(() => scripting?.sync(expected, true))
      const after = current()
      if (after === expected) return
      const names = changed(expected, after)
      if (names.length > 0) controlled.onChange(after, { kind: 'calculate', names })
    },
    on(
      event: 'action' | 'alert' | 'error' | 'focus' | 'goto',
      fn: (payload: never) => void
    ) {
      const stop = emitter.on(
        event,
        fn as (payload: FormAction | string | InkError | number) => void
      )
      if (event === 'error' && unheard) {
        const early = unheard
        unheard = undefined
        for (const e of early) (fn as (e: InkError) => void)(e)
      }
      return stop
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
      if (destroyed) return
      // Text typed and then left uncommitted is dropped, and the sandbox, which saw each
      // keystroke, goes back to the stored value.
      const abandoned = event.name === 'Blur' && pending.delete(event.widget)
      const widget = widgets.get(event.widget)
      // Without scripts, a JavaScript button still opens the URL its script would.
      const action = widget?.action ?? (scripting ? undefined : widget?.fallback)
      // The `/A`'s `/Next` actions follow it, scripts or not.
      const next = event.name === 'Action' ? (widget?.next ?? []) : []
      // An Action's scripts and the reset it runs are one step.
      batch(() => {
        if (scripting)
          reporting(
            () => {
              scripting?.dispatch(event)
              if (abandoned) scripting?.sync(current(), false)
            },
            (names) => ({ kind: 'calculate', names })
          )
        if (event.name === 'Action' && action && !destroyed) runAction(action)
        for (const n of next) if (!destroyed) runAction(n)
      })
    },
    _step(fn) {
      if (destroyed) return
      batch(fn)
    },
    _keystroke(widget, change, selStart, selEnd) {
      const field = byWidget.get(widget)
      const stored = field ? store.get(field.name)?.value : undefined
      const before = pending.get(widget) ?? (typeof stored === 'string' ? stored : '')
      const caret = selStart + change.length
      const result = (!destroyed &&
        scripting?.keystroke(widget, before, change, selStart, selEnd)) || {
        accepted: true,
        value: before.slice(0, selStart) + change + before.slice(selEnd),
        selStart: caret,
        selEnd: caret,
      }
      if (!destroyed && result.accepted) pending.set(widget, result.value)
      return result
    },
    _pageEvent(page, name) {
      if (destroyed || !scripting) return Promise.resolve()
      return scripting.pageEvent(page, name)
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
      if (!unheard) emitter.emit('error', e)
      else if (unheard.push(e) > UNHEARD_LIMIT) unheard.shift()
    },
    _alert(message) {
      if (!destroyed) emitter.emit('alert', message)
    },
    _focus(widgetId) {
      if (!destroyed && widgets.has(widgetId)) emitter.emit('focus', widgetId)
    },
    _scriptValues(next) {
      if (destroyed) return
      const entries = Object.entries(next).flatMap(
        ([name, value]): [string, FieldValue][] => {
          const field = byName.get(name)
          return field && !field.locked && suits(field, value)
            ? [[name, normaliseValue(field, value)]]
            : []
        }
      )
      if (entries.length === 0) return
      const apply = () => {
        for (const [name, value] of entries) write(name, value)
      }
      if (depth > 0) apply()
      else reporting(apply, (names) => ({ kind: 'calculate', names }), quiet)
    },
    get _tabs() {
      return tabs
    },
    _load: load,
    _import(next) {
      if (destroyed) return
      const before = current()
      const entries = Object.entries(next).filter(
        ([name, value]) => !sameValue(before[name], value)
      )
      // Nothing to change: no reset reaches the store, so the undo steps stay.
      if (entries.length === 0) return
      writeAll(entries)
      if (changed(before, current()).length === 0) return
      // What the import calculates is no undo step either.
      quiet(() => within(() => scripting?.sync(current(), true)))
      const names = changed(before, current())
      if (controlled && names.length > 0)
        controlled.onChange(current(), { kind: 'import', names })
    },
    _linkAnnotations(link) {
      if (destroyed || annotations) return
      const linked = link.store
      annotations = linked
      replays = link.replays
      let signed = signedFields()
      unlink.push(
        store.on('change', (change) => {
          const before = signed
          signed = signedFields()
          // Undo and redo replay the annotations too: a signature that went with the step has
          // already gone.
          const replay = change.kind === 'replace' && change.reason === 'history'
          if (!replay) {
            const kept = new Set(signed.values())
            for (const [name, id] of before)
              if (signed.get(name) !== id && !kept.has(id)) linked.remove(id)
          }
          dropDangling()
        }),
        linked.on('change', (change) => {
          const replay = change.kind === 'replace' && change.reason === 'history'
          if (replay && link.replays) {
            pin()
            return
          }
          if (replay) restore()
          land()
          dropDangling()
        }),
        link.react((edit) => {
          if (edit.kind === 'remove') dropDangling()
        })
      )
      dropDangling()
    },
    _signWith(name, id) {
      if (destroyed) return
      if (!annotations || annotations.get(id)) sign(name, id)
      else awaiting.set(id, name)
    },
    _awaitingSignature(name) {
      // A proposal the host let lapse without pushing a list no longer counts. The query
      // forgets nothing: `land` does that when the list next changes, so a late push still
      // signs the field.
      for (const [id, field] of awaiting)
        if (field === name && annotations?._getProposed(id)) return true
      return false
    },
    _destroy() {
      if (destroyed) return
      destroyed = true
      for (const stop of unlink.splice(0)) stop()
      awaiting.clear()
      dropped.clear()
      unheard = undefined
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
