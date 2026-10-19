import { createAnnotationStore, createHistory, staticDefaults } from '@inkbar/core'
import { trackToolStyle } from '@inkbar/core/dom'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { InkContextObject, type InkContext } from '../context'

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

describe('hooks outside InkRoot', () => {
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
})
