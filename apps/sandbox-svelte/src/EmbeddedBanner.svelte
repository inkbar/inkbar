<script lang="ts">
  import { useEmbedded } from '@inkbar/svelte'

  const embedded = useEmbedded()
</script>

{#if embedded.total > 0}
  <p class="sandbox-banner" role="status" data-testid="embedded-banner">
    This file already contains {embedded.total} annotation{embedded.total === 1
      ? ''
      : 's'} ({embedded.summary.map((s) => `${s.count} ${s.subtype}`).join(', ')}).
  </p>
{/if}
