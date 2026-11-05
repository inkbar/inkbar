<script lang="ts">
  /* Search results in a side box, with the find bar over the viewport. */
  import InkFindBar from '../../lib/components/InkFindBar.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkSearchButton from '../../lib/components/InkSearchButton.svelte'
  import InkSearchResults from '../../lib/components/InkSearchResults.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'

  let {
    src,
    assets,
    field = true,
  }: { src: DocumentSource | null; assets: PdfAssets; field?: boolean } = $props()
</script>

<InkRoot {src} {assets} zoom={1}>
  <InkToolbar>
    <InkSearchButton />
  </InkToolbar>
  <div style="display: flex">
    <!-- Test-only box: the list fills its parent's height. -->
    <div style="height: 300px; width: 280px; display: flex; flex-direction: column">
      <InkSearchResults {field} data-testid="results" />
    </div>
    <div style="height: 450px; width: 600px"><InkViewport /></div>
  </div>
  <InkFindBar data-testid="find-bar" />
</InkRoot>
