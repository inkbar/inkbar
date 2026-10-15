<script lang="ts">
  import { Redo2 } from '@inkbar/icons'
  import { Toolbar } from 'bits-ui'

  import { useHistory } from '../hooks/useHistory.svelte.js'

  import { asBitsProps } from './child-snippet.js'
  import InkIcon from './InkIcon.svelte'

  import type { InkHistoryButtonProps } from './history-button.js'

  let {
    class: className,
    children,
    child,
    disabled,
    onclick,
    ...rest
  }: InkHistoryButtonProps = $props()

  const history = useHistory()
</script>

<Toolbar.Button
  class={['ink-redo', className]}
  data-ink-redo=""
  aria-label="Redo"
  title="Redo"
  disabled={!history.canRedo || !!disabled}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    if (!e.defaultPrevented) history.redo()
  }}
>
  {#if children}{@render children()}{:else}<InkIcon icon={Redo2} />{/if}
</Toolbar.Button>
