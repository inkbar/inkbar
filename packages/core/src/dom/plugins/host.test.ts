import { describe, expect, it, vi } from 'vitest'

import { writable } from '../../model/readable'

import { definePlugin, type InkPlugin } from './define'
import { createPluginHost, type PluginHostOptions } from './host'

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
    expect(() => definePlugin({ id: 'Sandbox', setup() {} })).toThrow()
    expect(() => definePlugin({ id: 'a.b', setup() {} })).toThrow()
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
            ctx.onDocument(() => {
              ctx.history.track({} as RecordStore<RecordBase>)
            })
          },
        }),
      ],
      { activated, setActivated, root }
    )
    expect(setActivated).toHaveBeenCalledWith(null)
    expect(host.layers).toEqual([expect.objectContaining({ plugin: 'sandbox', render })])
    expect(() => handle.invalidate(1)).not.toThrow()
    document.set(fakeDocument('a'))
    expect(tracked.size).toBe(1)
  })
})
