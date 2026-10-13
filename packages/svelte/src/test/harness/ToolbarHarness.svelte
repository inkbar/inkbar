<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'
  import DefaultToolbar from '../../lib/compositions/DefaultToolbar.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'
  import type { ToolId } from '@inkbar/core/dom'

  let {
    src,
    assets,
    onToolChange,
  }: {
    src: DocumentSource
    assets: PdfAssets
    onToolChange?: ((t: ToolId) => void) | undefined
  } = $props()
</script>

<InkRoot {src} {assets} zoom={1} {onToolChange}>
  <DefaultToolbar />
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 600px; width: 900px">
    <InkViewport />
  </div>
</InkRoot>
