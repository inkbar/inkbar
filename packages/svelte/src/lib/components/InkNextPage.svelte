<script lang="ts">
  import { ChevronRight } from '@inkbar/icons'
  import { Toolbar } from 'bits-ui'

  import { usePage } from '../hooks/usePage.svelte.js'
  import { useMessages } from '../messages.js'

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
  const m = useMessages()
</script>

<Toolbar.Button
  class={['ink-next-page', className]}
  data-ink-next-page=""
  aria-label={m.current.toolbar.nextPage}
  title={m.current.toolbar.nextPage}
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
