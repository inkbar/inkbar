<script lang="ts">
  import { untrack } from 'svelte'

  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'
  import type { ZoomValue } from '@inkbar/core/dom'

  /**
   * A host that binds `zoom` and `page`: the viewport's own changes land in its state. With
   * `withhold`, zoom goes through a function binding whose setter records the reported value
   * and never applies it.
   */
  let {
    src,
    assets,
    initialZoom = 1,
    withhold = false,
    onWithheld,
  }: {
    src: DocumentSource | null
    assets: PdfAssets
    initialZoom?: ZoomValue
    withhold?: boolean
    onWithheld?: ((z: ZoomValue | undefined) => void) | undefined
  } = $props()

  let zoom = $state<ZoomValue>(untrack(() => initialZoom))
  let page = $state(0)
</script>

{#snippet viewport()}
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 700px; width: 900px">
    <InkViewport />
  </div>
{/snippet}

<div>
  <output data-testid="bound-zoom">{zoom}</output>
  <output data-testid="bound-page">{page}</output>
  <button type="button" data-testid="set-zoom-2" onclick={() => (zoom = 2)}>Zoom 2</button
  >
  <button type="button" data-testid="set-zoom-10" onclick={() => (zoom = 10)}
    >Zoom 10</button
  >
  {#if withhold}
    <InkRoot
      {src}
      {assets}
      bind:zoom={() => zoom, (z: ZoomValue | undefined) => onWithheld?.(z)}
      bind:page
    >
      {@render viewport()}
    </InkRoot>
  {:else}
    <InkRoot {src} {assets} bind:zoom bind:page>
      {@render viewport()}
    </InkRoot>
  {/if}
</div>
