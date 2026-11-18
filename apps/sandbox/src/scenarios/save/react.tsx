/*
 * Download and Print write the session into the PDF: each annotation as a standard PDF
 * annotation other programs can read, and changed form values. The `engine` option loads
 * @inkbar/engine on the first save with changes; with no changes it never loads, and without
 * the option you get the file as it was opened. Open the saved file here and Inkbar's own
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
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'
import { storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'

const tools = [highlightTool(), noteTool()]
const engine = () => import('@inkbar/engine')

export default function SaveAndReopen({
  source,
  messages,
  locale,
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
      engine={engine}
      onReady={(doc) => {
        log('onReady', { pages: doc.pages.length })
        onDocument(doc)
      }}
      onError={(error) => log('onError', { code: error.code })}
      onToolChange={(tool) => log('onToolChange', tool)}
      className="scenario-root"
    >
      <InkToolbar className="scenario-toolbar">
        <InkHighlightMenu />
        <div className="scenario-group" role="group" aria-label="Tools">
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
          <InkToolButton tool="note" />
        </div>
        <InkUndo />
        <InkRedo />
        <div className="scenario-group scenario-file" role="group" aria-label="File">
          <InkToolbarButton aria-label="Open a PDF" title="Open a PDF" onClick={openFile}>
            <InkIcon icon={FileUp} />
            Open
          </InkToolbarButton>
          <InkDownloadButton />
          <InkPrintButton />
        </div>
      </InkToolbar>
      <InkViewport />
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
      <InkThreadPopover />
    </InkRoot>
  )
}
