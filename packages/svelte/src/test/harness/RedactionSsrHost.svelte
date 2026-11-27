<script lang="ts">
  import InkApplyRedactions from '../../lib/components/InkApplyRedactions.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'

  import RedactionProbe from './RedactionProbe.svelte'

  import type { PdfAssets } from '@inkbar/core'

  let { assets }: { assets: PdfAssets } = $props()
</script>

<InkRoot src="/doc.pdf" {assets}>
  <InkToolbar>
    <InkApplyRedactions />
  </InkToolbar>
  <RedactionProbe />
</InkRoot>
