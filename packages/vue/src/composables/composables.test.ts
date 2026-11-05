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
import { describe, expect, it } from 'vitest'
import {
  createRenderer,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  shallowRef,
} from 'vue'
import { renderToString } from 'vue/server-renderer'

import { provideInkContext, type InkContext } from '../context'

import { useAnnotations } from './useAnnotations'
import { useDocument } from './useDocument'
import { useEmbedded } from './useEmbedded'
import { useForm } from './useForm'
import { useHistory } from './useHistory'
import { usePage } from './usePage'
import { useRecords } from './useRecords'
import { useRecordSelection } from './useRecordSelection'
import { useSelection } from './useSelection'
import { useTool } from './useTool'
import { useToolOptions } from './useToolOptions'
import { useToolStyle } from './useToolStyle'
import { useZoom } from './useZoom'

describe('composables outside InkRoot', () => {
  it.each([
    ['useDocument()', useDocument],
    ['useAnnotations()', useAnnotations],
    ['useTool()', useTool],
    ['useSelection()', useSelection],
    ['useZoom()', useZoom],
    ['usePage()', usePage],
    ['useHistory()', useHistory],
    ['useEmbedded()', useEmbedded],
    ['useForm()', useForm],
    ['useToolStyle()', useToolStyle],
    ['useToolOptions()', () => useToolOptions('note')],
    ['useRecords()', () => useRecords('sandbox.suggestions')],
    ['useRecordSelection()', () => useRecordSelection('sandbox.suggestions')],
  ])('%s throws a readable error', (name, use) => {
    expect(() => use()).toThrow(
      `[inkbar] ${name} must be called in a component inside <InkRoot>.`
    )
  })
})

describe('useToolStyle', () => {
  it('setting style through the composable updates a selected annotation', async () => {
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
    let api: ReturnType<typeof useToolStyle> | undefined
    // eslint-disable-next-line vue/one-component-per-file
    const Probe = defineComponent({
      setup() {
        api = useToolStyle()
        return () => null
      },
    })
    // eslint-disable-next-line vue/one-component-per-file
    const Root = defineComponent({
      setup() {
        provideInkContext({ toolStyle: shallowRef(toolStyle) } as unknown as InkContext)
        return () => h(Probe)
      },
    })
    await renderToString(createSSRApp(Root))
    expect(api?.current.value.width).toBe(1)
    expect(api?.supported.value.has('fill')).toBe(true)
    api?.set({ width: 4, border: '#00FF00' })
    expect(store.get(a.id)).toMatchObject({ width: 4, color: '#00FF00' })
    expect(api?.get('shape')).toMatchObject({ width: 4, border: '#00FF00' })
    history.undo()
    expect(store.get(a.id)).toMatchObject({ width: 1 })
  })

  it('scoped to a group, it shows and sets that group and leaves a selection outside it', async () => {
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
    let api: ReturnType<typeof useToolStyle> | undefined
    // eslint-disable-next-line vue/one-component-per-file
    const Probe = defineComponent({
      setup() {
        api = useToolStyle('markup')
        return () => null
      },
    })
    // eslint-disable-next-line vue/one-component-per-file
    const Root = defineComponent({
      setup() {
        provideInkContext({ toolStyle: shallowRef(toolStyle) } as unknown as InkContext)
        return () => h(Probe)
      },
    })
    await renderToString(createSSRApp(Root))
    expect(api?.supported.value.has('border')).toBe(true)
    expect(api?.supported.value.has('width')).toBe(false)
    api?.set({ border: '#00FF00' })
    expect(store.get(a.id)?.color).toBe(a.color)
    expect(api?.get('markup')).toMatchObject({ border: '#00FF00' })
    expect(api?.current.value.border).toBe('#00FF00')
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

interface TreeNode {
  parent: TreeNode | null
  children: TreeNode[]
}

/** Vue's renderer over plain objects: mounts a component in node, where effects stay live. */
const { createApp } = createRenderer<TreeNode, TreeNode>({
  createElement: () => ({ parent: null, children: [] }),
  createText: () => ({ parent: null, children: [] }),
  createComment: () => ({ parent: null, children: [] }),
  setText() {},
  setElementText() {},
  patchProp() {},
  insert(child, parent, anchor) {
    child.parent = parent
    const at = anchor ? parent.children.indexOf(anchor) : -1
    if (at < 0) parent.children.push(child)
    else parent.children.splice(at, 0, child)
  },
  remove(child) {
    const siblings = child.parent?.children
    if (siblings) siblings.splice(siblings.indexOf(child), 1)
    child.parent = null
  },
  parentNode: (node) => node.parent,
  nextSibling(node) {
    const siblings = node.parent?.children ?? []
    return siblings[siblings.indexOf(node) + 1] ?? null
  },
})

/** Runs `use` in a component under a context whose plugin host starts out null. */
function mountWithHost<R>(use: () => R) {
  const pluginHost = shallowRef<PluginHost | null>(null)
  let result: R | undefined
  // eslint-disable-next-line vue/one-component-per-file
  const Probe = defineComponent({
    setup() {
      result = use()
      return () => null
    },
  })
  // eslint-disable-next-line vue/one-component-per-file
  const Root = defineComponent({
    setup() {
      provideInkContext({ pluginHost } as unknown as InkContext)
      return () => h(Probe)
    },
  })
  const app = createApp(Root)
  app.mount({ parent: null, children: [] })
  return { pluginHost, result: result!, unmount: () => app.unmount() }
}

describe('records composables', () => {
  it('useRecords is empty before mount and live after', async () => {
    const { pluginHost, result, unmount } = mountWithHost(() =>
      useRecords<Suggestion>('sandbox.suggestions')
    )
    expect(result.handle.value).toBeNull()
    expect(result.records.value).toEqual([])

    const host = suggestionsHost([suggestion('s1', 700)])
    pluginHost.value = host
    await nextTick()
    expect(result.handle.value).toBe(host.records('sandbox.suggestions'))
    expect(result.records.value.map((r) => r.id)).toEqual(['s1'])
    // Live: a write through the handle shows without a tick.
    result.handle.value!.add(suggestion('s2', 600))
    expect(result.records.value.map((r) => r.id)).toEqual(['s1', 's2'])

    // Gone with the host, as when the root unmounts.
    pluginHost.value = null
    await nextTick()
    expect(result.handle.value).toBeNull()
    expect(result.records.value).toEqual([])
    unmount()
  })

  it('useRecordSelection follows mark clicks', async () => {
    const { pluginHost, result, unmount } = mountWithHost(() =>
      useRecordSelection('sandbox.suggestions')
    )
    expect(result.selected.value).toBeNull()
    // Before the host exists, selecting does nothing and does not throw.
    result.select('s1')
    expect(result.selected.value).toBeNull()

    const host = suggestionsHost([suggestion('s1', 700), suggestion('s2', 600)])
    pluginHost.value = host
    await nextTick()
    const shared = host.selection('sandbox.suggestions')
    // A mark click selects through the host's selection, as every list does.
    shared.select('s2')
    expect(result.selected.value).toBe('s2')
    result.select('s1')
    expect(shared.selected.get()).toBe('s1')
    expect(result.selected.value).toBe('s1')
    result.select(null)
    expect(shared.selected.get()).toBeNull()
    unmount()
  })
})
