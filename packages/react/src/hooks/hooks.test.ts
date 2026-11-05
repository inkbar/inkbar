import {
  createAnnotationStore,
  createHistory,
  staticDefaults,
  writable,
  type InkDocument,
  type Rect,
  type RecordBase,
} from '@inkbar/core'
import {
  createPluginHost,
  definePlugin,
  trackToolStyle,
  type PluginHost,
} from '@inkbar/core/dom'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { InkContextObject, type InkContext } from '../context'

import { useAnnotations } from './useAnnotations'
import { useDocument } from './useDocument'
import { useEmbedded } from './useEmbedded'
import { useForm } from './useForm'
import { useHistory } from './useHistory'
import { usePage } from './usePage'
import { useRecords } from './useRecords'
import { useRecordSelection } from './useRecordSelection'
import { useSearch } from './useSearch'
import { useSelection } from './useSelection'
import { useTool } from './useTool'
import { useToolOptions } from './useToolOptions'
import { useToolStyle } from './useToolStyle'
import { useZoom } from './useZoom'

describe('hooks outside InkRoot', () => {
  it.each([
    ['useDocument()', useDocument],
    ['useAnnotations()', useAnnotations],
    ['useTool()', useTool],
    ['useSelection()', useSelection],
    ['useZoom()', useZoom],
    ['useSearch()', useSearch],
    ['usePage()', usePage],
    ['useHistory()', useHistory],
    ['useEmbedded()', useEmbedded],
    ['useForm()', useForm],
    ['useToolStyle()', useToolStyle],
    ['useToolOptions()', () => useToolOptions('note')],
    ['useRecords()', () => useRecords('sandbox.suggestions')],
    ['useRecordSelection()', () => useRecordSelection('sandbox.suggestions')],
  ])('%s throws a readable error', (name, use) => {
    function Probe(): null {
      use()
      return null
    }
    expect(() => renderToString(createElement(Probe))).toThrow(
      `[inkbar] ${name} must be called in a component inside <InkRoot>.`
    )
  })
})

describe('useDocument without a document', () => {
  it('returns the same empty pages reference on every render', () => {
    const value = {
      document: null,
      status: { state: 'loading' },
    } as unknown as InkContext
    const seen: unknown[] = []
    function Probe(): null {
      seen.push(useDocument().pages)
      return null
    }
    const tree = createElement(InkContextObject.Provider, { value }, createElement(Probe))
    renderToString(tree)
    renderToString(tree)
    expect(seen[0]).toBe(seen[1])
  })
})

describe('useToolStyle', () => {
  it('setting style through the hook updates a selected annotation', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const history = createHistory(store)
    const { toolStyle } = trackToolStyle({ store, history, tool: 'select' })
    const a = store.add({
      type: 'square',
      page: 0,
      rect: { x: 0, y: 0, width: 10, height: 10 },
    })
    store.select([a.id])
    const value = { toolStyle } as unknown as InkContext
    let api: ReturnType<typeof useToolStyle> | undefined
    function Probe(): null {
      api = useToolStyle()
      return null
    }
    renderToString(
      createElement(InkContextObject.Provider, { value }, createElement(Probe))
    )
    // The server renders the empty fallback; the browser reads the store.
    expect(api?.current).toEqual({})
    api?.set({ width: 4, border: '#00FF00' })
    expect(store.get(a.id)).toMatchObject({ width: 4, color: '#00FF00' })
    expect(api?.get('shape')).toMatchObject({ width: 4, border: '#00FF00' })
    history.undo()
    expect(store.get(a.id)).toMatchObject({ width: 1 })
  })

  it('scoped to a group, it sets that group and leaves a selection outside it', () => {
    const store = createAnnotationStore({
      mode: { mode: 'uncontrolled' },
      defaults: staticDefaults,
    })
    const history = createHistory(store)
    const { toolStyle } = trackToolStyle({ store, history, tool: 'select-text' })
    const a = store.add({
      type: 'square',
      page: 0,
      rect: { x: 0, y: 0, width: 10, height: 10 },
    })
    store.select([a.id])
    const value = { toolStyle } as unknown as InkContext
    let api: ReturnType<typeof useToolStyle> | undefined
    function Probe(): null {
      api = useToolStyle('markup')
      return null
    }
    renderToString(
      createElement(InkContextObject.Provider, { value }, createElement(Probe))
    )
    api?.set({ border: '#00FF00' })
    expect(store.get(a.id)?.color).toBe(a.color)
    expect(api?.get('markup')).toMatchObject({ border: '#00FF00' })
  })

  // Checked by typecheck: never called.
  it('offers set options only when it is not scoped to a group', () => {
    const useTypes = () => {
      useToolStyle().set({ width: 2 }, { apply: false })
      // @ts-expect-error A scoped style sets its own group, so it takes no options.
      useToolStyle('shape').set({ width: 2 }, { apply: false })
    }
    expect(useTypes).toBeTypeOf('function')
  })
})

