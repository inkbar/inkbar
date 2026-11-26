/*
 * A redaction fixture with the apply redactions control, opened with the engine. Controlled,
 * the host keeps the annotations with history on and shows their types. Each `onRedacted`
 * call's bytes are kept for the tests, and "Open the redacted file" passes the last as a new
 * `src`. Same test ids and strings as the other sandboxes: all run the shared suite.
 */
import { allTools } from '@inkbar/core/dom'
import { keepRedacted } from '@inkbar/e2e-shared/redaction-page'
import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import {
  InkApplyRedactions,
  InkDownloadButton,
  InkRedo,
  InkRoot,
  InkToolbar,
  InkToolButton,
  InkUndo,
  InkViewport,
  InkZoomIn,
  InkZoomSelect,
} from '@inkbar/react'
import { useCallback, useState } from 'react'
import { assets } from 'virtual:inkbar-assets'

import type { Annotation, DocumentSource, RedactionResult } from '@inkbar/core'

const tools = allTools()

export function RedactPage({
  fixture,
  controlled,
  confirm,
}: {
  fixture: string
  controlled: boolean
  confirm: boolean
}) {
  const [status, setStatus] = useState('loading')
  const onReady = useCallback(() => {
    setStatus('ready')
  }, [])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [src, setSrc] = useState<DocumentSource>(() => ({
    url: fixtureUrl(fixture as FixtureName),
    key: fixture,
  }))
  const [last, setLast] = useState<Uint8Array | null>(null)
  const [applied, setApplied] = useState<RedactionResult | null>(null)
  const onRedacted = useCallback((e: { bytes: Uint8Array; result: RedactionResult }) => {
    keepRedacted(e.bytes)
    setLast(e.bytes)
    setApplied(e.result)
  }, [])
  /** Controlled: the list and its updates, with history on. Uncontrolled: neither. */
  const model = controlled
    ? { annotations, onAnnotationsChange: setAnnotations, history: true }
    : {}
  return (
    <InkRoot
      {...model}
      tools={tools}
      src={src}
      assets={assets}
      redactionConfirm={confirm ? undefined : false}
      className="sandbox-root"
      onReady={onReady}
      onError={() => setStatus('error')}
      onRedacted={onRedacted}
    >
      <InkToolbar>
        <InkToolButton tool="select-text" />
        <InkToolButton tool="redact-area" />
        <InkToolButton tool="shape" />
        <InkZoomSelect />
        <InkZoomIn />
        <InkUndo />
        <InkRedo />
        <InkApplyRedactions />
        <InkDownloadButton />
        <div className="sandbox-actions" role="group" aria-label="Redacted file">
          <button
            type="button"
            data-testid="open-redacted"
            disabled={!last}
            onClick={() => {
              if (last) setSrc({ data: last.slice(), key: `${fixture}-copy` })
            }}
          >
            Open the redacted file
          </button>
        </div>
      </InkToolbar>
      <div className="sandbox-editor">
        <InkViewport />
      </div>
      <p
        className="sandbox-status"
        role="status"
        data-testid="status"
        data-applied={applied?.marks ?? ''}
      >
        {status}
      </p>
      {controlled ? (
        <output className="sandbox-status" data-testid="host-list">
          {annotations.map((a) => a.type).join(' ')}
        </output>
      ) : null}
    </InkRoot>
  )
}
