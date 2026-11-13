import {
  findCountText,
  handleResultsFieldKey,
  isBlankQuery,
  searchSource,
} from '@inkbar/core/dom'
import { Search } from '@inkbar/icons'
import { useLayoutEffect, useMemo, useRef, type ComponentPropsWithoutRef } from 'react'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { useSearch } from '../hooks/useSearch'

import { InkIcon } from './InkIcon'
import { RecordCards } from './RecordCards'

export interface InkSearchResultsProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'children'
> {
  /** Show the query field. Default true; turn it off when a find bar is on the page. */
  field?: boolean | undefined
}

/**
 * The search hits as a list of cards, for a sidebar panel: `createSearchResults` on core's
 * record list controller over the root's search. One card per hit, with its page and the text
 * around it. Choosing a card makes its hit current, as the find bar's next and previous do, and
 * the current hit is the selected card. Above the cards, a query field (`field={false}`
 * leaves it out when a find bar is on the page); under them, the find bar's match count.
 * Field and find bar share the search state, so they never disagree. It fills its parent's
 * height. Inside `InkRoot`; it renders empty on the server.
 */
export function InkSearchResults({
  field = true,
  className,
  ...rest
}: InkSearchResultsProps) {
  const ctx = useInkContext('InkSearchResults')
  const search = useSearch()
  const { state } = search
  const m = ctx.messages
  // The store, not the words: the source relabels its cards itself, so it outlives new words.
  const source = useMemo(
    () => (ctx.search ? searchSource(ctx.search, ctx.messageState) : null),
    [ctx.search, ctx.messageState]
  )
  const input = useRef<HTMLInputElement>(null)

  // The field is the search state's: a query typed in the find bar shows here.
  useLayoutEffect(() => {
    const el = input.current
    if (el && el.value !== state.query) el.value = state.query
  }, [state.query, field])

  return (
    <div
      {...rest}
      className={cx('ink-search-results', className)}
      data-ink-search-results=""
    >
      {field ? (
        <div className="ink-search-results-bar" role="search">
          <div className="ink-input-group">
            <span className="ink-input-accessory">
              <InkIcon icon={Search} />
            </span>
            <input
              ref={input}
              type="text"
              aria-label={m.search.field}
              placeholder={m.search.placeholder}
              autoComplete="off"
              spellCheck={false}
              defaultValue={state.query}
              onInput={(e) => search.setQuery(e.currentTarget.value)}
              onKeyDown={(e) => handleResultsFieldKey(e.nativeEvent, search)}
            />
          </div>
        </div>
      ) : null}
      {/* Nothing found yet is the count's to say while a query is in: "No results", or a scan. */}
      <RecordCards
        source={source}
        emptyShown={isBlankQuery(state.query)}
        empty={m.search.prompt}
      />
      {/* A footer under the cards, hidden while empty. */}
      <div className="ink-search-results-count" data-ink-search-results-count="">
        {findCountText(state, m)}
      </div>
    </div>
  )
}
