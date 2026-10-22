import { useInkContext } from '../context.js'
import { useReadable } from '../use-readable.svelte.js'

import type { SearchState, ViewerSearch } from '@inkbar/core/dom'

const CLOSED: SearchState = {
  open: false,
  query: '',
  matchCase: false,
  hits: [],
  current: -1,
  scanning: false,
}

/**
 * The document search for hosts building their own control: the state, and the actions the
 * find bar uses. Search is set up once InkRoot has mounted, so until then (and on the server)
 * the state is closed and the actions do nothing. `open()` runs the search and draws the
 * highlights even when no find bar is mounted.
 */
export function useSearch(): { readonly state: SearchState } & Omit<
  ViewerSearch,
  'state'
> {
  const ctx = useInkContext('useSearch()')
  const state = useReadable<SearchState>(() => ctx.search?.state, CLOSED)
  return {
    get state() {
      return state.current
    },
    open: (query) => ctx.search?.open(query),
    setQuery: (query) => ctx.search?.setQuery(query),
    setMatchCase: (on) => ctx.search?.setMatchCase(on),
    next: () => ctx.search?.next(),
    previous: () => ctx.search?.previous(),
    close: () => ctx.search?.close(),
  }
}
