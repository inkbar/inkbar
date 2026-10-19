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
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkToolbarSeparator from '../../lib/components/InkToolbarSeparator.svelte'
  import InkToolButton from '../../lib/components/InkToolButton.svelte'
  import InkUndo from '../../lib/components/InkUndo.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'
  import InkZoomIn from '../../lib/components/InkZoomIn.svelte'
  import InkZoomOut from '../../lib/components/InkZoomOut.svelte'
  import InkZoomSelect from '../../lib/components/InkZoomSelect.svelte'

  import HookProbe from './HookProbe.svelte'

  import type { DocumentSource, PdfAssets } from '@inkbar/core'
  import type { ToolId } from '@inkbar/core/dom'

  let {
    src,
    assets,
    onToolChange,
  }: {
    src: DocumentSource
    assets: PdfAssets
    onToolChange?: ((t: ToolId) => void) | undefined
  } = $props()
</script>

<InkRoot {src} {assets} zoom={1} {onToolChange}>
  <InkToolbar>
    <InkToolButton tool="select-text" />
    <InkToolButton tool="select" />
    <InkToolButton tool="highlight" />
    <InkToolButton tool="redact-area" />
    <InkToolButton tool="note" />
    <InkShapeMenu />
    <InkToolbarSeparator />
    <InkLineStyleMenu />
    <InkColorMenu property="border" />
    <InkColorMenu property="fill" />
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
</InkRoot>
