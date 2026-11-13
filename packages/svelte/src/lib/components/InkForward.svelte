<script lang="ts">
  import { ArrowRight } from '@inkbar/icons'
  import { Toolbar } from 'bits-ui'

  import { useInkContext } from '../context.js'
  import { useMessages } from '../messages.js'
  import { useReadable } from '../use-readable.svelte.js'

  import { asBitsProps } from './child-snippet.js'
  import InkIcon from './InkIcon.svelte'

  import type { InkPageButtonProps } from './page-button.js'

  let {
    class: className,
    children,
    child,
    disabled,
    onclick,
    ...rest
  }: InkPageButtonProps = $props()

  const ctx = useInkContext('InkForward')
  const can = useReadable(() => ctx.navigation?.canGoForward, false)
  const m = useMessages()
</script>

<Toolbar.Button
  class={['ink-forward', className]}
  data-ink-forward=""
  aria-label={m.current.toolbar.forward}
  title={m.current.toolbar.forward}
  disabled={!can.current || !!disabled}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    if (!e.defaultPrevented) ctx.navigation?.forward()
  }}
>
  {#if children}{@render children()}{:else}<InkIcon icon={ArrowRight} />{/if}
</Toolbar.Button>
