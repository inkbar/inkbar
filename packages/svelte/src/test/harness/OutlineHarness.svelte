<script lang="ts">
  /*
   * An outline panel beside the viewport, with Back and Forward, the current page, a button that
   * opens another document in the same root, and one that removes the outline.
   */
  import InkBack from '../../lib/components/InkBack.svelte'
  import InkForward from '../../lib/components/InkForward.svelte'
  import InkOutline from '../../lib/components/InkOutline.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'

  import PageProbe from './PageProbe.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'

  let {
    src,
    otherSrc = null,
    assets,
    emptyText,
    slotted = false,
  }: {
    src: DocumentSource | null
    /** What the "Open other" button switches to. */
    otherSrc?: DocumentSource | null
    assets: PdfAssets
    emptyText?: string | undefined
    slotted?: boolean
  } = $props()

  // svelte-ignore state_referenced_locally
  let source = $state<DocumentSource | null>(src)
  let withOutline = $state(true)
</script>

<InkRoot src={source} {assets} zoom={1}>
  <InkToolbar>
    <InkBack data-testid="back" />
    <InkForward data-testid="forward" />
  </InkToolbar>
  <button type="button" data-testid="open-other" onclick={() => (source = otherSrc)}>
    Open other
  </button>
  <button type="button" data-testid="open-first" onclick={() => (source = src)}>
    Open first
  </button>
  <button
    type="button"
    data-testid="toggle-outline"
    onclick={() => (withOutline = !withOutline)}
  >
    Toggle outline
  </button>
  <PageProbe />
  <div style="display: flex">
    <!-- Test-only box: the outline fills its parent's height. -->
    <div style="height: 450px; width: 240px">
      {#if withOutline}
        {#if slotted}
          <InkOutline data-testid="outline" {emptyText}>
            {#snippet item(item, { current, expanded })}
              <b
                class="harness-title"
                data-current={String(current)}
                data-expanded={String(expanded)}>{item.title}</b
              >
            {/snippet}
          </InkOutline>
        {:else}
          <InkOutline data-testid="outline" {emptyText} />
        {/if}
      {/if}
    </div>
    <div style="height: 450px; width: 600px"><InkViewport /></div>
  </div>
</InkRoot>
