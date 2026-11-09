/*
 * The host runs each plugin's `setup` once and collects what it registers. Bindings and
 * `createViewer` build one per viewer and place its commands, tools, decoration and layers.
 *
 * Record stores and annotation reactions belong to a document. When a document opens the host
 * creates every requested store from its `initial`, has the history current then track it, and
 * registers every `onAnnotationEdit` with that history; then it runs the `onDocument`
 * callbacks. When the document closes it undoes that in order: untrack and unregister, destroy
 * the stores, then run the `onDocument` cleanups.
 */
import { InkError } from '../../model/errors'
import { readonly, writable, type Readable, type Writable } from '../../model/readable'
import { createRecordStore, type RecordBase, type RecordStore } from '../../model/records'

import { createRecords, type Records } from './api/records'
import { createCommandRegistry } from './commands'
import { createLayerRegistry, type LayerSource, type PluginLayer } from './layer'
import {
  createMarksRegistry,
  createRecordSelection,
  type HostRecordSelection,
  type MarksRegistry,
  type RecordSelection,
} from './registry'

import type {
  Command,
  InkPlugin,
  PluginContext,
  PluginLayerHandle,
  PluginStoreOptions,
} from './define'
import type { PluginHistory } from '../../model/annotations/history'
import type { AnnotationEdit } from '../../model/annotations/store'
import type { InkDocument } from '../../model/document'
import type { AnnotationDecoration, DecorateAnnotation } from '../overlay'
import type { SearchState, ViewerSearch } from '../search/controller'
import type { Tool } from '../tools/controller'
import type { PagePress, PressKind } from '../tools/press'
import type { Viewport } from '../viewport'

export interface PluginHostOptions {
  plugins: readonly InkPlugin[]
  document: Readable<InkDocument | null>
  /** The binding's active history, read when a document opens. */
  history: () => PluginHistory
  activated: Readable<string | null>
  setActivated(id: string | null): void
  root: Readable<HTMLElement | null>
  /** The host's own decoration, read on each call. */
  decorate?: () => DecorateAnnotation | undefined
  /** The viewer's viewport, read on each call; without one, `ctx.scrollTo` does nothing. */
  viewport?: () => Viewport | null | undefined
  /** The viewer's search; without one, `ctx.search` is inert. */
  search?: ViewerSearch
}

const inertState = readonly(
  writable<SearchState>({
    open: false,
    query: '',
    matchCase: false,
    hits: [],
    current: -1,
    scanning: false,
  })
)

/** What `ctx.search` is when the host has no search: closed, and every action does nothing. */
const inertSearch: ViewerSearch = {
  state: inertState,
  open() {},
  setQuery() {},
  setMatchCase() {},
  next() {},
  previous() {},
  select() {},
  close() {},
}

/**
 * A plugin's records as the host app sees them: the plugin's own handle without `annotates`
 * (a plugin links its records to marks in `setup`), plus `batch` to make several writes one
 * undo step. `in(doc)` gives a host handle too.
 */
export type HostRecords<T extends RecordBase> = Omit<Records<T>, 'annotates' | 'in'> & {
  /** The same handle bound to `doc`'s store, as `Records.in` binds it. */
  in(doc: InkDocument): HostRecords<T>
  /** Makes everything `fn` changes one undo step. */
  batch(fn: () => void): void
}

