<script lang="ts">
  import InkColorMenu from '../../lib/components/InkColorMenu.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import ColorMenuControls from './ColorMenuControls.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'

  let {
    src,
    assets,
    trigger = {},
  }: {
    src: DocumentSource
    assets: PdfAssets
    /** Props a host passes the border trigger. */
    trigger?: Record<string, unknown>
  } = $props()
</script>

<InkRoot {src} {assets} zoom={1}>
  <InkToolbar>
    <InkColorMenu property="border" {...trigger} />
    <InkColorMenu property="fill" />
    <InkColorMenu property="textColor" />
  </InkToolbar>
  <div style="height: 600px; width: 900px"><InkViewport /></div>
  <ColorMenuControls />
</InkRoot>
