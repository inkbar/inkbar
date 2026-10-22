<script lang="ts">
  import InkFindBar from '../../lib/components/InkFindBar.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkSearchButton from '../../lib/components/InkSearchButton.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import SearchProbe from './SearchProbe.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'

  let {
    src,
    assets,
    withBar = true,
  }: { src: DocumentSource | null; assets: PdfAssets; withBar?: boolean } = $props()
</script>

<button type="button" data-testid="outside">Outside</button>
<InkRoot {src} {assets} zoom={1}>
  <InkToolbar>
    <InkSearchButton />
  </InkToolbar>
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 600px; width: 900px">
    <InkViewport />
  </div>
  {#if withBar}<InkFindBar />{/if}
  <SearchProbe />
</InkRoot>
