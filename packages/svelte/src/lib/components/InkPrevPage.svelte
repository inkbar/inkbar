<script lang="ts">
  import { ChevronLeft } from '@inkbar/icons'
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
  class={['ink-prev-page', className]}
  data-ink-prev-page=""
  aria-label={m.current.toolbar.previousPage}
  title={m.current.toolbar.previousPage}
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
