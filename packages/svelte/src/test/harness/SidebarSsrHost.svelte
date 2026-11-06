<script lang="ts">
  /* A sidebar of two panels inside a root, for the server render; the first holds a list. */
  import { Search, Square } from '@inkbar/icons'

  import InkPanel from '../../lib/components/InkPanel.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkSidebar from '../../lib/components/InkSidebar.svelte'
  import InkThumbnail from '../../lib/components/InkThumbnail.svelte'
  import InkThumbnails from '../../lib/components/InkThumbnails.svelte'

  import type { PdfAssets } from '@inkbar/core'
  import type { SidebarLayout, SidebarOpen } from '@inkbar/core/dom'

  let {
    assets,
    layout,
    open,
  }: { assets: PdfAssets; layout: SidebarLayout; open?: SidebarOpen | undefined } =
    $props()
</script>

<InkRoot src="/doc.pdf" {assets}>
  <InkSidebar {layout} side="right" {open}>
    <InkPanel id="pages" label="Pages" icon={Square}><InkThumbnails /></InkPanel>
    <InkPanel id="search" label="Search" icon={Search} badge={2}>
      <InkThumbnail page={0} />
    </InkPanel>
  </InkSidebar>
</InkRoot>
