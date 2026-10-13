<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'

  import type { Annotation, PdfAssets } from '@inkbar/core'

  /** A host that passes `annotations` without `bind:` and only listens. */
  let {
    src,
    assets,
    onProposal,
  }: {
    src: string
    assets: PdfAssets
    onProposal?: ((next: Annotation[]) => void) | undefined
  } = $props()

  let list = $state.raw<Annotation[]>([])
  let heard = $state(0)
</script>

<InkRoot
  {src}
  {assets}
  annotations={list}
  onAnnotationsChange={(next: Annotation[]) => {
    heard += 1
    onProposal?.(next)
  }}
>
  <output data-testid="host-count">{list.length}</output>
  <output data-testid="heard">{heard}</output>
  <button type="button" data-testid="reset" onclick={() => (list = [])}>reset</button>
</InkRoot>
