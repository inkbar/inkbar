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
    <!-- Its own label must win over these. -->
    <InkSearchButton aria-label="Search the PDF" title="Search the PDF" />
  </InkToolbar>
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 600px; width: 900px">
    <InkViewport />
  </div>
  <!-- Where the bar is written: it moves to the viewport root and leaves this empty. -->
  <div data-testid="bar-here">
    {#if withBar}<InkFindBar />{/if}
  </div>
  <SearchProbe />
</InkRoot>
