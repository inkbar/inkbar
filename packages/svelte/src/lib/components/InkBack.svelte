<script lang="ts">
  import { ArrowLeft } from '@inkbar/icons'
  import { Toolbar } from 'bits-ui'

  import { useInkContext } from '../context.js'
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

  const ctx = useInkContext('InkBack')
  const can = useReadable(() => ctx.navigation?.canGoBack, false)
</script>

<Toolbar.Button
  class={['ink-back', className]}
  data-ink-back=""
  aria-label="Back"
  title="Back"
  disabled={!can.current || !!disabled}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    if (!e.defaultPrevented) ctx.navigation?.back()
  }}
>
  {#if children}{@render children()}{:else}<InkIcon icon={ArrowLeft} />{/if}
</Toolbar.Button>
