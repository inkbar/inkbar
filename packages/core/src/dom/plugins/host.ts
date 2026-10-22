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

import { createCommandRegistry } from './commands'

import type {
  Command,
  InkPlugin,
  LayerSpec,
  PluginContext,
  PluginLayerHandle,
  PluginStoreOptions,
} from './define'
import type { PluginHistory } from '../../model/annotations/history'
import type { AnnotationEdit } from '../../model/annotations/store'
import type { InkDocument } from '../../model/document'
import type { AnnotationDecoration, DecorateAnnotation } from '../overlay'
import type { Tool } from '../tools/controller'

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
}

export interface PluginHost {
  readonly commands: ReadonlyMap<string, Command>
  command(id: string): Command | undefined
  readonly tools: readonly Tool[]
  /** The host's decoration first, then each plugin's in order; earlier ones win per key. */
  decorate: DecorateAnnotation
  readonly layers: readonly (LayerSpec & { plugin: string })[]
  destroy(): void
}

interface StoreRequest {
  key: string
  opts: PluginStoreOptions<RecordBase>
  current: Writable<RecordStore<RecordBase> | null>
}

/** What one open document holds; undone in reverse when it closes. */
interface Opened {
  doc: InkDocument
  stores: RecordStore<RecordBase>[]
  /** Untrack and unregister functions from the document's history. */
  detach: (() => void)[]
  cleanups: (() => void)[]
}

/** A copy of `value` with `extra` laid over it, keeping its prototype (a class's methods). */
function withProps<T extends object, U extends object>(value: T, extra: U): T & U {
  return Object.assign(
    Object.create(Object.getPrototypeOf(value) as object | null) as T,
    value,
    extra
  )
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
  const layers: (LayerSpec & { plugin: string })[] = []
  const requests: StoreRequest[] = []
  const documentFns: ((doc: InkDocument) => void | (() => void))[] = []
  const editFns: ((edit: AnnotationEdit) => void)[] = []
  const setupCleanups: (() => void)[] = []
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

  const contextFor = (plugin: InkPlugin): PluginContext => {
    const storeNames = new Set<string>()
    return {
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
        layers.push(withProps(spec, { plugin: plugin.id }))
        return { invalidate() {} }
      },
    }
  }

  for (const plugin of opts.plugins) {
    const cleanup = plugin.setup(contextFor(plugin))
    if (typeof cleanup === 'function') setupCleanups.push(cleanup)
  }

  const current = opts.document.get()
  if (current) open(current)
  const stopDocument = opts.document.subscribe((doc) => {
    close()
    if (doc) open(doc)
  })

  return {
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
    layers,
    destroy() {
      if (destroyed) return
      destroyed = true
      stopDocument()
      close()
      for (const cleanup of setupCleanups.reverse()) guard(cleanup)
    },
  }
}
