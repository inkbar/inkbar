<script lang="ts">
  import { untrack } from 'svelte'

  import InkCommand from '../../lib/components/InkCommand.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import { useCommand } from '../../lib/hooks/useCommand.svelte.js'

  let { id }: { id: string } = $props()

  const commandId = untrack(() => id)
  const command = useCommand(commandId)
  /** Every value `enabled` takes, from the first render on. */
  const seen: boolean[] = $state([])
  $effect.pre(() => {
    const value = command.enabled
    untrack(() => {
      if (seen.at(-1) !== value) seen.push(value)
    })
  })
</script>

<InkToolbar><InkCommand id={commandId} /></InkToolbar>
<output data-testid="seen">{seen.join(',')}</output>
