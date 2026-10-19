import { createAnnotationStore, createHistory, staticDefaults } from '@inkbar/core'
import { trackToolStyle } from '@inkbar/core/dom'
import { describe, expect, it } from 'vitest'
import { createSSRApp, defineComponent, h, shallowRef } from 'vue'
import { renderToString } from 'vue/server-renderer'

import { provideInkContext, type InkContext } from '../context'

import { useAnnotations } from './useAnnotations'
import { useDocument } from './useDocument'
import { useEmbedded } from './useEmbedded'
import { useHistory } from './useHistory'
import { usePage } from './usePage'
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
    ['useToolStyle()', useToolStyle],
    ['useToolOptions()', () => useToolOptions('note')],
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
})
