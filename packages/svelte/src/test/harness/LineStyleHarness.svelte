<script lang="ts">
  import InkLineStyleMenu from '../../lib/components/InkLineStyleMenu.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import LineStyleControls from './LineStyleControls.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'

  let {
    src,
    assets,
    trigger = {},
  }: {
    src: DocumentSource
    assets: PdfAssets
    /** Props a host passes the trigger. */
    trigger?: Record<string, unknown>
  } = $props()
</script>

<InkRoot {src} {assets} zoom={1}>
  <InkToolbar><InkLineStyleMenu {...trigger} /></InkToolbar>
  <div style="height: 600px; width: 900px"><InkViewport /></div>
  <LineStyleControls />
</InkRoot>
