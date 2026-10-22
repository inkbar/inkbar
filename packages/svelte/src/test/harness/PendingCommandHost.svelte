<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'

  import CommandProbe from './CommandProbe.svelte'

  import type { PdfAssets } from '@inkbar/core'

  let { assets }: { assets: PdfAssets } = $props()
</script>

<InkRoot src={null} {assets}>
  <CommandProbe id="sandbox.any" />
</InkRoot>
