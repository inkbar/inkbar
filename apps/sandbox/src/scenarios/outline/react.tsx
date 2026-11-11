/*
 * A table of contents, an index and an outline in one document. The outline lists the
 * chapters on the left; click an entry to jump to it, and press the right arrow on
 * "3. Recording and checking" to open it. Click a line of the contents on page 2, or a page
 * number in the index on the last page, then use Back to return. The web link in section 3.3
 * is not opened by Inkbar: it comes to onAction, and this code opens the tab.
 */
import { List, Search, Square } from '@inkbar/icons'
import {
  InkBack,
  InkDownloadButton,
  InkForward,
  InkIcon,
  InkNextPage,
  InkOutline,
  InkPageCount,
  InkPageInput,
  InkPanel,
  InkPrevPage,
  InkPrintButton,
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
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'
import { storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument, ViewerAction } from '@inkbar/core'

export default function Outline({ source, log, onDocument, openFile }: ScenarioProps) {
  function onReady(doc: InkDocument) {
    log('onReady', { pages: doc.pages.length })
    onDocument(doc)
  }

  function onAction(action: ViewerAction) {
    log('onAction', action)
    if (action.kind === 'open-url') window.open(action.url, '_blank', 'noopener')
  }

  return (
    <InkRoot
      src={source}
      assets={assets}
      storage={storage}
      onReady={onReady}
      onAction={onAction}
      className="scenario-root"
    >
      <InkToolbar className="scenario-toolbar">
        <div className="scenario-group" role="group" aria-label="Tools">
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
        </div>
        <div className="scenario-group" role="group" aria-label="History">
          <InkBack />
          <InkForward />
        </div>
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
        <InkSidebar side="left" defaultOpen="outline">
          <InkPanel id="outline" label="Outline" icon={List}>
            <InkOutline />
          </InkPanel>
          <InkPanel id="pages" label="Pages" icon={Square}>
            <InkThumbnails />
          </InkPanel>
          <InkPanel id="search" label="Search" icon={Search}>
            <InkSearchResults />
          </InkPanel>
        </InkSidebar>
        <InkViewport />
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
