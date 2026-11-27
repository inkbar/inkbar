<script lang="ts">
  /*
   * Download and Print write the session into the PDF: each annotation as a standard PDF
   * annotation other programs can read, and changed form values. With no changes you
   * get the file as it was opened. Open the saved file here and Inkbar's own
   * annotations come back ready to edit.
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
  onError={(error) => log('onError', { code: error.code })}
  onToolChange={(tool) => log('onToolChange', tool)}
  class="scenario-root"
>
  <InkToolbar class="scenario-toolbar">
    <div class="scenario-group" role="group" aria-label={labels.tools}>
      <InkHighlightMenu />
      <InkToolButton tool="select-text" />
      <InkToolButton tool="select" />
      <InkToolButton tool="note" />
    </div>
    <div class="scenario-group" role="group" aria-label={labels.history}>
      <InkUndo />
      <InkRedo />
    </div>
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
