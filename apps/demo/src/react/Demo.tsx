import {
  DefaultToolbar,
  InkNotePopover,
  InkRoot,
  InkSuggestionCard,
  InkViewport,
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import { Actions } from './Actions'

import type { DocumentSource } from '@inkbar/core'

/** Uncontrolled: the document keeps its own annotations and undo history. */
export function Demo({ source }: { source: DocumentSource }) {
  return (
    <InkRoot src={source} assets={assets} className="demo-root">
      <DefaultToolbar>
        <Actions />
      </DefaultToolbar>
      <InkViewport />
      <InkNotePopover />
      <InkSuggestionCard />
    </InkRoot>
  )
}
