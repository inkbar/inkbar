<script lang="ts">
  import { allTools } from '@inkbar/core/dom'

  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkSignatureMenu from '../../lib/components/InkSignatureMenu.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkToolButton from '../../lib/components/InkToolButton.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import HookProbe from './HookProbe.svelte'
  import SignatureOptionsProbe from './SignatureOptionsProbe.svelte'

  import type { DocumentSource, PdfAssets, SignatureStore } from '@inkbar/core'

  let {
    src,
    assets,
    store,
    fonts,
  }: {
    src: DocumentSource
    assets: PdfAssets
    store: SignatureStore
    fonts?: string[] | undefined
  } = $props()
  const tools = allTools()
</script>

<InkRoot {src} {assets} zoom={1} signatures={store} signatureFonts={fonts} {tools}>
  <InkToolbar>
    <InkToolButton tool="select" />
    <InkSignatureMenu />
  </InkToolbar>
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 600px; width: 900px">
    <InkViewport />
  </div>
  <SignatureOptionsProbe />
  <HookProbe />
</InkRoot>
