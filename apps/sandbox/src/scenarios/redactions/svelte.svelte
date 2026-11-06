<script lang="ts">
  /*
   * Suggest redactions is a plugin (src/plugin/suggestions.ts). Register it in `plugins` and
   * place its command where you want with InkCommand. Suggest adds the plugin's own records,
   * draws a mark on each and opens a card when you press one. Accept turns a suggestion into a
   * redaction. CommandLog, beside this file, logs each result of the command. Thumbnails of
   * the pages sit in the left sidebar; ReviewSidebar, beside this file, is the right.
   */
  import { allTools, type SidebarOpen } from '@inkbar/core/dom'
  import { Square } from '@inkbar/icons'
  import {
    InkDownloadButton,
    InkPrintButton,
    InkColorMenu,
    InkCommand,
    InkHighlightMenu,
    InkLineStyleMenu,
    InkNextPage,
    InkPageCount,
    InkPanel,
    InkPageInput,
    InkPrevPage,
    InkRedo,
    InkRoot,
    InkShapeMenu,
    InkSidebar,
    InkSignatureMenu,
    InkTextStyleMenu,
    InkThreadPopover,
    InkThumbnails,
    InkIcon,
    InkToolbar,
    InkToolbarButton,
    InkToolbarSeparator,
    InkToolButton,
    InkUndo,
    InkViewport,
    InkZoomIn,
    InkZoomOut,
    InkZoomSelect,
  } from '@inkbar/svelte'
  import '@inkbar/theme/theme.css'
  import { assets } from 'virtual:inkbar-assets'

  import { suggestionsPlugin } from '../../plugin/suggestions'
  import '../../plugin/suggestions.css'
  import { FileUp } from '../../shared/file-up'
  import { signatureFonts, signatures } from '../../shared/signatures'

  import CommandLog from './CommandLog.svelte'
  import ReviewSidebar from './ReviewSidebar.svelte'

  import type { ScenarioProps } from '../../frameworks/types'
  import type { InkDocument } from '@inkbar/core'

  let { source, log, onDocument, openFile }: ScenarioProps = $props()

  const tools = allTools()
  const plugins = [suggestionsPlugin()]

  /** The Pages panel starts closed, leaving the pages the room. */
  let pagesOpen = $state<SidebarOpen>(null)

  function onReady(doc: InkDocument): void {
    log('onReady', { pages: doc.pages.length })
    onDocument(doc)
  }
</script>

<InkRoot
  src={source}
  {assets}
  {tools}
  {plugins}
  {signatures}
  {signatureFonts}
  {onReady}
  onActivate={(id) => log('onActivate', id)}
  class="scenario-root"
>
  <InkToolbar class="scenario-toolbar">
    <InkHighlightMenu />
    <div class="scenario-group" role="group" aria-label="Tools">
      <InkToolButton tool="select-text" />
      <InkToolButton tool="select" />
      <InkToolButton tool="redact-area" />
      <InkToolButton tool="sketch" />
      <InkToolButton tool="draw" />
      <InkShapeMenu />
      <InkToolButton tool="freetext" />
      <InkSignatureMenu />
      <InkToolButton tool="note" />
    </div>
    <InkToolbarSeparator />
    <div class="scenario-group" role="group" aria-label="Style">
      <InkLineStyleMenu />
      <InkColorMenu property="border" />
      <InkColorMenu property="fill" />
      <InkTextStyleMenu />
    </div>
    <InkUndo />
    <InkRedo />
    <div class="scenario-actions" role="group" aria-label="Suggest">
      <InkCommand id="sandbox.suggest" />
    </div>
    <div class="scenario-group scenario-file" role="group" aria-label="File">
      <InkToolbarButton aria-label="Open a PDF" title="Open a PDF" onclick={openFile}>
        <InkIcon icon={FileUp} />
        Open
      </InkToolbarButton>
      <InkDownloadButton />
      <InkPrintButton />
    </div>
  </InkToolbar>
  <div class="scenario-body">
    <InkSidebar side="left" layout="rail" bind:open={pagesOpen}>
      <InkPanel id="pages" label="Pages" icon={Square}>
        <InkThumbnails />
      </InkPanel>
    </InkSidebar>
    <InkViewport />
    <ReviewSidebar />
  </div>
  <InkToolbar label="Page and zoom" class="scenario-status-bar">
    <div class="scenario-group" role="group" aria-label="Page">
      <InkPrevPage />
      <InkPageInput />
      <InkPageCount />
      <InkNextPage />
    </div>
    <div class="scenario-group scenario-zoom" role="group" aria-label="Zoom">
      <InkZoomOut />
      <InkZoomSelect />
      <InkZoomIn />
    </div>
  </InkToolbar>
  <InkThreadPopover />
  <CommandLog {log} />
</InkRoot>
