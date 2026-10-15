<script lang="ts">
  import { Undo2 } from '@inkbar/icons'
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
  class={['ink-undo', className]}
  data-ink-undo=""
  aria-label="Undo"
  title="Undo"
  disabled={!history.canUndo || !!disabled}
  {...child ? { child } : {}}
  {...asBitsProps(rest)}
  onclick={(e) => {
    onclick?.(e)
    if (!e.defaultPrevented) history.undo()
  }}
>
  {#if children}{@render children()}{:else}<InkIcon icon={Undo2} />{/if}
</Toolbar.Button>
