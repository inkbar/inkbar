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
