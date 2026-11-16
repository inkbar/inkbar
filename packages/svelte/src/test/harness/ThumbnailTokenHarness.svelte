<script lang="ts">
  /* One thumbnail with no width, in a box that sets `--ink-thumbnail-width` to `token`. */
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkThumbnail from '../../lib/components/InkThumbnail.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'

  let {
    src,
    assets,
    token,
    width,
  }: {
    src: DocumentSource | null
    assets: PdfAssets
    token?: string | undefined
    width?: number | undefined
  } = $props()
</script>

<InkRoot {src} {assets} zoom={1}>
  <div style:--ink-thumbnail-width={token}>
    <InkThumbnail page={0} {width} data-testid="thumbnail" />
  </div>
</InkRoot>
