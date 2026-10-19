<script lang="ts">
  import { setInkContext, type InkContext } from '../../lib/context.js'
  import { useToolStyle } from '../../lib/hooks/useToolStyle.svelte.js'

  import type { StyleGroup } from '@inkbar/core'

  // Provides a bare context and hands the hook's result out, for a server-side hook test.
  let {
    context,
    onApi,
    group,
  }: {
    context: Pick<InkContext, 'toolStyle'>
    onApi: (api: ReturnType<typeof useToolStyle>) => void
    group?: StyleGroup | undefined
  } = $props()

  // svelte-ignore state_referenced_locally
  setInkContext(context as InkContext, () => null)
  // svelte-ignore state_referenced_locally
  onApi(useToolStyle(group))
</script>
