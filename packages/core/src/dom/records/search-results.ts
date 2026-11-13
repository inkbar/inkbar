/*
 * The viewer's search hits as a list of cards, for a sidebar panel: the record list over
 * `searchSource`, under a query field and over the find bar's match count. The field and the find
 * bar share the viewer's search state, so they never disagree.
 */
import { Search } from '@inkbar/icons'

import { isBlankQuery } from '../../model/search-text'
import { handleResultsFieldKey } from '../search/find-key'
import { findCountText } from '../search/find-text'
import { createIcon } from '../viewer/controls'
import { messagesOf, onViewerDestroy, type Viewer } from '../viewer/create-viewer'
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
  const messages = messagesOf(viewer)
  const words = () => messages.get().messages

  // A footer under the cards, empty (and hidden) until there is a count to give.
  const count = h('div', {
    class: 'ink-search-results-count',
    'data-ink-search-results-count': '',
  })
  const field =
    opts.field === false
      ? null
      : h('input', {
          type: 'text',
          'aria-label': words().search.field,
          placeholder: words().search.placeholder,
          autocomplete: 'off',
          spellcheck: 'false',
        })
  const bar = field
    ? h(
        'div',
        { class: 'ink-search-results-bar', role: 'search' },
        h(
          'div',
          { class: 'ink-input-group' },
          h('span', { class: 'ink-input-accessory' }, createIcon(Search)),
          field
        )
      )
    : null
  // Nothing found yet is the count's to say while a query is in: "No results", or a scan.
  const rendered = renderRecordList(
    searchSource(search, messages),
    () => isBlankQuery(state.get().query),
    (m) => m.search.prompt,
    messages
  )
  const root = h(
    'div',
    { class: 'ink-search-results', 'data-ink-search-results': '' },
    ...(bar ? [bar] : []),
    rendered.element,
    count
  )

  field?.addEventListener('input', () => search.setQuery(field.value))
  field?.addEventListener('keydown', (e) => handleResultsFieldKey(e, search))

  const show = () => {
    const s = state.get()
    if (field && field.value !== s.query) field.value = s.query
    count.textContent = findCountText(s, words())
    rendered.refreshEmpty()
  }
  show()
  const stopState = state.subscribe(show)
  const stopMessages = messages.subscribe(({ messages: m }) => {
    field?.setAttribute('aria-label', m.search.field)
    if (field) field.placeholder = m.search.placeholder
    show()
  })
  onViewerDestroy(viewer, () => {
    stopState()
    stopMessages()
    rendered.destroy()
  })
  return root
}
