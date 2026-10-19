<script lang="ts">
  import InkColorMenu from '../../lib/components/InkColorMenu.svelte'
  import InkLineStyleMenu from '../../lib/components/InkLineStyleMenu.svelte'
  import InkNextPage from '../../lib/components/InkNextPage.svelte'
  import InkPageCount from '../../lib/components/InkPageCount.svelte'
  import InkPageInput from '../../lib/components/InkPageInput.svelte'
  import InkPrevPage from '../../lib/components/InkPrevPage.svelte'
  import InkRedo from '../../lib/components/InkRedo.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkShapeMenu from '../../lib/components/InkShapeMenu.svelte'
  import InkTextStyleMenu from '../../lib/components/InkTextStyleMenu.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkToolbarSeparator from '../../lib/components/InkToolbarSeparator.svelte'
  import InkToolButton from '../../lib/components/InkToolButton.svelte'
  import InkUndo from '../../lib/components/InkUndo.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'
  import InkZoomIn from '../../lib/components/InkZoomIn.svelte'
  import InkZoomOut from '../../lib/components/InkZoomOut.svelte'
  import InkZoomSelect from '../../lib/components/InkZoomSelect.svelte'

  import HookProbe from './HookProbe.svelte'

  import type { Annotation, DocumentSource, PdfAssets } from '@inkbar/core'
  import type { ToolId } from '@inkbar/core/dom'

  let {
    src,
    assets,
    onToolChange,
    controlled = false,
  }: {
    src: DocumentSource
    assets: PdfAssets
    onToolChange?: ((t: ToolId) => void) | undefined
    /** The host owns the annotation list, with the root's snapshot history. */
    controlled?: boolean
  } = $props()

  let list = $state<Annotation[]>([])
</script>

{#if controlled}
  <InkRoot {src} {assets} zoom={1} {onToolChange} bind:annotations={list} history>
    {@render content()}
  </InkRoot>
{:else}
  <InkRoot {src} {assets} zoom={1} {onToolChange}>
    {@render content()}
  </InkRoot>
{/if}

{#snippet content()}
  <InkToolbar>
    <InkToolButton tool="select-text" />
    <InkToolButton tool="select" />
    <InkToolButton tool="highlight" />
    <InkToolButton tool="redact-area" />
    <InkToolButton tool="sketch" />
    <InkToolButton tool="draw" />
    <InkToolButton tool="note" />
    <InkShapeMenu />
    <InkToolButton tool="freetext" />
    <InkToolbarSeparator />
    <InkLineStyleMenu />
    <InkColorMenu property="border" />
    <InkColorMenu property="fill" />
    <InkTextStyleMenu />
    <InkUndo />
    <InkRedo />
  </InkToolbar>
  <!-- Test-only box: the scroll container needs a bounded height to scroll. -->
  <div style="height: 600px; width: 900px">
    <InkViewport />
  </div>
  <InkToolbar label="Page and zoom">
    <InkPrevPage />
    <InkPageInput />
    <InkPageCount />
    <InkNextPage />
    <InkZoomOut />
    <InkZoomSelect />
    <InkZoomIn />
  </InkToolbar>
  <HookProbe />
{/snippet}
