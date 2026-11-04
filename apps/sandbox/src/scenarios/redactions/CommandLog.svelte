<script lang="ts">
  /* Logs each result of the Suggest command. It sits inside InkRoot to reach the command. */
  import { useCommand } from '@inkbar/svelte'

  import type { Log } from '../../frameworks/types'

  let { log }: { log: Log } = $props()

  const command = useCommand('sandbox.suggest')
  $effect(() => {
    if (command.status) log('command', command.status)
  })
</script>