export interface PluginHost extends LayerSource {
  /**
   * The records a plugin keeps under `key` (`<plugin>.<name>`), following the open document.
   * The same handle on each call. An unknown key gives an empty handle that ignores writes, and
   * logs a warning once.
   */
  records<T extends RecordBase>(key: string): HostRecords<T>
  /** What each `plugin.marks` call drew, by records key. */
  readonly marks: MarksRegistry
  /**
   * The selected record under `key`, shared by the marks, every list and the host app. The
   * same object on each call.
   */
  selection(key: string): RecordSelection
  readonly commands: ReadonlyMap<string, Command>
  command(id: string): Command | undefined
  readonly tools: readonly Tool[]
  /** The host's decoration first, then each plugin's in order; earlier ones win per key. */
  decorate: DecorateAnnotation
  /** Every layer added so far; `watchLayers` reports the ones added later and invalidates. */
  readonly layers: readonly PluginLayer[]
  /** Calls `listener` on every `ctx.redecorate()`; returns a stop function. */
  watchRedecorate(listener: () => void): () => void
  /**
   * Tells every `onPress` (or, for a long press, `onLongPress`) listener, plugin by plugin in
   * registration order. A listener that throws is logged and the rest still run.
   *
   * @internal For the viewer engine, which passes the tool controller's presses on.
   */
  emitPress(kind: PressKind, press: PagePress): void
  destroy(): void
}

interface StoreRequest {
  key: string
  opts: PluginStoreOptions<RecordBase>
  current: Writable<RecordStore<RecordBase> | null>
}

/** One `onPress` or `onLongPress` registration. */
interface PressListener {
  plugin: string
  kind: PressKind
  fn: (press: PagePress) => void
}

/** What one open document holds; undone in reverse when it closes. */
interface Opened {
  doc: InkDocument
  stores: RecordStore<RecordBase>[]
  /** Untrack and unregister functions from the document's history. */
  detach: (() => void)[]
  cleanups: (() => void)[]
}

/** What the host shares with the plugin API's helpers, but not with plugins. */
interface HostInternals {
  marks: MarksRegistry
  selection(key: string): RecordSelection
}

const internals = new WeakMap<PluginContext, HostInternals>()

/**
 * The marks registry and selections of the host that built `ctx`. A context no host built gets
 * a registry and selections of its own, over no records.
 *
 * @internal For the plugin API (`plugin.marks`); not for plugin authors.
 */
export function hostInternalsOf(ctx: PluginContext): HostInternals {
  let found = internals.get(ctx)
  if (!found) {
    const marks = createMarksRegistry()
    const none = { get: () => null, subscribe: () => () => {} }
    const selections = new Map<string, RecordSelection>()
    found = {
      marks,
      selection(key) {
        let selection = selections.get(key)
        if (!selection) {
          selection = createRecordSelection(none, () => false)
          selections.set(key, selection)
        }
        return selection
      },
    }
    internals.set(ctx, found)
  }
  return found
}

/**
 * `value` seen with `extra` laid over it, read-only. Everything else is read from and written to
 * `value` itself, and its methods are bound to it, so a method always runs on the original
 * (a class instance keeps its `#private` fields, and `this.id` is the plugin's own id).
 */
function withProps<T extends object, U extends object>(value: T, extra: U): T & U {
  const bound = new Map<PropertyKey, { fn: unknown; bound: unknown }>()
  const own = (key: PropertyKey) => Object.hasOwn(extra, key)
  // An empty target, so a frozen `value` breaks no proxy invariant on the keys `extra` replaces;
  // only properties defined non-configurable through the proxy are mirrored onto it.
  return new Proxy(Object.create(null) as T & U, {
    get(_, key) {
      if (own(key)) return extra[key as keyof U]
      const v: unknown = Reflect.get(value, key, value)
      if (typeof v !== 'function') return v
      // The same bound function on each read, while the method stays the same.
      let entry = bound.get(key)
      if (entry?.fn !== v) {
        entry = { fn: v, bound: (v as (...a: unknown[]) => unknown).bind(value) }
        bound.set(key, entry)
      }
      return entry.bound
    },
    set: (_, key, v) => !own(key) && Reflect.set(value, key, v, value),
    defineProperty(target, key, d) {
      if (own(key) || !Reflect.defineProperty(value, key, d)) return false
      // A proxy may only report a non-configurable property its target has: mirror it there.
      const defined = Reflect.getOwnPropertyDescriptor(value, key)
      if (defined && !defined.configurable) Reflect.defineProperty(target, key, defined)
      return true
    },
    deleteProperty: (_, key) => !own(key) && Reflect.deleteProperty(value, key),
    has: (_, key) => own(key) || Reflect.has(value, key),
    ownKeys: () => [...new Set([...Reflect.ownKeys(value), ...Reflect.ownKeys(extra)])],
    getOwnPropertyDescriptor(target, key) {
      const d = Reflect.getOwnPropertyDescriptor(own(key) ? extra : value, key)
      // Configurable unless mirrored on the target as non-configurable (see `defineProperty`).
      const fixed = Reflect.getOwnPropertyDescriptor(target, key)?.configurable === false
      return d && { ...d, configurable: !fixed }
    },
    getPrototypeOf: () => Reflect.getPrototypeOf(value),
  })
}

