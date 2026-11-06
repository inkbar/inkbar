<script lang="ts">
  /* A record list of the suggestions plugin beside the viewport, with undo and a hooks probe. */
  import { untrack } from 'svelte'

  import InkRecordList from '../../lib/components/InkRecordList.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkUndo from '../../lib/components/InkUndo.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import RecordsProbe from './RecordsProbe.svelte'
  import { suggestions, suggestionsPlugin } from './suggestions-plugin.js'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'

  let {
    src,
    assets,
    initial,
    customEmpty = false,
  }: {
    src: DocumentSource | null
    assets: PdfAssets
    /** How many open suggestions the document starts with. */
    initial: number
    /** Render a custom `empty` snippet. */
    customEmpty?: boolean
  } = $props()

  // Plugins hold functions, built here once so a test passes only plain props.
  const plugins = [suggestionsPlugin({ initial: suggestions(untrack(() => initial)) })]
  let count = $state<number | undefined>()
  let withList = $state(true)
</script>

<InkRoot {src} {assets} zoom={1} {plugins}>
  <InkToolbar>
    <InkUndo />
  </InkToolbar>
  <output data-testid="count">{count ?? 'none'}</output>
  <button type="button" data-testid="toggle-list" onclick={() => (withList = !withList)}>
    Toggle list
  </button>
  <RecordsProbe />
  <div style="display: flex">
    <!-- Test-only box: the list fills its parent's height. -->
    <div style="height: 300px; width: 280px; display: flex; flex-direction: column">
      {#if withList}
        {#if customEmpty}
          <InkRecordList records="sandbox.suggestions" data-testid="list" bind:count>
            {#snippet empty()}
              <span data-testid="custom-empty">All caught up</span>
            {/snippet}
          </InkRecordList>
        {:else}
          <InkRecordList records="sandbox.suggestions" data-testid="list" bind:count />
        {/if}
      {/if}
    </div>
    <div style="height: 450px; width: 600px"><InkViewport /></div>
  </div>
</InkRoot>
