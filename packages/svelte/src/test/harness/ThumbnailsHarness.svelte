<script lang="ts">
  /*
   * A thumbnail list beside the viewport, and a dialog holding one thumbnail, as a "Remove pages"
   * dialog would.
   */
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkThumbnail from '../../lib/components/InkThumbnail.svelte'
  import InkThumbnails from '../../lib/components/InkThumbnails.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import PageProbe from './PageProbe.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'

  let {
    src,
    assets,
    pages,
    width,
  }: {
    src: DocumentSource | null
    assets: PdfAssets
    pages?: number[] | undefined
    width?: number | undefined
  } = $props()

  let dialog = $state<HTMLDialogElement | null>(null)
  let withList = $state(true)
</script>

<InkRoot {src} {assets} zoom={1}>
  <button type="button" data-testid="open-dialog" onclick={() => dialog?.showModal()}>
    Remove pages
  </button>
  <button type="button" data-testid="toggle-list" onclick={() => (withList = !withList)}>
    Toggle list
  </button>
  <PageProbe />
  <div style="display: flex">
    <!-- Test-only box: the list fills its parent's height; 152px fits 120px thumbnails. -->
    <div style="height: 600px; width: 152px">
      {#if withList}
        <InkThumbnails {pages} {width} data-testid="list">
          {#snippet item({ page, current })}
            <span class="harness-item" data-page={page} data-current={current}
              >{current ? 'here' : ''}</span
            >
          {/snippet}
        </InkThumbnails>
      {/if}
    </div>
    <div style="height: 450px; width: 600px"><InkViewport /></div>
  </div>
  <dialog bind:this={dialog} aria-label="Remove pages">
    <InkThumbnail page={1} width={80} data-testid="dialog-thumbnail" />
    <button type="button" onclick={() => dialog?.close()}>Close</button>
  </dialog>
</InkRoot>
