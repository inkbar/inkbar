/*
 * Form filling needs no creation tools: the viewer passes none. Fields edit in place, and the
 * document keeps their values and undo history, so Undo covers field edits too. Signature
 * fields sign from a popover with a saved signature, from the store and fonts passed here. The
 * form's requests (submit, open a link, print) come to onAction, because Inkbar never
 * sends, opens or prints anything itself.
 */
import {
  InkDownloadButton,
  InkPrintButton,
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
import { useEffect, useRef } from 'react'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { FileUp } from '../../shared/file-up'
import { changedFields } from '../../shared/form'
import { signatureFonts, storage } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'
import type { FieldValues, InkDocument } from '@inkbar/core'

export default function FillAForm({
  source,
  messages,
  locale,
  log,
  onDocument,
  openFile,
}: ScenarioProps) {
  /** Stops following the open document's field values. */
  const unfollow = useRef<() => void>(undefined)
  useEffect(() => () => unfollow.current?.(), [])

  function onReady(doc: InkDocument) {
    log('onReady', { pages: doc.pages.length })
    // The field values are a readable on the form: follow them while the document is open.
    unfollow.current?.()
    let before: FieldValues = doc.form.values.get()
    unfollow.current = doc.form.values.subscribe((values) => {
      log('form.values', { fields: changedFields(before, values) })
      before = values
    })
    onDocument(doc)
  }

  return (
    <InkRoot
      src={source}
      messages={messages}
      locale={locale}
      assets={assets}
      storage={storage}
      signatureFonts={signatureFonts}
      onAction={(action) => log('onAction', action)}
      onReady={onReady}
      className="scenario-root"
    >
      <InkToolbar className="scenario-toolbar">
        <div className="scenario-group" role="group" aria-label="Tools">
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
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
