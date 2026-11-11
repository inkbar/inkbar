<script lang="ts">
  /* A sidebar of one panel for the server render: in a root, or on its own with a store. */
  import InkPanel from '../../lib/components/InkPanel.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkSidebar from '../../lib/components/InkSidebar.svelte'

  import type { InkStorage, PdfAssets } from '@inkbar/core'

  let {
    assets,
    root = false,
    storage,
    width,
    minDocumentWidth,
    handleLabel,
  }: {
    assets: PdfAssets
    root?: boolean
    storage?: InkStorage | undefined
    width?: number | undefined
    /** InkRoot's, with `root`. */
    minDocumentWidth?: number | undefined
    handleLabel?: string | undefined
  } = $props()
</script>

{#snippet sidebar()}
  <InkSidebar layout="rail" {storage} {width} {handleLabel}>
    <InkPanel id="pages" label="Pages"><p>A</p></InkPanel>
  </InkSidebar>
{/snippet}

{#if root}
  <InkRoot src="/doc.pdf" {assets} {minDocumentWidth}>{@render sidebar()}</InkRoot>
{:else}
  {@render sidebar()}
{/if}
