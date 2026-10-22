<script lang="ts">
  import { useSearch } from '../../lib/hooks/useSearch.svelte.js'

  const search = useSearch()
</script>

<output data-testid="query">{search.state.query}</output>
<output data-testid="open">{String(search.state.open)}</output>
<button type="button" data-testid="set-query" onclick={() => search.setQuery('Inkbar')}>
  Set
</button>
