<script lang="ts">
  import InkNextPage from '../../lib/components/InkNextPage.svelte'
  import InkNotePopover from '../../lib/components/InkNotePopover.svelte'
  import InkPageCount from '../../lib/components/InkPageCount.svelte'
  import InkPageInput from '../../lib/components/InkPageInput.svelte'
  import InkPrevPage from '../../lib/components/InkPrevPage.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkSuggestionCard from '../../lib/components/InkSuggestionCard.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkToolButton from '../../lib/components/InkToolButton.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'
  import InkZoomIn from '../../lib/components/InkZoomIn.svelte'
  import InkZoomOut from '../../lib/components/InkZoomOut.svelte'
  import InkZoomSelect from '../../lib/components/InkZoomSelect.svelte'

  import type { PdfAssets } from '@inkbar/core'

  let { assets }: { assets: PdfAssets } = $props()
</script>

<InkRoot src="/doc.pdf" {assets}>
  <p>slot</p>
  <InkToolbar>
    <InkToolButton tool="highlight" />
  </InkToolbar>
  <InkViewport />
  <InkToolbar label="Page and zoom">
    <InkPrevPage />
    <InkPageInput />
    <InkPageCount />
    <InkNextPage />
    <InkZoomOut />
    <InkZoomSelect />
    <InkZoomIn />
  </InkToolbar>
  <InkNotePopover />
  <InkSuggestionCard />
</InkRoot>
