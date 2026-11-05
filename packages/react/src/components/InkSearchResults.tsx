import {
  findCountText,
  handleResultsFieldKey,
  isBlankQuery,
  searchSource,
} from '@inkbar/core/dom'
import { useLayoutEffect, useMemo, useRef, type ComponentPropsWithoutRef } from 'react'

import { cx } from '../class-names'
import { useInkContext } from '../context'
import { useSearch } from '../hooks/useSearch'

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
 * the current hit is the selected card. Above the cards, a query field ("Find in document";
 * `field={false}` leaves it out when a find bar is on the page) and the find bar's match count.
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
  const source = useMemo(
    () => (ctx.search ? searchSource(ctx.search) : null),
    [ctx.search]
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
      <div className="ink-search-results-bar" role={field ? 'search' : undefined}>
        {field ? (
          <input
            ref={input}
            type="text"
            aria-label="Find in document"
            autoComplete="off"
            spellCheck={false}
            defaultValue={state.query}
            onInput={(e) => search.setQuery(e.currentTarget.value)}
            onKeyDown={(e) => handleResultsFieldKey(e.nativeEvent, search)}
          />
        ) : null}
        <span className="ink-find-count" data-ink-search-results-count="">
          {findCountText(state)}
        </span>
      </div>
      {/* Nothing found yet is the count's to say while a query is in: "No results", or a scan. */}
      <RecordCards source={source} emptyShown={isBlankQuery(state.query)} />
    </div>
  )
}