/** Runs a plugin callback; a throw is logged so one plugin cannot break the others. */
function guard<T>(fn: () => T): T | undefined {
  try {
    return fn()
  } catch (error) {
    console.error(error)
    return undefined
  }
}

/**
 * @internal For bindings and `createViewer`, which place a viewer's plugins; plugin authors use
 * `definePlugin` and never call it.
 */
export function createPluginHost(opts: PluginHostOptions): PluginHost {
  const seen = new Set<string>()
  for (const plugin of opts.plugins) {
    if (seen.has(plugin.id))
      throw new InkError(
        'DuplicatePlugin',
        `A plugin with id ${plugin.id} is registered twice`,
        {
          id: plugin.id,
        }
      )
    seen.add(plugin.id)
  }

  const registry = createCommandRegistry({ document: opts.document })
  const tools: Tool[] = []
  const decorators: DecorateAnnotation[] = []
  const layers = createLayerRegistry()
  const requests: StoreRequest[] = []
  const requestsByKey = new Map<string, StoreRequest>()
  /** Bumped when a store is requested, so a handle made earlier finds a late one. */
  const requested = writable(0)
  const hostRecords = new Map<string, HostRecords<RecordBase>>()
  const warned = new Set<string>()
  const documentFns: ((doc: InkDocument) => void | (() => void))[] = []
  const editFns: ((edit: AnnotationEdit) => void)[] = []
  const setupCleanups: (() => void)[] = []
  const redecorators = new Set<() => void>()
  const pressListeners = new Set<PressListener>()
  const marks = createMarksRegistry()
  const selections = new Map<string, HostRecordSelection>()
  let opened: Opened | null = null
  let destroyed = false

  /** Creates a requested store for the open document and has its history track it. */
  const openStore = (request: StoreRequest, state: Opened, history: PluginHistory) => {
    const store = createRecordStore(request.key, {
      initial: request.opts.initial?.(state.doc) ?? [],
      ...(request.opts.onChange && { onChange: request.opts.onChange }),
    })
    state.stores.push(store)
    state.detach.push(history.track(store))
    request.current.set(store)
  }

  const runOnDocument = (
    fn: (doc: InkDocument) => void | (() => void),
    state: Opened
  ) => {
    const cleanup = guard(() => fn(state.doc))
    if (typeof cleanup === 'function') state.cleanups.push(cleanup)
  }

  const open = (doc: InkDocument) => {
    const history = opts.history()
    const state: Opened = { doc, stores: [], detach: [], cleanups: [] }
    opened = state
    for (const request of requests) openStore(request, state, history)
    for (const fn of editFns) state.detach.push(history.react(fn))
    for (const fn of documentFns) runOnDocument(fn, state)
  }

  const close = () => {
    const state = opened
    if (!state) return
    opened = null
    for (const detach of state.detach) detach()
    for (const store of state.stores) store.destroy()
    for (const request of requests) request.current.set(null)
    for (const cleanup of state.cleanups.reverse()) guard(cleanup)
  }

  const contextFor = (plugin: InkPlugin, owned: Set<PressListener>): PluginContext => {
    const storeNames = new Set<string>()
    const listenForPress =
      (kind: PressKind) =>
      (fn: (press: PagePress) => void): (() => void) => {
        const entry: PressListener = { plugin: plugin.id, kind, fn }
        pressListeners.add(entry)
        owned.add(entry)
        return () => {
          pressListeners.delete(entry)
          owned.delete(entry)
        }
      }
    const ctx: PluginContext = {
      id: plugin.id,
      document: opts.document,
      history: { batch: (fn) => opts.history().batch(fn) },
      activated: opts.activated,
      setActivated: (id) => opts.setActivated(id),
      root: opts.root,
      commands: { add: (spec) => registry.add(plugin.id, spec) },
      tools: {
        add(tool) {
          const id = `${plugin.id}.${tool.id}`
          if (tools.some((t) => t.id === id))
            throw new InkError('DuplicateId', `A tool with id ${id} already exists`, {
              id,
            })
          tools.push(withProps(tool, { id }))
        },
      },
      decorate(fn) {
        decorators.push(fn)
      },
      redecorate() {
        for (const listener of [...redecorators]) listener()
      },
      store<T extends RecordBase>(name: string, storeOpts: PluginStoreOptions<T> = {}) {
        const key = `${plugin.id}.${name}`
        if (storeNames.has(name))
          throw new InkError('DuplicateId', `A store with key ${key} already exists`, {
            key,
          })
        storeNames.add(name)
        const request: StoreRequest = {
          key,
          opts: storeOpts as unknown as PluginStoreOptions<RecordBase>,
          current: writable<RecordStore<RecordBase> | null>(null),
        }
        requests.push(request)
        requestsByKey.set(key, request)
        requested.set(requested.get() + 1)
        // Asked for while a document is open (from `onDocument`, say): create it now.
        if (opened) openStore(request, opened, opts.history())
        return readonly(request.current) as Readable<RecordStore<T> | null>
      },
      onDocument(fn) {
        documentFns.push(fn)
        if (opened) runOnDocument(fn, opened)
      },
      onAnnotationEdit(fn) {
        editFns.push(fn)
        if (opened) opened.detach.push(opts.history().react(fn))
      },
      layer(spec): PluginLayerHandle {
        return layers.add(withProps(spec, { plugin: plugin.id }))
      },
      scrollTo(page, rect, scrollOpts) {
        opts.viewport?.()?.scrollToRect(page, rect, scrollOpts)
      },
      search: opts.search ?? inertSearch,
      onPress: listenForPress('press'),
      onLongPress: listenForPress('long-press'),
    }
    internals.set(ctx, { marks, selection: (key) => selectionFor(key) })
    return ctx
  }

  /** The store requested under `key` now, null for none; emits when either changes. */
  const sourceFor = (key: string): Readable<RecordStore<RecordBase> | null> => ({
    get: () => requestsByKey.get(key)?.current.get() ?? null,
    subscribe(fn) {
      let stopCurrent: (() => void) | undefined
      let last = requestsByKey.get(key)?.current.get() ?? null
      const follow = () => {
        stopCurrent?.()
        stopCurrent = requestsByKey.get(key)?.current.subscribe((store) => {
          if (store === last) return
          last = store
          fn(store)
        })
      }
      follow()
      const stopRequested = requested.subscribe(() => {
        follow()
        const store = requestsByKey.get(key)?.current.get() ?? null
        if (store === last) return
        last = store
        fn(store)
      })
      return () => {
        stopRequested()
        stopCurrent?.()
      }
    },
  })

  /**
   * Made on first use and kept for the host's life. A key with no registrations resolves
   * every record; with some, a record must pass one's `where`.
   */
  const selectionFor = (key: string): RecordSelection => {
    let selection = selections.get(key)
    if (!selection) {
      selection = createRecordSelection(
        sourceFor(key),
        (record) =>
          marks.of(key).length === 0 ||
          marks.resolve(key, record as RecordBase & { page: number }) !== undefined,
        (listener) => marks.watch(listener)
      )
      selections.set(key, selection)
    }
    return selection
  }

  const recordsFor = (key: string): HostRecords<RecordBase> => {
    const cached = hostRecords.get(key)
    if (cached) return cached
    if (!requestsByKey.has(key) && !warned.has(key)) {
      warned.add(key)
      console.warn(`No plugin records named ${key}`)
    }
    const dot = key.indexOf('.')
    const batch = (fn: () => void) => opts.history().batch(fn)
    const full = createRecords<RecordBase>(
      {
        batch,
        storesDocument: () => opened?.doc ?? null,
        plugin: dot < 0 ? key : key.slice(0, dot),
        name: dot < 0 ? '' : key.slice(dot + 1),
        onAnnotationEdit() {},
      },
      sourceFor(key)
    )
    const toHost = (records: Records<RecordBase>): HostRecords<RecordBase> => {
      const handle: Partial<Records<RecordBase>> = { ...records }
      delete handle.annotates
      return {
        ...handle,
        in: (doc: InkDocument) => toHost(records.in(doc)),
        batch,
      } as HostRecords<RecordBase>
    }
    const made = toHost(full)
    hostRecords.set(key, made)
    return made
  }

  for (const plugin of opts.plugins) {
    let cleanup: void | (() => void)
    const owned = new Set<PressListener>()
    // Dropping a plugin's press listeners belongs to its teardown, whether or not it returns one.
    const dropPresses = () => {
      for (const entry of owned) pressListeners.delete(entry)
      owned.clear()
    }
    try {
      cleanup = plugin.setup(contextFor(plugin, owned))
    } catch (error) {
      // No host comes back to destroy, so undo the plugins already set up here.
      dropPresses()
      for (const done of setupCleanups.reverse()) guard(done)
      throw error
    }
    setupCleanups.push(() => {
      dropPresses()
      if (typeof cleanup === 'function') cleanup()
    })
  }

  const current = opts.document.get()
  if (current) open(current)
  const stopDocument = opts.document.subscribe((doc) => {
    close()
    if (doc) open(doc)
  })

  return {
    records: ((key: string) => recordsFor(key)) as PluginHost['records'],
    marks,
    selection: selectionFor,
    commands: registry.commands,
    command: (id) => registry.commands.get(id),
    tools,
    decorate(annotation) {
      const all = [opts.decorate?.(), ...decorators]
      let merged: AnnotationDecoration | undefined
      for (const fn of all) {
        const d = fn && guard(() => fn(annotation))
        if (!d) continue
        merged ??= {}
        if (d.data) merged = { ...merged, data: { ...d.data, ...merged.data } }
        if (d.classes)
          merged = { ...merged, classes: [...(merged.classes ?? []), ...d.classes] }
        if (merged.description === undefined && d.description !== undefined)
          merged = { ...merged, description: d.description }
      }
      return merged
    },
    layers: layers.layers,
    watchLayers: (listener) => layers.watchLayers(listener),
    watchRedecorate(listener) {
      // Wrapped, so the same listener added twice runs twice and each stop removes its own.
      const run = () => listener()
      redecorators.add(run)
      return () => {
        redecorators.delete(run)
      }
    },
    emitPress(kind, press) {
      for (const entry of [...pressListeners]) {
        if (entry.kind !== kind || !pressListeners.has(entry)) continue
        try {
          entry.fn(press)
        } catch (error) {
          console.error(`Plugin ${entry.plugin} threw in a ${kind} listener`, error)
        }
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      stopDocument()
      close()
      for (const cleanup of setupCleanups.reverse()) guard(cleanup)
      for (const selection of selections.values()) selection.destroy()
    },
  }
}
