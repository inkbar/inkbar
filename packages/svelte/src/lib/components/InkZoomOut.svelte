<script lang="ts">
  import { ZoomOut } from '@inkbar/icons'
  import { Toolbar } from 'bits-ui'

  import { useZoom } from '../hooks/useZoom.svelte.js'
  import { useMessages } from '../messages.js'

  import { asBitsProps } from './child-snippet.js'
  import InkIcon from './InkIcon.svelte'

  import type { InkZoomButtonProps } from './zoom-button.js'

  let {
    class: className,
    children,
    child,
    onclick,
    ...rest
  }: InkZoomButtonProps = $props()

  const zoom = useZoom()
  const m = useMessages()
</script>

<Toolbar.Button
  class={['ink-zoom-out', className]}
  data-ink-zoom-out=""
  aria-label={m.current.toolbar.zoomOut}
  title={m.current.toolbar.zoomOut}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    if (!e.defaultPrevented) zoom.zoomOut()
  }}
>
  {#if children}{@render children()}{:else}<InkIcon icon={ZoomOut} />{/if}
</Toolbar.Button>
