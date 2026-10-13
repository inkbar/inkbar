<script lang="ts">
  import { useReadable } from '../../lib/use-readable.svelte.js'

  import type { Readable } from '@inkbar/core'

  let {
    source,
    fallback = 'fallback',
  }: { source: Readable<string> | null; fallback?: string } = $props()

  // The fallback is fixed per mount in these tests.
  // svelte-ignore state_referenced_locally
  const value = useReadable(() => source, fallback)
</script>

<output data-testid="value">{value.current}</output>
