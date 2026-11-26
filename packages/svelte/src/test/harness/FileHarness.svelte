<script lang="ts">
  /* Download and print buttons in a toolbar over a document. */
  import InkDownloadButton from '../../lib/components/InkDownloadButton.svelte'
  import InkPrintButton from '../../lib/components/InkPrintButton.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import type { DocumentSource, InkError, PdfAssets } from '@inkbar/core'

  let {
    src,
    assets,
    filename,
    onError,
  }: {
    src: DocumentSource
    assets: PdfAssets
    filename?: string
    onError?: (error: InkError) => void
  } = $props()
</script>

<InkRoot {src} {assets} zoom={1} {onError}>
  <InkToolbar>
    <InkDownloadButton {filename} />
    <InkPrintButton />
  </InkToolbar>
  <!-- Test-only box: the scroll container needs a bounded height. -->
  <div style="height: 400px; width: 600px"><InkViewport /></div>
</InkRoot>
