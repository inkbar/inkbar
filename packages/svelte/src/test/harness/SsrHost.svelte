<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'

  import type { PdfAssets } from '@inkbar/core'

  let { assets }: { assets: PdfAssets } = $props()
</script>

<InkRoot src="/doc.pdf" {assets}>
  <p>slot</p>
</InkRoot>
