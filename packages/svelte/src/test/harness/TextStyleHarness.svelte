<script lang="ts">
  import { allTools } from '@inkbar/core/dom'

  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkTextStyleMenu from '../../lib/components/InkTextStyleMenu.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import TextStyleControls from './TextStyleControls.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'

  let {
    src,
    assets,
    fonts,
    trigger = {},
  }: {
    src: DocumentSource
    assets: PdfAssets
    fonts?: string[]
    /** Props a host passes the trigger. */
    trigger?: Record<string, unknown>
  } = $props()
  const tools = allTools()
</script>

<InkRoot {src} {assets} zoom={1} {fonts} {tools}>
  <InkToolbar><InkTextStyleMenu {...trigger} /></InkToolbar>
  <div style="height: 600px; width: 900px"><InkViewport /></div>
  <TextStyleControls />
</InkRoot>
