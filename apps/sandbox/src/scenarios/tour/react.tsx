/*
 * Every creation tool, on a document that already has one of each annotation. The toolbars are
 * built from Inkbar's components, so each control is yours to keep, move or drop. The viewer
 * reports what happens through its callbacks; this file passes each one to `log`.
 */
import { allTools } from '@inkbar/core/dom'
import {
  InkDownloadButton,
  InkPrintButton,
  InkColorMenu,
  InkHighlightMenu,
  InkLineStyleMenu,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRedo,
  InkRoot,
  InkShapeMenu,
  InkSignatureMenu,
  InkTextStyleMenu,
  InkThreadPopover,
  InkIcon,
  InkToolbar,
  InkToolbarButton,
  InkToolbarSeparator,
  InkToolButton,
  InkUndo,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { useEffect, useRef } from 'react'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'
import { signatureFonts, signatures } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'

const tools = allTools()

export default function AnnotationTour({
  source,
  log,
  onDocument,
  openFile,
}: ScenarioProps) {
  /** Stops following the open document's annotations. */
  const unfollow = useRef<() => void>(undefined)
  useEffect(() => () => unfollow.current?.(), [])

  function onReady(doc: InkDocument) {
    log('onReady', { pages: doc.pages.length })
    // The annotation list is a readable on the document: follow it while the document is open.
    unfollow.current?.()
    unfollow.current = doc.annotations.list.subscribe((list) =>
      log('annotations.list', { count: list.length })
    )
    onDocument(doc)
  }

  return (
    <InkRoot
      src={source}
      assets={assets}
      tools={tools}
      signatures={signatures}
      signatureFonts={signatureFonts}
      onReady={onReady}
      onToolChange={(tool) => log('onToolChange', tool)}
      onActivate={(id) => log('onActivate', id)}
      className="scenario-root"
    >
      <InkToolbar className="scenario-toolbar">
        <InkHighlightMenu />
        <div className="scenario-group" role="group" aria-label="Tools">
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
          <InkToolButton tool="redact-area" />
          <InkToolButton tool="sketch" />
          <InkToolButton tool="draw" />
          <InkShapeMenu />
          <InkToolButton tool="freetext" />
          <InkSignatureMenu />
          <InkToolButton tool="note" />
        </div>
        <InkToolbarSeparator />
        <div className="scenario-group" role="group" aria-label="Style">
          <InkLineStyleMenu />
          <InkColorMenu property="border" />
          <InkColorMenu property="fill" />
          <InkTextStyleMenu />
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
