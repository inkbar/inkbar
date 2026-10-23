import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { SearchState, ViewerSearch } from '@inkbar/core/dom'

const CLOSED: SearchState = {
  open: false,
  query: '',
  matchCase: false,
  hits: [],
  current: -1,
  scanning: false,
}

const noop = (): void => undefined

/**
 * The document search for hosts building their own control: the state, and the actions the
 * find bar uses. Search is set up once InkRoot has mounted, so until then (and on the server)
 * the state is closed and the actions do nothing. `open()` runs the search and draws the
 * highlights even when no find bar is mounted.
 */
export function useSearch(): { state: SearchState } & Omit<ViewerSearch, 'state'> {
  const search = useInkContext('useSearch()').search
  const state = useReadable<SearchState>(search?.state, CLOSED)
  return {
    state,
    open: search ? (query) => search.open(query) : noop,
    setQuery: search ? (query) => search.setQuery(query) : noop,
    setMatchCase: search ? (on) => search.setMatchCase(on) : noop,
    next: search ? () => search.next() : noop,
    previous: search ? () => search.previous() : noop,
    close: search ? () => search.close() : noop,
  }
}
