import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { SearchState, ViewerSearch } from '@inkbar/core/dom'
import type { Ref } from 'vue'

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
export function useSearch(): { state: Readonly<Ref<SearchState>> } & Omit<
  ViewerSearch,
  'state'
> {
  const search = useInkContext('useSearch()').search
  return {
    state: useReadable(() => search.value?.state, CLOSED),
    open: (query) => search.value?.open(query),
    setQuery: (query) => search.value?.setQuery(query),
    setMatchCase: (on) => search.value?.setMatchCase(on),
    next: () => search.value?.next(),
    previous: () => search.value?.previous(),
    close: () => search.value?.close(),
  }
}
