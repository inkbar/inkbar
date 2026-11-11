/*
 * A plugin that hears presses and long presses (src/plugin/presses.ts). Register it in
 * `plugins`; it logs each one here and marks where it landed. Presses reach plugins only under
 * the select tools, and only when nothing in the viewer took them. A mouse click is a press; a
 * finger or pen held still for half a second is a long press. On a phone or tablet, two
 * fingers zoom the document rather than the page.
 */
import {
  InkDownloadButton,
  InkIcon,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkPrintButton,
  InkRoot,
  InkToolbar,
  InkToolbarButton,
  InkToolButton,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { useMemo } from 'react'
import { assets } from 'virtual:inkbar-assets'

import { pressesPlugin } from '../../plugin/presses'
import '../../plugin/presses.css'
import { FileUp } from '../../shared/file-up'
import { storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'

export default function PressAndLongPress({
  source,
  log,
  onDocument,
  openFile,
}: ScenarioProps) {
  // The viewer sets plugins up once, so make the list once.
  const plugins = useMemo(() => [pressesPlugin({ log })], [log])

  function onReady(doc: InkDocument) {
    log('onReady', { pages: doc.pages.length })
    onDocument(doc)
  }

  return (
    <InkRoot
      src={source}
      assets={assets}
      storage={storage}
      plugins={plugins}
      onReady={onReady}
      className="scenario-root"
    >
      <InkToolbar className="scenario-toolbar">
        <div className="scenario-group" role="group" aria-label="Tools">
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
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
