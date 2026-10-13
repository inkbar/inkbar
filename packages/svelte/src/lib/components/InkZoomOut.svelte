<script lang="ts">
  import { Toolbar } from 'bits-ui'

  import { useZoom } from '../hooks/useZoom.svelte.js'

  import { asBitsProps } from './child-snippet.js'

  import type { InkZoomButtonProps } from './zoom-button.js'

  let {
    class: className,
    children,
    child,
    onclick,
    ...rest
  }: InkZoomButtonProps = $props()

  const zoom = useZoom()
</script>

<Toolbar.Button
  class={['ink-zoom-out', className]}
  data-ink-zoom-out=""
  aria-label="Zoom out"
  title="Zoom out"
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    if (!e.defaultPrevented) zoom.zoomOut()
  }}
>
  {#if children}{@render children()}{:else}−{/if}
</Toolbar.Button>
