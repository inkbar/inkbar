<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'

  import HookProbe from './HookProbe.svelte'

  import type { PdfAssets } from '@inkbar/core'

  let { src, assets }: { src: string; assets: PdfAssets } = $props()
</script>

<InkRoot {src} {assets}>
  <HookProbe />
</InkRoot>
