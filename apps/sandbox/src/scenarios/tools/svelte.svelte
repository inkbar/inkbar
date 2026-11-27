<script lang="ts">
  /*
   * Only the tools you import end up in your bundle. This viewer registers highlight and note;
   * every other creation tool stays out, and its button has nothing to switch on. Select text
   * and Select come with every viewer.
   */
  import { highlightTool, noteTool } from '@inkbar/core/dom'
  import {
    InkDownloadButton,
    InkPrintButton,
    InkHighlightMenu,
    InkNextPage,
    InkPageCount,
    InkPageInput,
    InkPrevPage,
    InkRedo,
    InkRoot,
    InkThreadPopover,
    InkIcon,
    InkToolbar,
    InkToolbarButton,
    InkToolButton,
    InkUndo,
    InkViewport,
    InkZoomIn,
    InkZoomOut,
    InkZoomSelect,
  } from '@inkbar/svelte'
  import '@inkbar/theme/theme.css'
  import { assets } from 'virtual:inkbar-assets'

  import { FileUp } from '../../shared/file-up'
  import { storage } from '../../shared/signatures'

  import type { ScenarioProps } from '../../frameworks/types'
  import type { InkDocument } from '@inkbar/core'

  let { source, messages, locale, labels, log, onDocument, openFile }: ScenarioProps =
    $props()

  const tools = [highlightTool(), noteTool()]

  function onReady(doc: InkDocument): void {
    log('onReady', { pages: doc.pages.length })
    onDocument(doc)
  }
</script>

<InkRoot
  src={source}
  {messages}
  {locale}
  {assets}
  {storage}
  {tools}
  {onReady}
  onToolChange={(tool) => log('onToolChange', tool)}
  class="scenario-root"
>
  <InkToolbar class="scenario-toolbar">
    <InkHighlightMenu />
    <div class="scenario-group" role="group" aria-label={labels.tools}>
      <InkToolButton tool="select-text" />
      <InkToolButton tool="select" />
      <InkToolButton tool="note" />
    </div>
    <InkUndo />
    <InkRedo />
    <div class="scenario-group scenario-file" role="group" aria-label={labels.file}>
      <InkToolbarButton
        aria-label={labels.openPdf}
        title={labels.openPdf}
        onclick={openFile}
      >
        <InkIcon icon={FileUp} />
        {labels.open}
      </InkToolbarButton>
      <InkDownloadButton />
      <InkPrintButton />
    </div>
  </InkToolbar>
  <InkViewport />
  <InkToolbar label={labels.pageAndZoom} class="scenario-status-bar">
    <div class="scenario-group" role="group" aria-label={labels.page}>
      <InkPrevPage />
      <InkPageInput />
      <InkPageCount />
      <InkNextPage />
    </div>
    <div class="scenario-group scenario-zoom" role="group" aria-label={labels.zoom}>
      <InkZoomOut />
      <InkZoomSelect />
      <InkZoomIn />
    </div>
  </InkToolbar>
  <InkThreadPopover />
</InkRoot>
