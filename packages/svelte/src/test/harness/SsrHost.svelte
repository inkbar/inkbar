<script lang="ts">
  import InkNotePopover from '../../lib/components/InkNotePopover.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkSuggestionCard from '../../lib/components/InkSuggestionCard.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'
  import DefaultToolbar from '../../lib/compositions/DefaultToolbar.svelte'

  import type { PdfAssets } from '@inkbar/core'

  let { assets }: { assets: PdfAssets } = $props()
</script>

<InkRoot src="/doc.pdf" {assets}>
  <p>slot</p>
  <DefaultToolbar />
  <InkViewport />
  <InkNotePopover />
  <InkSuggestionCard />
</InkRoot>
