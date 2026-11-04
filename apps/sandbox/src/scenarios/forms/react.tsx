/*
 * Form filling needs no creation tools: the viewer passes none. Fields edit in place, and the
 * document keeps their values and undo history, so Undo covers field edits too. Signature
 * fields sign from a popover with a saved signature, from the store and fonts passed here. The
 * form's requests (submit, open a link, print) come to onFormAction, because Inkbar never
 * sends, opens or prints anything itself.
 */
import {
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRedo,
  InkRoot,
  InkThreadPopover,
  InkToolbar,
  InkToolButton,
  InkUndo,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { signatureFonts, signatures } from '../../shared/signatures'

import type { ScenarioProps } from '../../frameworks/types'

export default function FillAForm({ source, log, onDocument }: ScenarioProps) {
  return (
    <InkRoot
      src={source}
      assets={assets}
      signatures={signatures}
      signatureFonts={signatureFonts}
      onFormAction={(action) => log('onFormAction', action)}
      onReady={(doc) => {
        log('onReady', { pages: doc.pages.length })
        onDocument(doc)
      }}
      className="scenario-root"
    >
      <InkToolbar className="scenario-toolbar">
        <div className="scenario-group" role="group" aria-label="Tools">
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
        </div>
        <InkUndo />
        <InkRedo />
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
