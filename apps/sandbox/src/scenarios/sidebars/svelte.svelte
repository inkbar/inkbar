<script lang="ts">
  /*
   * A sidebar either side of the pages, each a set of panels you fill. Pages lists thumbnails
   * and Search finds text; About on the right is your own markup. Layout switches both
   * sidebars between a rail, tabs and a stack.
   */
  import { Info, Search, Square } from '@inkbar/icons'
  import {
    InkDownloadButton,
    InkPrintButton,
    InkIcon,
    InkNextPage,
    InkPageCount,
    InkPageInput,
    InkPanel,
    InkPrevPage,
    InkRoot,
    InkSearchResults,
    InkSidebar,
    InkThumbnails,
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

  import type { ScenarioProps } from '../../frameworks/types'
  import type { InkDocument } from '@inkbar/core'
  import type { SidebarLayout } from '@inkbar/core/dom'

  let { source, log, onDocument, openFile }: ScenarioProps = $props()

  let layout = $state<SidebarLayout>('rail')

  function onReady(doc: InkDocument): void {
    log('onReady', { pages: doc.pages.length })
    onDocument(doc)
  }
</script>

<InkRoot src={source} {assets} {storage} {onReady} class="scenario-root">
  <InkToolbar class="scenario-toolbar">
    <div class="scenario-group" role="group" aria-label="Tools">
      <InkToolButton tool="select-text" />
      <InkToolButton tool="select" />
    </div>
    <label class="scenario-layout">
      Layout
      <select class="ink-select" bind:value={layout}>
        <option value="rail">Rail</option>
        <option value="tabs">Tabs</option>
        <option value="stack">Stack</option>
      </select>
    </label>
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
    <InkSidebar name="sidebars-left" side="left" {layout}>
      <InkPanel id="pages" label="Pages" icon={Square}>
        <InkThumbnails />
      </InkPanel>
      <InkPanel id="search" label="Search" icon={Search}>
        <InkSearchResults />
      </InkPanel>
    </InkSidebar>
    <InkViewport />
    <InkSidebar name="sidebars-right" side="right" {layout}>
      <InkPanel id="about" label="About" icon={Info}>
        <div class="sidebar-about">
          <p>
            Fill a sidebar with whatever you need: page thumbnails, search results or
            components of your own.
          </p>
          <p>
            Panels can read and write plugin records, so a list here shows the same data a
            plugin marks on the page.
          </p>
        </div>
      </InkPanel>
    </InkSidebar>
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
</InkRoot>
