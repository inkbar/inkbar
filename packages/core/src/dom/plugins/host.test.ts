import { describe, expect, it, vi } from 'vitest'

import { writable } from '../../model/readable'

import { definePlugin, type InkPlugin, type PluginContext } from './define'
import { createPluginHost, type PluginHostOptions } from './host'

import type { Records } from './api/records'
import type { PluginHistory } from '../../model/annotations/history'
import type { AnnotationEdit } from '../../model/annotations/store'
import type { Annotation } from '../../model/annotations/types'
import type { DocumentStatus, InkDocument } from '../../model/document'
import type { RecordBase, RecordStore } from '../../model/records'
import type { Tool } from '../tools/controller'

interface Suggestion extends RecordBase {
  status: string
}

function fakeDocument(key: string): InkDocument {
  return {
    key,
    status: writable<DocumentStatus>({ state: 'ready' }),
  } as unknown as InkDocument
}

/** Records what the host asks of history, so tests can check tracking per document. */
function fakeHistory() {
  const tracked = new Set<RecordStore<RecordBase>>()
  const reactions = new Set<(edit: AnnotationEdit) => void>()
  const history: PluginHistory = {
    batch: (fn) => fn(),
    track(store) {
      tracked.add(store)
      return () => tracked.delete(store)
    },
    react(fn) {
      reactions.add(fn)
      return () => reactions.delete(fn)
    },
  }
  return { history, tracked, reactions }
}

function hostWith(plugins: InkPlugin[], extra: Partial<PluginHostOptions> = {}) {
  const document = writable<InkDocument | null>(null)
  const h = fakeHistory()
  const host = createPluginHost({
    plugins,
    document,
    history: () => h.history,
    activated: writable<string | null>(null),
    setActivated() {},
    root: writable<HTMLElement | null>(null),
    ...extra,
  })
  return { host, document, ...h }
}

const annotation = { id: 'a1', type: 'redact' } as unknown as Annotation

