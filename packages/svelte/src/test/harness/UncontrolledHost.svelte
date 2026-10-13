<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import HookProbe from './HookProbe.svelte'

  import type { PdfAssets } from '@inkbar/core'

  let {
    src,
    assets,
    withViewport = false,
  }: { src: string; assets: PdfAssets; withViewport?: boolean } = $props()
</script>

<InkRoot {src} {assets} zoom={withViewport ? 1 : undefined}>
  <HookProbe />
  {#if withViewport}
    <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
    <div style="height: 600px; width: 900px">
      <InkViewport />
    </div>
  {/if}
</InkRoot>
