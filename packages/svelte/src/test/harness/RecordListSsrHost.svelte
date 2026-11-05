<script lang="ts">
  /* A record list and the search results inside a root, for the server render. */
  import InkRecordList from '../../lib/components/InkRecordList.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkSearchResults from '../../lib/components/InkSearchResults.svelte'

  import type { PdfAssets } from '@inkbar/core'

  let { assets }: { assets: PdfAssets } = $props()
</script>

<InkRoot src="/doc.pdf" {assets}>
  <InkRecordList records="sandbox.suggestions" />
  <InkSearchResults />
</InkRoot>
