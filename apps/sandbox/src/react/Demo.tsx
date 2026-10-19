import {
  InkColorMenu,
  InkLineStyleMenu,
  InkNextPage,
  InkNotePopover,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRedo,
  InkRoot,
  InkShapeMenu,
  InkSuggestionCard,
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

import { Actions } from './Actions'

import type { DocumentSource } from '@inkbar/core'

/*
 * Uncontrolled: the document keeps its own annotations and undo history. The toolbars are
 * built from Inkbar's components, so each control is yours to keep, move or drop. Pass a
 * button your own icon to replace the one it shows.
 */
export function Demo({ source }: { source: DocumentSource }) {
  return (
    <InkRoot src={source} assets={assets} className="demo-root">
      <InkToolbar className="demo-toolbar">
        <div className="demo-group" role="group" aria-label="Highlight">
          <InkToolButton tool="highlight" />
        </div>
        <div className="demo-group" role="group" aria-label="Tools">
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
          <InkToolButton tool="redact-area" />
          <InkShapeMenu />
          <InkToolButton tool="freetext" />
          <InkToolButton tool="note" />
        </div>
        <InkToolbarSeparator />
        <div className="demo-group" role="group" aria-label="Style">
          <InkLineStyleMenu />
          <InkColorMenu property="border" />
          <InkColorMenu property="fill" />
        </div>
        <InkUndo />
        <InkRedo />
        <Actions />
      </InkToolbar>
      <InkViewport />
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
      <InkNotePopover />
      <InkSuggestionCard />
    </InkRoot>
  )
}
