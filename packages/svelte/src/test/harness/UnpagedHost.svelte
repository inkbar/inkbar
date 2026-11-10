<script lang="ts">
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'

  /** A host that passes no `page` at all, as most apps do, and only listens for changes. */
  let {
    src,
    assets,
    onPageChange,
  }: {
    src: DocumentSource | null
    assets: PdfAssets
    onPageChange?: ((page: number) => void) | undefined
  } = $props()
</script>

<InkRoot {src} {assets} {onPageChange}>
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 700px; width: 900px">
    <InkViewport />
  </div>
</InkRoot>
