<script lang="ts">
  import { setInkContext, type InkContext } from '../../lib/context.js'
  import { useToolStyle } from '../../lib/hooks/useToolStyle.svelte.js'

  // Provides a bare context and hands the hook's result out, for a server-side hook test.
  let {
    context,
    onApi,
  }: {
    context: Pick<InkContext, 'toolStyle'>
    onApi: (api: ReturnType<typeof useToolStyle>) => void
  } = $props()

  // svelte-ignore state_referenced_locally
  setInkContext(context as InkContext, () => null)
  // svelte-ignore state_referenced_locally
  onApi(useToolStyle())
</script>
