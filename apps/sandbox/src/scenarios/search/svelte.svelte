<script lang="ts">
  /*
   * Two hundred pages, and no creation tools. The viewer renders only the pages near the
   * viewport, but search reads every page's text, so the find bar counts every hit and steps
   * to any of them. Find opens the bar, as does Ctrl+F or Cmd+F. ResultsSidebar, beside this
   * file, lists every hit and shows only while there are hits. useSearch gives the same state
   * the bar shows, for a control of your own: SearchLog, beside this file, logs it.
   */
  import {
    InkDownloadButton,
    InkPrintButton,
    InkFindBar,
    InkNextPage,
    InkPageCount,
    InkPageInput,
    InkPrevPage,
    InkRoot,
    InkSearchButton,
    InkIcon,
    InkToolbar,
    InkToolbarButton,
    InkToolButton,
    InkViewport,
    InkZoomIn,
    InkZoomOut,
    InkZoomSelect,
  } from '@inkbar/svelte'
  import '@inkbar/theme/theme.css'
  import { assets } from 'virtual:inkbar-assets'

  import { FileUp } from '../../shared/file-up'
  import { storage } from '../../shared/signatures'

  import ResultsSidebar from './ResultsSidebar.svelte'
  import SearchLog from './SearchLog.svelte'

  import type { ScenarioProps } from '../../frameworks/types'
  import type { InkDocument } from '@inkbar/core'

  let { source, messages, locale, log, onDocument, openFile }: ScenarioProps = $props()

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
  {onReady}
  class="scenario-root"
>
  <InkToolbar class="scenario-toolbar">
    <div class="scenario-group" role="group" aria-label="Tools">
      <InkToolButton tool="select-text" />
      <InkToolButton tool="select" />
    </div>
    <InkSearchButton />
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
    <InkViewport />
    <ResultsSidebar />
  </div>
  <InkFindBar />
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
  <SearchLog {log} />
</InkRoot>
