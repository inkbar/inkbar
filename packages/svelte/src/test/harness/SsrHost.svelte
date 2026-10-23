<script lang="ts">
  import InkCommand from '../../lib/components/InkCommand.svelte'
  import InkFindBar from '../../lib/components/InkFindBar.svelte'
  import InkNextPage from '../../lib/components/InkNextPage.svelte'
  import InkPageCount from '../../lib/components/InkPageCount.svelte'
  import InkPageInput from '../../lib/components/InkPageInput.svelte'
  import InkPrevPage from '../../lib/components/InkPrevPage.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'
  import InkSearchButton from '../../lib/components/InkSearchButton.svelte'
  import InkThreadPopover from '../../lib/components/InkThreadPopover.svelte'
  import InkToolbar from '../../lib/components/InkToolbar.svelte'
  import InkToolButton from '../../lib/components/InkToolButton.svelte'
  import InkViewport from '../../lib/components/InkViewport.svelte'
  import InkZoomIn from '../../lib/components/InkZoomIn.svelte'
  import InkZoomOut from '../../lib/components/InkZoomOut.svelte'
  import InkZoomSelect from '../../lib/components/InkZoomSelect.svelte'

  import FormProbe from './FormProbe.svelte'

  import type { PdfAssets } from '@inkbar/core'
  import type { InkPlugin } from '@inkbar/core/dom'

  let { assets, plugins }: { assets: PdfAssets; plugins?: InkPlugin[] | undefined } =
    $props()
</script>

<InkRoot src="/doc.pdf" {assets} {plugins} fields={{}} formHighlight={false}>
  <p>slot</p>
  <InkToolbar>
    <InkToolButton tool="highlight" />
    <InkCommand id="sandbox.ping" />
    <InkSearchButton />
  </InkToolbar>
  <!-- With the field menu and the form alert it mounts, and a form that is still empty. -->
  <InkViewport />
  <InkFindBar />
  <FormProbe />
  <InkToolbar label="Page and zoom">
    <InkPrevPage />
    <InkPageInput />
    <InkPageCount />
    <InkNextPage />
    <InkZoomOut />
    <InkZoomSelect />
    <InkZoomIn />
  </InkToolbar>
  <InkThreadPopover />
</InkRoot>
