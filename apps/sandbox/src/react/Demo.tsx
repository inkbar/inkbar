import {
  InkColorMenu,
  InkCommand,
  InkFindBar,
  InkHighlightMenu,
  InkLineStyleMenu,
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRedo,
  InkRoot,
  InkSearchButton,
  InkShapeMenu,
  InkSignatureMenu,
  InkTextStyleMenu,
  InkThreadPopover,
  InkToolbar,
  InkToolbarSeparator,
  InkToolButton,
  InkUndo,
  InkViewport,
  InkZoomIn,
  InkZoomOut,
  InkZoomSelect,
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { suggestionsPlugin } from '../plugin/suggestions'
import '../plugin/suggestions.css'
import { signatureFonts, signatures } from '../shared/signatures'

import type { DocumentSource } from '@inkbar/core'

/*
 * Uncontrolled: the document keeps its own annotations and undo history. The toolbars are
 * built from Inkbar's components, so each control is yours to keep, move or drop. Pass a
 * button your own icon to replace the one it shows. Suggest redactions is a plugin
 * (src/plugin/suggestions.ts): registered in `plugins`, with its button placed by InkCommand.
 */
export function Demo({ source }: { source: DocumentSource }) {
  return (
    <InkRoot
      src={source}
      assets={assets}
      signatures={signatures}
      signatureFonts={signatureFonts}
      plugins={[suggestionsPlugin()]}
      className="demo-root"
    >
      <InkToolbar className="demo-toolbar">
        <InkHighlightMenu />
        <div className="demo-group" role="group" aria-label="Tools">
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
        <div className="demo-group" role="group" aria-label="Style">
          <InkLineStyleMenu />
          <InkColorMenu property="border" />
          <InkColorMenu property="fill" />
          <InkTextStyleMenu />
        </div>
        <InkUndo />
        <InkRedo />
        <InkSearchButton />
        <div className="demo-actions" role="group" aria-label="Suggest">
          <InkCommand id="sandbox.suggest" />
        </div>
      </InkToolbar>
      <InkViewport />
      <InkFindBar />
      <InkToolbar label="Page and zoom" className="demo-status-bar">
        <div className="demo-group" role="group" aria-label="Page">
          <InkPrevPage />
          <InkPageInput />
          <InkPageCount />
          <InkNextPage />
        </div>
        <div className="demo-group demo-zoom" role="group" aria-label="Zoom">
          <InkZoomOut />
          <InkZoomSelect />
          <InkZoomIn />
        </div>
      </InkToolbar>
      <InkThreadPopover />
    </InkRoot>
  )
}
