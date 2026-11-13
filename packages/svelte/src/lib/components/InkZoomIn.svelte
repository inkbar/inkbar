<script lang="ts">
  import { ZoomIn } from '@inkbar/icons'
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
  class={['ink-zoom-in', className]}
  data-ink-zoom-in=""
  aria-label={m.current.toolbar.zoomIn}
  title={m.current.toolbar.zoomIn}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    if (!e.defaultPrevented) zoom.zoomIn()
  }}
>
  {#if children}{@render children()}{:else}<InkIcon icon={ZoomIn} />{/if}
</Toolbar.Button>
