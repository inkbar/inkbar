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
  class={['ink-zoom-in', className]}
  data-ink-zoom-in=""
  aria-label="Zoom in"
  title="Zoom in"
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    if (!e.defaultPrevented) zoom.zoomIn()
  }}
>
  {#if children}{@render children()}{:else}+{/if}
</Toolbar.Button>
