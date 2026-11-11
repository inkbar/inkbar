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

export default function Sidebars({ source, log, onDocument, openFile }: ScenarioProps) {
  const [layout, setLayout] = useState<SidebarLayout>('rail')

  function onReady(doc: InkDocument) {
    log('onReady', { pages: doc.pages.length })
    onDocument(doc)
  }

  return (
    <InkRoot
      src={source}
      assets={assets}
      storage={storage}
      onReady={onReady}
      className="scenario-root"
    >
      <InkToolbar className="scenario-toolbar">
        <div className="scenario-group" role="group" aria-label="Tools">
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
        </div>
        <label className="scenario-layout">
          Layout
          <select
            className="ink-select"
            value={layout}
            onChange={(e) => setLayout(e.target.value as SidebarLayout)}
          >
            <option value="rail">Rail</option>
            <option value="tabs">Tabs</option>
            <option value="stack">Stack</option>
          </select>
        </label>
        <div className="scenario-group scenario-file" role="group" aria-label="File">
          <InkToolbarButton aria-label="Open a PDF" title="Open a PDF" onClick={openFile}>
            <InkIcon icon={FileUp} />
            Open
          </InkToolbarButton>
          <InkDownloadButton />
          <InkPrintButton />
        </div>
      </InkToolbar>
      <div className="scenario-body">
        <InkSidebar name="sidebars-left" side="left" layout={layout} defaultWidth={240}>
          <InkPanel id="pages" label="Pages" icon={Square}>
            <InkThumbnails />
          </InkPanel>
          <InkPanel id="search" label="Search" icon={Search}>
            <InkSearchResults />
          </InkPanel>
        </InkSidebar>
        <InkViewport />
        <InkSidebar name="sidebars-right" side="right" layout={layout} defaultWidth={240}>
          <InkPanel id="about" label="About" icon={Info}>
            <div className="sidebar-about">
              <p>
                Fill a sidebar with whatever you need: page thumbnails, search results or
                components of your own.
              </p>
              <p>
                Panels can read and write plugin records, so a list here shows the same
                data a plugin marks on the page.
              </p>
            </div>
          </InkPanel>
        </InkSidebar>
      </div>
      <InkToolbar label="Page and zoom" className="scenario-status-bar">
        <div className="scenario-group" role="group" aria-label="Page">
          <InkPrevPage />
          <InkPageInput />
          <InkPageCount />
          <InkNextPage />
        </div>
        <div className="scenario-group scenario-zoom" role="group" aria-label="Zoom">
          <InkZoomOut />
          <InkZoomSelect />
          <InkZoomIn />
        </div>
      </InkToolbar>
    </InkRoot>
  )
}
