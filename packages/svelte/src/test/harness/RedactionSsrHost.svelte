<script lang="ts">
  import InkApplyRedactions from '../../lib/components/InkApplyRedactions.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'

  import RedactionProbe from './RedactionProbe.svelte'

  import type { EngineLoader, PdfAssets } from '@inkbar/core'

  let { assets, engine }: { assets: PdfAssets; engine: EngineLoader } = $props()
</script>

<InkRoot src="/doc.pdf" {assets} {engine}>
  <InkToolbar>
    <InkApplyRedactions />
  </InkToolbar>
  <RedactionProbe />
</InkRoot>
