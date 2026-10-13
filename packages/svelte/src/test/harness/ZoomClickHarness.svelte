<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'
  import InkZoomIn from '../../lib/components/InkZoomIn.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'

  /** A zoom-in button carrying a host onclick, and a toolbar rendered through `child`. */
  let {
    src,
    assets,
    onHostClick,
  }: { src: DocumentSource; assets: PdfAssets; onHostClick: () => void } = $props()
</script>

<InkRoot {src} {assets} zoom={1}>
  <InkToolbar>
    {#snippet child({ props })}
      <nav {...props} class="host-toolbar">
        <InkZoomIn onclick={onHostClick} />
      </nav>
    {/snippet}
  </InkToolbar>
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 600px; width: 900px">
    <InkViewport />
  </div>
</InkRoot>
