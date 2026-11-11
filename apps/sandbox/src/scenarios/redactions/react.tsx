/*
 * Suggest redactions is a plugin (src/plugin/suggestions.ts). Register it in `plugins` and place
 * its command where you want with InkCommand. Suggest adds the plugin's own records, draws a mark
 * on each and opens a card when you press one. Accept turns a suggestion into a redaction.
 * Thumbnails of the pages sit in the left sidebar; ReviewSidebar is the right.
 */
import { allTools, type SidebarOpen } from '@inkbar/core/dom'
import { Check, Square, SquareDashed } from '@inkbar/icons'
import {
  InkDownloadButton,
  InkPrintButton,
  InkColorMenu,
  InkCommand,
  InkHighlightMenu,
  InkLineStyleMenu,
  InkNextPage,
  InkPageCount,
  InkPanel,
  InkPageInput,
  InkPrevPage,
  InkRecordList,
  InkRedo,
  InkRoot,
  InkShapeMenu,
  InkSidebar,
  InkSignatureMenu,
  InkTextStyleMenu,
  InkThreadPopover,
  InkThumbnails,
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
  useAnnotations,
  useCommand,
  useRecords,
} from '@inkbar/react'
import '@inkbar/theme/theme.css'
import { useEffect, useRef, useState } from 'react'
import { assets } from 'virtual:inkbar-assets'

import {
  acceptedFrom,
  suggestionsPlugin,
  type Suggestion,
} from '../../plugin/suggestions'
import '../../plugin/suggestions.css'
import { FileUp } from '../../shared/file-up'
import { signatureFonts, signatures } from '../../shared/signatures'

import type { Log, ScenarioProps } from '../../frameworks/types'
import type { InkDocument } from '@inkbar/core'

const tools = allTools()
const plugins = [suggestionsPlugin()]

/** Logs each result of the Suggest command. It sits inside InkRoot to reach the command. */
function CommandLog({ log }: { log: Log }) {
  const { status } = useCommand('sandbox.suggest')
  useEffect(() => {
    if (status) log('command', status)
  }, [status, log])
  return null
}

/**
 * The right sidebar. Suggestions lists the plugin's open suggestions as the cards their marks
 * open. Accepted is your own component on useRecords: Undo accept puts a suggestion back up for
 * review and removes its redaction, in one undo step. The sidebar opens Suggestions when the
 * Suggest command finishes. It sits inside InkRoot to reach the records and the command.
 */
function ReviewSidebar() {
  const { records, handle } = useRecords<Suggestion>('sandbox.suggestions')
  const { annotations, remove } = useAnnotations()
  const { busy } = useCommand('sandbox.suggest')

  // Closed until Suggest has something to show.
  const [open, setOpen] = useState<SidebarOpen>(null)
  const wasBusy = useRef(busy)
  useEffect(() => {
    if (wasBusy.current && !busy) setOpen('suggestions')
    wasBusy.current = busy
  }, [busy])

  const openCount = records.filter((s) => s.status === 'suggested').length
  const accepted = records.filter((s) => s.status === 'accepted')

  function undoAccept(suggestion: Suggestion) {
    handle?.batch(() => {
      handle.update(suggestion.id, { status: 'suggested' })
      for (const a of annotations) if (acceptedFrom(a) === suggestion.id) remove(a.id)
    })
  }

  return (
    <InkSidebar
      side="right"
      layout="rail"
      defaultWidth={240}
      open={open}
      onOpenChange={setOpen}
    >
      <InkPanel
        id="suggestions"
        label="Suggestions"
        icon={SquareDashed}
        badge={openCount}
      >
        <InkRecordList records="sandbox.suggestions" />
      </InkPanel>
      <InkPanel id="accepted" label="Accepted" icon={Check}>
        <div className="accepted">
          {accepted.length > 0 ? (
            <ul>
              {accepted.map((s) => (
                <li key={s.id}>
                  <span className="accepted-reason">{s.reason}</span>
                  <span className="accepted-meta">
                    {s.text}, page {s.page + 1}
                  </span>
                  <button type="button" onClick={() => undoAccept(s)}>
                    Undo accept
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="accepted-empty">Nothing accepted yet.</p>
          )}
        </div>
      </InkPanel>
    </InkSidebar>
  )
}

export default function SuggestRedactions({
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
      tools={tools}
      plugins={plugins}
      signatures={signatures}
      signatureFonts={signatureFonts}
      onReady={onReady}
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
        <div className="scenario-actions" role="group" aria-label="Suggest">
          <InkCommand id="sandbox.suggest" />
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
        {/* The Pages panel starts closed, leaving the pages the room. */}
        <InkSidebar side="left" layout="rail" defaultWidth={240} defaultOpen={null}>
          <InkPanel id="pages" label="Pages" icon={Square}>
            <InkThumbnails />
          </InkPanel>
        </InkSidebar>
        <InkViewport />
        <ReviewSidebar />
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
      <InkThreadPopover />
      <CommandLog log={log} />
    </InkRoot>
  )
}
