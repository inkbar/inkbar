import { describe, expect, it } from 'vitest'

import { useAnnotations } from '../lib/hooks/useAnnotations.svelte.js'
import { useDocument } from '../lib/hooks/useDocument.svelte.js'
import { useEmbedded } from '../lib/hooks/useEmbedded.svelte.js'
import { useHistory } from '../lib/hooks/useHistory.svelte.js'
import { usePage } from '../lib/hooks/usePage.svelte.js'
import { useSelection } from '../lib/hooks/useSelection.svelte.js'
import { useTool } from '../lib/hooks/useTool.svelte.js'
import { useZoom } from '../lib/hooks/useZoom.svelte.js'

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
    // Outside any component Svelte's own getContext throws; the hook turns that into its message.
    expect(() => use()).toThrow(
      `[inkbar] ${name} must be called in a component inside <InkRoot>.`
    )
  })
})
