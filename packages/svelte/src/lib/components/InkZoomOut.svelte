<script lang="ts">
  import { Toolbar } from 'bits-ui'

  import { useZoom } from '../hooks/useZoom.svelte.js'

  import type { InkZoomButtonProps } from './zoom-button.js'

  let { class: className, children, onclick, ...rest }: InkZoomButtonProps = $props()

  const zoom = useZoom()
  // Bits UI types attributes without `| null | undefined` (exactOptionalPropertyTypes); the
  // values, `child` included, are passed through untouched.
  const passthrough = $derived(rest as Record<string, unknown>)
</script>

<Toolbar.Button
  class={['ink-zoom-out', className]}
  data-ink-zoom-out=""
  aria-label="Zoom out"
  title="Zoom out"
  {...passthrough}
  onclick={(e) => {
    onclick?.(e)
    if (!e.defaultPrevented) zoom.zoomOut()
  }}
>
  {#if children}{@render children()}{:else}−{/if}
</Toolbar.Button>
