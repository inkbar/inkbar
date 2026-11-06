<script module lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'

  export interface InkSearchResultsProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'children'
  > {
    /** Show the query field. Default true; turn it off when a find bar is on the page. */
    field?: boolean | undefined
  }
</script>

<script lang="ts">
  /*
   * The search hits as a list of cards, for a sidebar panel: `createSearchResults` on core's
   * record list controller over the root's search. One card per hit, with its page and the text
   * around it. Choosing a card makes its hit current, as the find bar's next and previous do, and
   * the current hit is the selected card. Above the cards, a query field ("Find in document";
   * `field={false}` leaves it out when a find bar is on the page) and the find bar's match count.
   * Field and find bar share the search state, so they never disagree. It fills its parent's
   * height. Inside `InkRoot`; it renders empty on the server.
   */
  import {
    findCountText,
    handleResultsFieldKey,
    isBlankQuery,
    searchSource,
  } from '@inkbar/core/dom'
  import { Search } from '@inkbar/icons'

  import { useInkContext } from '../context.js'
  import { useSearch } from '../hooks/useSearch.svelte.js'

  import InkIcon from './InkIcon.svelte'
  import RecordCards from './RecordCards.svelte'

  let { field = true, class: className, ...rest }: InkSearchResultsProps = $props()

  const ctx = useInkContext('InkSearchResults')
  const search = useSearch()
  const source = $derived(ctx.search ? searchSource(ctx.search) : null)
  // Nothing found yet is the count's to say while a query is in: "No results", or a scan.
  const blank = $derived(isBlankQuery(search.state.query))
</script>

<div {...rest} class={['ink-search-results', className]} data-ink-search-results="">
  <div class="ink-search-results-bar" role={field ? 'search' : undefined}>
    {#if field}
      <!-- The field is the search state's: a query typed in the find bar shows here. -->
      <div class="ink-input-group">
        <span class="ink-input-accessory"><InkIcon icon={Search} /></span>
        <input
          type="text"
          aria-label="Find in document"
          placeholder="Find in document"
          autocomplete="off"
          spellcheck={false}
          value={search.state.query}
          oninput={(e) => search.setQuery(e.currentTarget.value)}
          onkeydown={(e) => handleResultsFieldKey(e, search)}
        />
      </div>
    {/if}
    <span class="ink-find-count" data-ink-search-results-count=""
      >{findCountText(search.state)}</span
    >
  </div>
  <RecordCards {source} emptyShown={blank}>
    {#snippet empty()}Search to list every match.{/snippet}
  </RecordCards>
</div>
