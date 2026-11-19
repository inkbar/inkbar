<script lang="ts">
  /* Hands the checks InkRoot's own apply, from `useRedaction`. */
  import { useRedaction } from '@inkbar/svelte'

  import type { FrontProps } from '../front.ts'

  let { onApply }: Pick<FrontProps, 'onApply'> = $props()

  const redaction = useRedaction()
  $effect.pre(() => {
    onApply(() => redaction.apply())
  })
</script>
