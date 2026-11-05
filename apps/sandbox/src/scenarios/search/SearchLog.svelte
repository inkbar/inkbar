<script lang="ts">
  /*
   * Logs each finished search and each step to a hit, while the find bar is open. It sits
   * inside InkRoot to reach search.
   */
  import { useSearch } from '@inkbar/svelte'

  import type { Log } from '../../frameworks/types'

  let { log }: { log: Log } = $props()

  const search = useSearch()
  const open = $derived(search.state.open)
  const query = $derived(search.state.query)
  const hits = $derived(search.state.hits.length)
  const current = $derived(search.state.current)
  const scanning = $derived(search.state.scanning)
  $effect(() => {
    if (open && query && !scanning) log('search', { query, hits, current })
  })
</script>