describe('definePlugin', () => {
  it('rejects ids that are not lower-case kebab', () => {
    expect(definePlugin({ id: 'sandbox-suggestions', setup() {} }).id).toBe(
      'sandbox-suggestions'
    )
    for (const id of ['Sandbox', 'a.b'])
      expect(() => definePlugin({ id, setup() {} })).toThrow(
        expect.objectContaining({
          name: 'InkError',
          code: 'InvalidPluginId',
          details: { id },
        })
      )
  })

  it('checks the id of the factory form when defined', () => {
    expect(() => definePlugin('Sandbox', () => {})).toThrow(
      expect.objectContaining({ code: 'InvalidPluginId', details: { id: 'Sandbox' } })
    )
  })

  it('definePlugin(id, setup) returns a factory whose plugins are independent', () => {
    const handles: Records<Suggestion>[] = []
    const cleanup = vi.fn()
    const factory = definePlugin('sandbox', (plugin, options: { tag?: string }) => {
      expect(plugin.id).toBe('sandbox')
      handles.push(plugin.records<Suggestion>(options.tag ?? 'suggestions'))
      return cleanup
    })
    const one = factory()
    const two = factory({ tag: 'suggestions' })
    // A host passes `records` alongside the plugin's own options, both typed.
    factory({ tag: 'notes', records: { notes: { initial: () => [] } } })
    // @ts-expect-error `tag` keeps the plugin's own type
    factory({ tag: 1 })
    // @ts-expect-error `records` keeps its type
    factory({ records: { notes: 1 } })
    expect(one.id).toBe('sandbox')
    expect(one).not.toBe(two)
    const first = hostWith([one])
    const second = hostWith([two])
    first.document.set(fakeDocument('a'))
    second.document.set(fakeDocument('a'))
    handles[0]!.add({ id: 's1', status: 'open' })
    expect(handles[0]!.all()).toEqual([{ id: 's1', status: 'open' }])
    expect(handles[1]!.all()).toEqual([])
    first.host.destroy()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('requires the factory options when the plugin has required options', () => {
    const keyed = definePlugin('keyed', (_plugin, _options: { apiKey: string }) => {})
    // @ts-expect-error `apiKey` is required, so the options are too
    keyed()
    expect(keyed({ apiKey: 'k' }).id).toBe('keyed')
    const optional = definePlugin('optional', (_plugin, _options: { tag?: string }) => {})
    expect(optional().id).toBe('optional')
    expect(definePlugin('plain', () => {})().id).toBe('plain')
  })
})

describe('createPluginHost', () => {
  it('registers commands under the plugin id', () => {
    const { host } = hostWith([
      definePlugin({
        id: 'sandbox',
        setup(ctx) {
          ctx.commands.add({ id: 'suggest', label: 'Suggest', run() {} })
        },
      }),
    ])
    expect([...host.commands.keys()]).toEqual(['sandbox.suggest'])
    expect(host.command('sandbox.suggest')?.label).toBe('Suggest')
    expect(host.command('suggest')).toBeUndefined()
  })

  it('plugin tools are namespaced', () => {
    const tool: Tool = {
      id: 'mark',
      label: 'Mark',
      cursor: 'crosshair',
      activate() {},
      deactivate() {},
    }
    const { host } = hostWith([
      definePlugin({
        id: 'sandbox',
        setup(ctx) {
          ctx.tools.add(tool)
        },
      }),
    ])
    expect(host.tools.map((t) => t.id)).toEqual(['sandbox.mark'])
    expect(host.tools[0]?.label).toBe('Mark')
    expect(tool.id).toBe('mark')
  })

  it("a tool's methods see the tool itself: its writes land on it and its own id", () => {
    const seen: string[] = []
    const tool: Tool & { count?: number } = {
      id: 'mark',
      cursor: 'crosshair',
      activate() {
        this.count = (this.count ?? 0) + 1
        seen.push(this.id)
      },
      deactivate() {},
    }
    const { host } = hostWith([
      definePlugin({ id: 'sandbox', setup: (ctx) => ctx.tools.add(tool) }),
    ])
    const wrapped = host.tools[0] as Tool & { count?: number }
    const ctx = {} as Parameters<Tool['activate']>[0]
    wrapped.activate(ctx)
    wrapped.activate(ctx)
    expect(tool.count).toBe(2)
    expect(wrapped.count).toBe(2)
    expect(seen).toEqual(['mark', 'mark'])
    expect(wrapped.id).toBe('sandbox.mark')
  })

  it('a property defined on the wrapped tool lands on the tool and reads back', () => {
    const tool: Tool & { x?: number; y?: number } = {
      id: 'mark',
      cursor: 'crosshair',
      activate() {},
      deactivate() {},
    }
    const { host } = hostWith([
      definePlugin({ id: 'sandbox', setup: (ctx) => ctx.tools.add(tool) }),
    ])
    const wrapped = host.tools[0] as Tool & { x?: number; y?: number }
    // Non-configurable and non-writable, said outright and by default.
    expect(() =>
      Object.defineProperty(wrapped, 'x', { value: 1, configurable: false })
    ).not.toThrow()
    expect(() => Object.defineProperty(wrapped, 'z', { value: 3 })).not.toThrow()
    expect(Object.getOwnPropertyDescriptor(wrapped, 'z')).toMatchObject({ value: 3 })
    expect(tool.x).toBe(1)
    expect(wrapped.x).toBe(1)
    expect(Object.getOwnPropertyDescriptor(wrapped, 'x')).toMatchObject({
      value: 1,
      configurable: false,
    })
    expect(Reflect.ownKeys(wrapped)).toContain('x')
    // A writable one keeps following the tool.
    Object.defineProperty(wrapped, 'y', { value: 1, writable: true })
    tool.y = 2
    expect(wrapped.y).toBe(2)
    expect(Object.getOwnPropertyDescriptor(wrapped, 'y')?.value).toBe(2)
  })

  it('a class setter written through the wrapped tool reaches the instance', () => {
    class ModeTool {
      readonly id = 'mode'
      readonly cursor = 'default'
      #mode = 'a'
      get mode() {
        return this.#mode
      }
      set mode(v: string) {
        this.#mode = v
      }
      activate() {}
      deactivate() {}
    }
    const tool = new ModeTool()
    const { host } = hostWith([
      definePlugin({ id: 'sandbox', setup: (ctx) => ctx.tools.add(tool) }),
    ])
    const wrapped = host.tools[0] as unknown as ModeTool
    wrapped.mode = 'b'
    expect(tool.mode).toBe('b')
    expect(wrapped.mode).toBe('b')
    // The namespaced id stays.
    expect(() => {
      ;(wrapped as { id: string }).id = 'other'
    }).toThrow(TypeError)
    expect(wrapped.id).toBe('sandbox.mode')
  })

  it('decorations merge with the host winning per key', () => {
    const { host } = hostWith(
      [
        definePlugin({
          id: 'one',
          setup(ctx) {
            ctx.decorate(() => ({
              data: { state: 'plugin', one: 'yes' },
              classes: ['one'],
              description: 'From one',
            }))
          },
        }),
        definePlugin({
          id: 'two',
          setup(ctx) {
            ctx.decorate(() => ({ data: { one: 'no', two: 'yes' }, classes: ['two'] }))
            ctx.decorate(() => undefined)
          },
        }),
      ],
      { decorate: () => () => ({ data: { state: 'host' }, classes: ['host'] }) }
    )
    expect(host.decorate(annotation)).toEqual({
      data: { state: 'host', one: 'yes', two: 'yes' },
      classes: ['host', 'one', 'two'],
      description: 'From one',
    })
  })

  it('decorates nothing when no one decorates', () => {
    const { host } = hostWith([])
    expect(host.decorate(annotation)).toBeUndefined()
  })

  it('a store is created per document from initial and tracked by history', () => {
    const initial = vi.fn((doc: InkDocument) => [
      { id: `${doc.key}-s`, status: 'suggested' },
    ])
    const onChange = vi.fn()
    let store!: { get(): RecordStore<Suggestion> | null }
    const { host, document, tracked } = hostWith([
      definePlugin({
        id: 'sandbox',
        setup(ctx) {
          store = ctx.store<Suggestion>('suggestions', { initial, onChange })
        },
      }),
    ])
    expect(store.get()).toBeNull()

    document.set(fakeDocument('a'))
    const s = store.get()
    expect(s?.key).toBe('sandbox.suggestions')
    expect(s?.list.get()).toEqual([{ id: 'a-s', status: 'suggested' }])
    expect(initial).toHaveBeenCalledTimes(1)
    expect([...tracked]).toEqual([s])

    s?.update('a-s', { status: 'accepted' })
    expect(onChange).toHaveBeenCalledTimes(1)
    host.destroy()
  })

  it('stores are destroyed and untracked when the document changes', () => {
    const order: string[] = []
    let store!: { get(): RecordStore<Suggestion> | null }
    const { document, tracked } = hostWith([
      definePlugin({
        id: 'sandbox',
        setup(ctx) {
          store = ctx.store<Suggestion>('suggestions')
          ctx.onDocument((doc) => {
            order.push(`open ${doc.key}`)
            return () => order.push(`close ${doc.key}: ${tracked.size}`)
          })
        },
      }),
    ])
    document.set(fakeDocument('a'))
    const first = store.get()
    const listener = vi.fn()
    first?.on('change', listener)

    document.set(fakeDocument('b'))
    const second = store.get()
    expect(second).not.toBe(first)
    expect([...tracked]).toEqual([second])
    // Destroyed: the old store emits to no one.
    first?.add({ id: 'x', status: 'suggested' })
    expect(listener).not.toHaveBeenCalled()
    expect(order).toEqual(['open a', 'close a: 0', 'open b'])

    document.set(null)
    expect(store.get()).toBeNull()
    expect(tracked.size).toBe(0)
  })

  it('onAnnotationEdit registers with history.react per document', () => {
    const fn = vi.fn()
    const histories = [fakeHistory(), fakeHistory()]
    let current = 0
    const { document } = hostWith(
      [
        definePlugin({
          id: 'sandbox',
          setup(ctx) {
            ctx.onAnnotationEdit(fn)
          },
        }),
      ],
      { history: () => histories[current]!.history }
    )
    expect(histories[0]!.reactions.size).toBe(0)

    document.set(fakeDocument('a'))
    expect(histories[0]!.reactions.size).toBe(1)
    const edit = { kind: 'remove', annotation } as unknown as AnnotationEdit
    for (const r of histories[0]!.reactions) r(edit)
    expect(fn).toHaveBeenCalledWith(edit)

    current = 1
    document.set(fakeDocument('b'))
    expect(histories[0]!.reactions.size).toBe(0)
    expect(histories[1]!.reactions.size).toBe(1)
  })

  it('setup cleanup runs on destroy', () => {
    const cleanup = vi.fn()
    const docCleanup = vi.fn()
    const { host, document, tracked } = hostWith([
      definePlugin({
        id: 'sandbox',
        setup(ctx) {
          ctx.store('suggestions')
          ctx.onDocument(() => docCleanup)
          return cleanup
        },
      }),
    ])
    document.set(fakeDocument('a'))
    host.destroy()
    expect(docCleanup).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(tracked.size).toBe(0)
    host.destroy()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('a throwing setup cleans up the plugins already set up, in reverse, then rethrows', () => {
    const order: string[] = []
    const failure = new Error('setup failed')
    const later = vi.fn()
    expect(() =>
      hostWith([
        definePlugin({ id: 'one', setup: () => () => order.push('one') }),
        definePlugin({ id: 'two', setup: () => () => order.push('two') }),
        definePlugin({
          id: 'three',
          setup() {
            throw failure
          },
        }),
        definePlugin({ id: 'four', setup: later }),
      ])
    ).toThrow(failure)
    expect(order).toEqual(['two', 'one'])
    expect(later).not.toHaveBeenCalled()
  })

  it('duplicate plugin ids throw', () => {
    const plugin = definePlugin({ id: 'sandbox', setup() {} })
    expect(() => hostWith([plugin, { ...plugin }])).toThrow(
      expect.objectContaining({ code: 'DuplicatePlugin' })
    )
  })

  it('gives plugins the host state and records layers', () => {
    const activated = writable<string | null>('a1')
    const setActivated = vi.fn()
    const root = writable<HTMLElement | null>({} as HTMLElement)
    const render = vi.fn()
    let handle!: { invalidate(page?: number): void }
    const { host, document, tracked } = hostWith(
      [
        definePlugin({
          id: 'sandbox',
          setup(ctx) {
            expect(ctx.id).toBe('sandbox')
            expect(ctx.activated.get()).toBe('a1')
            expect(ctx.root.get()).toBe(root.get())
            expect(ctx.document.get()).toBeNull()
            ctx.setActivated(null)
            handle = ctx.layer({ render })
            ctx.store('notes')
          },
        }),
      ],
      { activated, setActivated, root }
    )
    expect(setActivated).toHaveBeenCalledWith(null)
    expect(host.layers).toHaveLength(1)
    expect(host.layers[0]!.plugin).toBe('sandbox')
    // The spec's methods are bound to it, so check render by calling it.
    host.layers[0]!.render({} as HTMLElement, 0, {} as never)
    expect(render).toHaveBeenCalledTimes(1)
    expect(() => handle.invalidate(1)).not.toThrow()
    document.set(fakeDocument('a'))
    expect(tracked.size).toBe(1)
  })
  it("gives plugins only the history's batch, run on the current history", () => {
    const batched: string[] = []
    let current = 'a'
    let history!: PluginContext['history']
    createPluginHost({
      plugins: [
        definePlugin({ id: 'sandbox', setup: (ctx) => void (history = ctx.history) }),
      ],
      document: writable<InkDocument | null>(null),
      history: () => {
        const at = current
        return {
          ...fakeHistory().history,
          batch(fn) {
            batched.push(at)
            fn()
          },
        }
      },
      activated: writable<string | null>(null),
      setActivated() {},
      root: writable<HTMLElement | null>(null),
    })
    expect(Object.keys(history)).toEqual(['batch'])
    const fn = vi.fn()
    history.batch(fn)
    current = 'b'
    history.batch(fn)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(batched).toEqual(['a', 'b'])
  })
})
