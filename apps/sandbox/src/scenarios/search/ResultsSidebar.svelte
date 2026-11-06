<script lang="ts">
  /*
   * Every hit, in a panel right of the pages; the find bar is the query field. Your code
   * decides when it shows: here, while the search has hits. It sits inside InkRoot to reach
   * search.
   */
  import { InkSearchResults, useSearch } from '@inkbar/svelte'

  const search = useSearch()
  const hasResults = $derived(search.state.hits.length > 0)
</script>

<!-- Hidden rather than removed, so the list keeps its scroll between searches. -->
<aside class="results-aside" aria-labelledby="results-title" hidden={!hasResults}>
  <h2 id="results-title" class="results-aside-title">Search results</h2>
  <InkSearchResults field={false} />
</aside>
