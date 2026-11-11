/*
 * Two hundred pages, and no creation tools. The viewer renders only the pages near the
 * viewport, but search reads every page's text, so the find bar counts every hit and steps to
 * any of them. Find opens the bar, as does Ctrl+F or Cmd+F. The results sidebar lists every
 * hit and shows only while there are hits. useSearch gives the same state the bar shows, for a
 * control of your own.
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
  InkSearchResults,
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
import { storage } from '../../shared/signatures'

import type { Log, ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'

/**
 * Every hit, in a panel right of the pages; the find bar is the query field. Your code decides
 * when it shows: here, while the search has hits. It sits inside InkRoot to reach search.
 */
function ResultsSidebar() {
  const hasResults = useSearch().state.hits.length > 0
  // Hidden rather than removed, so the list keeps its scroll between searches.
  return (
    <aside className="results-aside" aria-labelledby="results-title" hidden={!hasResults}>
      <h2 id="results-title" className="results-aside-title">
        Search results
      </h2>
      <InkSearchResults field={false} />
    </aside>
  )
}

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
        <InkSearchButton />
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
        <InkViewport />
        <ResultsSidebar />
      </div>
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
