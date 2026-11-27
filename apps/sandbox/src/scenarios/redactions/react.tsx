/*
 * Suggest redactions is a plugin (src/plugin/suggestions.ts). Register it in `plugins` and place
 * its command where you want with InkCommand. Suggest adds the plugin's own records, draws a mark
 * on each and opens a card when you press one. Accept turns a suggestion into a redaction.
 * Thumbnails of the pages sit in the left sidebar; ReviewSidebar is the right.
 */
import { allTools, type SidebarOpen } from '@inkbar/core/dom'
import { Check, Square, SquareDashed } from '@inkbar/icons'
import {
  InkApplyRedactions,
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
import { signatureFonts, storage } from '../../shared/signatures'

import type { Log, ScenarioProps } from '../../frameworks/types'
import type { ScenarioLabels } from '../../shared/strings/types'
import type { InkDocument } from '@inkbar/core'

const tools = allTools()

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
function ReviewSidebar({ labels }: { labels: ScenarioLabels }) {
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
      name="redactions-right"
      side="right"
      layout="rail"
      open={open}
      onOpenChange={setOpen}
    >
      <InkPanel
        id="suggestions"
        label={labels.suggestions}
        icon={SquareDashed}
        badge={openCount}
      >
        <InkRecordList records="sandbox.suggestions" />
      </InkPanel>
      <InkPanel id="accepted" label={labels.accepted} icon={Check}>
        <div className="accepted">
          {accepted.length > 0 ? (
            <ul>
              {accepted.map((s) => (
                <li key={s.id}>
                  <span className="accepted-reason">{labels.plugin.reasons[s.kind]}</span>
                  <span className="accepted-meta">
                    {labels.acceptedAt({ text: s.text, page: s.page + 1 })}
                  </span>
                  <button type="button" onClick={() => undoAccept(s)}>
                    {labels.undoAccept}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="accepted-empty">{labels.nothingAccepted}</p>
          )}
        </div>
      </InkPanel>
    </InkSidebar>
  )
}

export default function SuggestRedactions({
  source,
  messages,
  locale,
  labels,
  log,
  onDocument,
  openFile,
}: ScenarioProps) {
  // The plugin reads its words when it shows them, from the latest labels, so they follow
  // the language. The plugin itself is made once. The ref is written during render, not in an
  // effect, because InkRoot applies the new messages in a layout effect that runs before this
  // component's effects, and the plugin reads its words at that moment.
  const text = useRef(labels.plugin)
  text.current = labels.plugin
  const [plugins] = useState(() => [suggestionsPlugin({ text: () => text.current })])

  function onReady(doc: InkDocument) {
    log('onReady', { pages: doc.pages.length })
    onDocument(doc)
  }

  return (
    <InkRoot
      src={source}
      messages={messages}
      locale={locale}
      assets={assets}
      tools={tools}
      plugins={plugins}
      storage={storage}
      signatureFonts={signatureFonts}
      onReady={onReady}
      onActivate={(id) => log('onActivate', id)}
      className="scenario-root"
    >
      <InkToolbar className="scenario-toolbar">
        <div className="scenario-group" role="group" aria-label={labels.tools}>
          <InkHighlightMenu />
          <InkToolButton tool="select-text" />
          <InkToolButton tool="select" />
          <InkToolButton tool="redact-area" />
          <InkApplyRedactions />
          <InkToolButton tool="sketch" />
          <InkToolButton tool="draw" />
          <InkShapeMenu />
          <InkToolButton tool="freetext" />
          <InkSignatureMenu />
          <InkToolButton tool="note" />
        </div>
        <InkToolbarSeparator />
        <div className="scenario-group" role="group" aria-label={labels.style}>
          <InkLineStyleMenu />
          <InkColorMenu property="border" />
          <InkColorMenu property="fill" />
          <InkTextStyleMenu />
        </div>
        <div className="scenario-group" role="group" aria-label={labels.history}>
          <InkUndo />
          <InkRedo />
        </div>
        <div className="scenario-actions" role="group" aria-label={labels.suggest}>
          <InkCommand id="sandbox.suggest" />
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
      <div className="scenario-body">
        {/* The Pages panel starts closed, leaving the pages the room. */}
        <InkSidebar name="redactions-left" side="left" layout="rail" defaultOpen={null}>
          <InkPanel id="pages" label={labels.pages} icon={Square}>
            <InkThumbnails />
          </InkPanel>
        </InkSidebar>
        <InkViewport />
        <ReviewSidebar labels={labels} />
      </div>
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
      <CommandLog log={log} />
    </InkRoot>
  )
}
