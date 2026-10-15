<script lang="ts">
  /* Uncontrolled: the document keeps its own annotations and undo history. */
  import {
    DefaultToolbar,
    InkNotePopover,
    InkRoot,
    InkSuggestionCard,
    InkViewport,
  } from '@inkbar/svelte'
  import '@inkbar/theme/theme.css'
  import { assets } from 'virtual:inkbar-assets'

  import Actions from './Actions.svelte'

  import type { DocumentSource } from '@inkbar/core'

  let { source }: { source: DocumentSource } = $props()
</script>

<InkRoot src={source} {assets} class="demo-root">
  <DefaultToolbar>
    <Actions />
  </DefaultToolbar>
  <InkViewport />
  <InkNotePopover />
  <InkSuggestionCard />
</InkRoot>
