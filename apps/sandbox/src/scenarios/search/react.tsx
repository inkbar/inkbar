/*
 * Two hundred pages, and no creation tools. The viewer renders only the pages near the
 * viewport, but search reads every page's text, so the find bar counts every hit and steps to
 * any of them. Find opens the bar, as does Ctrl+F or Cmd+F. useSearch gives the same state the
 * bar shows, for a control of your own.
 */
import {
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
  useSearch,
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { useEffect } from 'react'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'

import type { Log, ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'

/**
 * Logs each finished search and each step to a hit, while the find bar is open. It sits inside
 * InkRoot to reach search.
 */
function SearchLog({ log }: { log: Log }) {
  const { open, query, hits, current, scanning } = useSearch().state
  const count = hits.length
  useEffect(() => {
    if (open && query && !scanning) log('search', { query, hits: count, current })
  }, [open, query, count, current, scanning, log])
  return null
}

export default function SearchLongDocument({
  source,
  log,
  onDocument,
  openFile,
}: ScenarioProps) {
  function onReady(doc: InkDocument) {
    log('onReady', { pages: doc.pages.length })
    onDocument(doc)
  }

  return (
    <InkRoot src={source} assets={assets} onReady={onReady} className="scenario-root">
      <InkToolbar className="scenario-toolbar">
        <div className="scenario-group" role="group" aria-label="Tools">
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
        </div>
        <InkSearchButton />
        <div className="scenario-group scenario-file" role="group" aria-label="File">
          <InkToolbarButton aria-label="Open a PDF" title="Open a PDF" onClick={openFile}>
            <InkIcon icon={FileUp} />
            Open
          </InkToolbarButton>
        </div>
      </InkToolbar>
      <InkViewport />
      <InkFindBar />
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
      <SearchLog log={log} />
    </InkRoot>
  )
}
