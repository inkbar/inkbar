/*
 * The viewer's search hits as a list of cards, for a sidebar panel: the record list over
 * `searchSource`, under a query field and the find bar's match count. The field and the find
 * bar share the viewer's search state, so they never disagree.
 */
import { isBlankQuery } from '../../model/search-text'
import { handleResultsFieldKey } from '../search/find-key'
import { findCountText } from '../search/find-text'
import { onViewerDestroy, type Viewer } from '../viewer/create-viewer'
import { h } from '../viewer/dom'

import { renderRecordList } from './list'
import { searchSource } from './source'

export interface SearchResultsOptions {
  /** Show a query field above the results. Default true; turn it off when a find bar is on the page. */
  field?: boolean
}

/**
 * One card per search hit: its page, its place on that page and the text around it. Choosing
 * a card makes its hit current, as the find bar's next and previous do, and the find bar's
 * current hit is the selected card. The count shows the scan's progress and "No results". It stops when the
 * viewer is destroyed.
 */
export function createSearchResults(
  viewer: Viewer,
  opts: SearchResultsOptions = {}
): HTMLElement {
  const search = viewer.search
  const { state } = search

  const count = h('span', {
    class: 'ink-find-count',
    'data-ink-search-results-count': '',
  })
  const field =
    opts.field === false
      ? null
      : h('input', {
          type: 'text',
          'aria-label': 'Find in document',
          placeholder: 'Find in document',
          autocomplete: 'off',
          spellcheck: 'false',
        })
  const bar = h(
    'div',
    { class: 'ink-search-results-bar', ...(field && { role: 'search' }) },
    ...(field ? [field] : []),
    count
  )
  // Nothing found yet is the count's to say while a query is in: "No results", or a scan.
  const rendered = renderRecordList(
    searchSource(search),
    () => isBlankQuery(state.get().query),
    'Search to list every match.'
  )
  const root = h(
    'div',
    { class: 'ink-search-results', 'data-ink-search-results': '' },
    bar,
    rendered.element
  )

  field?.addEventListener('input', () => search.setQuery(field.value))
  field?.addEventListener('keydown', (e) => handleResultsFieldKey(e, search))

  const show = () => {
    const s = state.get()
    if (field && field.value !== s.query) field.value = s.query
    count.textContent = findCountText(s)
    rendered.refreshEmpty()
  }
  show()
  const stopState = state.subscribe(show)
  onViewerDestroy(viewer, () => {
    stopState()
    rendered.destroy()
  })
  return root
}
