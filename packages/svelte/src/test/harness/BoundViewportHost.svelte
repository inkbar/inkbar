<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'
  import type { ZoomValue } from '@inkbar/core/dom'

  /** A host that binds `zoom` and `page`: the viewport's own changes land in its state. */
  let { src, assets }: { src: DocumentSource | null; assets: PdfAssets } = $props()

  let zoom = $state<ZoomValue>(1)
  let page = $state(0)
</script>

<div>
  <output data-testid="bound-zoom">{zoom}</output>
  <output data-testid="bound-page">{page}</output>
  <button type="button" data-testid="set-zoom-2" onclick={() => (zoom = 2)}>Zoom 2</button
  >
  <InkRoot {src} {assets} bind:zoom bind:page>
    <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
    <div style="height: 700px; width: 900px">
      <InkViewport />
    </div>
  </InkRoot>
</div>
