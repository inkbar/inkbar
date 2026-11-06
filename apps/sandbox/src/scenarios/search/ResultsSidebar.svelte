<script lang="ts">
  /*
   * Every hit, in a rail sidebar right of the pages; the find bar is the query field. Your
   * code decides when the sidebar shows: here, while the search has hits. It sits inside
   * InkRoot to reach search.
   */
  import { Search } from '@inkbar/icons'
  import { InkPanel, InkSearchResults, InkSidebar, useSearch } from '@inkbar/svelte'

  const search = useSearch()
  const hasResults = $derived(search.state.hits.length > 0)
</script>

<InkSidebar side="right" visible={hasResults}>
  <InkPanel id="results" label="Search results" icon={Search}>
    <InkSearchResults field={false} />
  </InkPanel>
</InkSidebar>
