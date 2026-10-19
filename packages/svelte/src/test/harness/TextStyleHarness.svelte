<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkTextStyleMenu from '../../lib/components/InkTextStyleMenu.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import TextStyleControls from './TextStyleControls.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'

  let { src, assets }: { src: DocumentSource; assets: PdfAssets } = $props()
</script>

<InkRoot {src} {assets} zoom={1}>
  <InkToolbar><InkTextStyleMenu /></InkToolbar>
  <div style="height: 600px; width: 900px"><InkViewport /></div>
  <TextStyleControls />
</InkRoot>
