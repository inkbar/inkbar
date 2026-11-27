/*
 * A sidebar either side of the pages, each a set of panels you fill. Pages lists thumbnails
 * and Search finds text; About on the right is your own markup. Layout switches both
 * sidebars between a rail, tabs and a stack.
 */
import { type SidebarLayout } from '@inkbar/core/dom'
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
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { useState } from 'react'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'
import { storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'

export default function Sidebars({
  source,
  messages,
  locale,
  labels,
  log,
  onDocument,
  openFile,
}: ScenarioProps) {
  const [layout, setLayout] = useState<SidebarLayout>('rail')

  function onReady(doc: InkDocument) {
    log('onReady', { pages: doc.pages.length })
    onDocument(doc)
  }

  return (
    <InkRoot
      src={source}
      messages={messages}
      locale={locale}
      assets={assets}
      storage={storage}
      onReady={onReady}
      className="scenario-root"
    >
      <InkToolbar className="scenario-toolbar">
        <div className="scenario-group" role="group" aria-label={labels.tools}>
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
        </div>
        <label className="scenario-layout">
          {labels.layout}
          <select
            className="ink-select"
            value={layout}
            onChange={(e) => setLayout(e.target.value as SidebarLayout)}
          >
            <option value="rail">{labels.rail}</option>
            <option value="tabs">{labels.tabs}</option>
            <option value="stack">{labels.stack}</option>
          </select>
        </label>
        <div
          className="scenario-group scenario-file"
          role="group"
          aria-label={labels.file}
        >
          <InkToolbarButton
            aria-label={labels.openPdf}
            title={labels.openPdf}
            onClick={openFile}
          >
            <InkIcon icon={FileUp} />
            {labels.open}
          </InkToolbarButton>
          <InkDownloadButton />
          <InkPrintButton />
        </div>
      </InkToolbar>
      <div className="scenario-body">
        <InkSidebar name="sidebars-left" side="left" layout={layout}>
          <InkPanel id="pages" label={labels.pages} icon={Square}>
            <InkThumbnails />
          </InkPanel>
          <InkPanel id="search" label={labels.search} icon={Search}>
            <InkSearchResults />
          </InkPanel>
        </InkSidebar>
        <InkViewport />
        <InkSidebar name="sidebars-right" side="right" layout={layout}>
          <InkPanel id="about" label={labels.about} icon={Info}>
            <div className="sidebar-about">
              <p>{labels.aboutFill}</p>
              <p>{labels.aboutRecords}</p>
            </div>
          </InkPanel>
        </InkSidebar>
      </div>
      <InkToolbar label={labels.pageAndZoom} className="scenario-status-bar">
        <div className="scenario-group" role="group" aria-label={labels.page}>
          <InkPrevPage />
          <InkPageInput />
          <InkPageCount />
          <InkNextPage />
        </div>
        <div
          className="scenario-group scenario-zoom"
          role="group"
          aria-label={labels.zoom}
        >
          <InkZoomOut />
          <InkZoomSelect />
          <InkZoomIn />
        </div>
      </InkToolbar>
    </InkRoot>
  )
}
