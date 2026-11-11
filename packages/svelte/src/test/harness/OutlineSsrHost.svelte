<script lang="ts">
  import InkBack from '../../lib/components/InkBack.svelte'
  import InkForward from '../../lib/components/InkForward.svelte'
  import InkOutline from '../../lib/components/InkOutline.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'

  import type { PdfAssets } from '@inkbar/core'

  let { assets }: { assets: PdfAssets } = $props()
</script>

<InkRoot src="/doc.pdf" {assets}>
  <InkOutline />
  <InkToolbar>
    <InkBack />
    <InkForward />
  </InkToolbar>
</InkRoot>
