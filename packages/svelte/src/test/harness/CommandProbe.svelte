<script lang="ts">
  import { untrack } from 'svelte'

  import { useCommand } from '../../lib/hooks/useCommand.svelte.js'

  let { id }: { id: string } = $props()

  useCommand(untrack(() => id))
</script>
