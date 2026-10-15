<script lang="ts">
  import { ChevronLeft } from '@inkbar/icons'
  import { Toolbar } from 'bits-ui'

  import { usePage } from '../hooks/usePage.svelte.js'

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

  const page = usePage()
</script>

<Toolbar.Button
  class={['ink-prev-page', className]}
  data-ink-prev-page=""
  aria-label="Previous page"
  title="Previous page"
  disabled={page.current <= 0 || !!disabled}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    if (!e.defaultPrevented) page.previous()
  }}
>
  {#if children}{@render children()}{:else}<InkIcon icon={ChevronLeft} />{/if}
</Toolbar.Button>