describe('useSearch before the root has set search up', () => {
  it('is closed, and its actions do nothing', () => {
    const value = { search: null } as unknown as InkContext
    let seen: ReturnType<typeof useSearch> | undefined
    function Probe(): null {
      seen = useSearch()
      return null
    }
    renderToString(
      createElement(InkContextObject.Provider, { value }, createElement(Probe))
    )
    expect(seen?.state).toMatchObject({ open: false, query: '', hits: [], current: -1 })
    expect(() => {
      seen?.open('x')
      seen?.setQuery('x')
      seen?.next()
      seen?.close()
    }).not.toThrow()
  })
})

interface Suggestion extends RecordBase {
  page: number
  rect: Rect
}

const suggestion = (id: string, y: number): Suggestion => ({
  id,
  page: 0,
  rect: { x: 100, y, width: 50, height: 10 },
})

/** A plugin host whose plugin `sandbox` keeps `suggestions`, with one marks registration over them. */
function suggestionsHost(initial: Suggestion[]): PluginHost {
  const plugin = definePlugin('sandbox', (api) => {
    api.records<Suggestion>('suggestions', { initial: () => initial })
  })
  const history = createHistory(
    createAnnotationStore({ mode: { mode: 'uncontrolled' }, defaults: staticDefaults })
  )
  const pluginHost = createPluginHost({
    plugins: [plugin()],
    document: writable<InkDocument | null>({
      key: 'a',
      status: writable({ state: 'ready' }),
    } as unknown as InkDocument),
    history: () => history,
    activated: writable<string | null>(null),
    setActivated() {},
    root: writable<HTMLElement | null>(null),
  })
  pluginHost.marks.add('sandbox.suggestions', {
    plugin: 'sandbox',
    where: () => true,
    label: (s: Suggestion) => s.id,
    rect: (s: Suggestion) => s.rect,
    batch: (fn: () => void) => history.batch(fn),
  })
  return pluginHost
}

/** Renders `use` on the server under a context holding `pluginHost`, returning what it gave. */
function renderWithHost<R>(pluginHost: PluginHost | null, use: () => R): R {
  const value = { pluginHost } as unknown as InkContext
  let result: R | undefined
  function Probe(): null {
    result = use()
    return null
  }
  renderToString(
    createElement(InkContextObject.Provider, { value }, createElement(Probe))
  )
  return result!
}

// Live updates in the browser: RecordList.ct.tsx.
describe('records hooks', () => {
  it('useRecords is empty before mount and hands over the host records after', () => {
    const before = renderWithHost(null, () =>
      useRecords<Suggestion>('sandbox.suggestions')
    )
    expect(before.handle).toBeNull()
    expect(before.records).toEqual([])

    const host = suggestionsHost([suggestion('s1', 700)])
    const after = renderWithHost(host, () =>
      useRecords<Suggestion>('sandbox.suggestions')
    )
    expect(after.handle).toBe(host.records('sandbox.suggestions'))
    // The server renders nothing listed; the browser reads the store.
    expect(after.records).toEqual([])
    after.handle!.add(suggestion('s2', 600))
    expect(
      host
        .records('sandbox.suggestions')
        .list.get()
        .map((r) => r.id)
    ).toEqual(['s1', 's2'])
  })

  it('useRecordSelection selects nothing before mount and through the host after', () => {
    const before = renderWithHost(null, () => useRecordSelection('sandbox.suggestions'))
    expect(before.selected).toBeNull()
    expect(() => before.select('s1')).not.toThrow()

    const host = suggestionsHost([suggestion('s1', 700), suggestion('s2', 600)])
    const after = renderWithHost(host, () => useRecordSelection('sandbox.suggestions'))
    const shared = host.selection('sandbox.suggestions')
    after.select('s1')
    expect(shared.selected.get()).toBe('s1')
    after.select(null)
    expect(shared.selected.get()).toBeNull()
  })
})
