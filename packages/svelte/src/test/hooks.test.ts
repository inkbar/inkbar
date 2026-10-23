import { createAnnotationStore, createHistory, staticDefaults } from '@inkbar/core'
import { trackToolStyle } from '@inkbar/core/dom'
import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'

import { useAnnotations } from '../lib/hooks/useAnnotations.svelte.js'
import { useCommand } from '../lib/hooks/useCommand.svelte.js'
import { useDocument } from '../lib/hooks/useDocument.svelte.js'
import { useEmbedded } from '../lib/hooks/useEmbedded.svelte.js'
import { useHistory } from '../lib/hooks/useHistory.svelte.js'
import { usePage } from '../lib/hooks/usePage.svelte.js'
import { useSearch } from '../lib/hooks/useSearch.svelte.js'
import { useSelection } from '../lib/hooks/useSelection.svelte.js'
import { useTool } from '../lib/hooks/useTool.svelte.js'
import { useToolOptions } from '../lib/hooks/useToolOptions.svelte.js'
import { useToolStyle } from '../lib/hooks/useToolStyle.svelte.js'
import { useZoom } from '../lib/hooks/useZoom.svelte.js'

import PendingCommandHost from './harness/PendingCommandHost.svelte'
import ToolStyleProbe from './harness/ToolStyleProbe.svelte'

describe('hooks outside InkRoot', () => {
  it.each([
    ['useDocument()', useDocument],
    ['useAnnotations()', useAnnotations],
    ['useTool()', useTool],
    ['useSelection()', useSelection],
    ['useZoom()', useZoom],
    ['usePage()', usePage],
    ['useHistory()', useHistory],
    ['useSearch()', useSearch],
    ['useEmbedded()', useEmbedded],
    ['useToolStyle()', useToolStyle],
    ['useToolOptions()', () => useToolOptions('note')],
    ['useCommand()', () => useCommand('sandbox.ping')],
  ])('%s throws a readable error', (name, use) => {
    // Outside any component Svelte's own getContext throws; the hook turns that into its message.
    expect(() => use()).toThrow(
      `[inkbar] ${name} must be called in a component inside <InkRoot>.`
    )
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
    let api: ReturnType<typeof useToolStyle> | undefined
    // The render runs when its output is read.
    void render(ToolStyleProbe, {
      props: {
        context: { toolStyle },
        onApi: (x) => {
          api = x
        },
      },
    }).body
    expect(api?.current.width).toBe(1)
    expect(api?.supported.has('fill')).toBe(true)
    api?.set({ width: 4, border: '#00FF00' })
    expect(store.get(a.id)).toMatchObject({ width: 4, color: '#00FF00' })
    expect(api?.get('shape')).toMatchObject({ width: 4, border: '#00FF00' })
    history.undo()
    expect(store.get(a.id)).toMatchObject({ width: 1 })
  })

  it('scoped to a group, it shows and sets that group and leaves a selection outside it', () => {
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
    void render(ToolStyleProbe, {
      props: {
        context: { toolStyle },
        group: 'markup',
        onApi: (x) => {
          api = x
        },
      },
    }).body
    expect(api?.supported.has('border')).toBe(true)
    expect(api?.supported.has('width')).toBe(false)
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

describe('useCommand', () => {
  it('renders without throwing on the server, before any plugin is set up', () => {
    const assets = { worker: 'w', cMaps: 'c', standardFonts: 's', wasm: 'm', icc: 'i' }
    // The render runs when its output is read.
    expect(
      () => void render(PendingCommandHost, { props: { assets } }).body
    ).not.toThrow()
  })
})
