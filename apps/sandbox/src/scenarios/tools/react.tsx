/*
 * Only the tools you import end up in your bundle. This viewer registers highlight and note;
 * every other creation tool stays out, and its button has nothing to switch on. Select text and
 * Select come with every viewer.
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
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'
import { storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'

const tools = [highlightTool(), noteTool()]

export default function PickYourTools({
  source,
  messages,
  locale,
  labels,
  log,
  onDocument,
  openFile,
}: ScenarioProps) {
  return (
    <InkRoot
      src={source}
      messages={messages}
      locale={locale}
      assets={assets}
      storage={storage}
      tools={tools}
      onReady={(doc) => {
        log('onReady', { pages: doc.pages.length })
        onDocument(doc)
      }}
      onToolChange={(tool) => log('onToolChange', tool)}
      className="scenario-root"
    >
      <InkToolbar className="scenario-toolbar">
        <div className="scenario-group" role="group" aria-label={labels.tools}>
          <InkHighlightMenu />
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
          <InkToolButton tool="note" />
        </div>
        <div className="scenario-group" role="group" aria-label={labels.history}>
          <InkUndo />
          <InkRedo />
        </div>
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
      <InkViewport />
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
      <InkThreadPopover />
    </InkRoot>
  )
}
