<script lang="ts">
  import { ChevronRight } from '@inkbar/icons'
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
  class={['ink-next-page', className]}
  data-ink-next-page=""
  aria-label="Next page"
  title="Next page"
  disabled={page.current >= page.count - 1 || !!disabled}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    if (!e.defaultPrevented) page.next()
  }}
>
  {#if children}{@render children()}{:else}<InkIcon icon={ChevronRight} />{/if}
</Toolbar.Button>
