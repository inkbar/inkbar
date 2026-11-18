/*
 * The apply redactions control in a toolbar over a document. `engine: 'held'` gives the root a
 * stand-in engine (`held-engine.ts`); `own` renders the host's own button through `asChild`.
 * `confirm` passes `redactionConfirm` as a function answering yes or no, recording the marks
 * of each preview in `previews`; `confirm: 'dialog'` leaves the built-in dialog; without it the
 * root applies without asking. `throwing` makes `onRedacted` throw, and `shown: false` unmounts
 * the root. `controlled` keeps the annotations in the host with history on, answering each
 * proposal at once, or (`late`) the one that follows `onRedacted` after a delay; their types
 * show in `list`. `swap` is a source `onRedacted` passes as the new `src`. `strict` renders it all in StrictMode. The errors the root reports show in
 * `errors` (code, and the callback when there is one), the `onRedacted` calls in `redacted`,
 * and `useRedaction` in `probe`.
 */
import { allTools } from '@inkbar/core/dom'
import { StrictMode, useRef, useState } from 'react'

import { InkApplyRedactions } from '../../src/components/InkApplyRedactions'
import { InkRoot } from '../../src/components/InkRoot'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkToolButton } from '../../src/components/InkToolButton'
import { InkUndo } from '../../src/components/InkUndo'
import { InkViewport } from '../../src/components/InkViewport'
import { useRedaction } from '../../src/hooks/useRedaction'

import { heldEngine } from './held-engine'

import type {
  Annotation,
  DocumentSource,
  EngineLoader,
  InkError,
  PdfAssets,
  RedactionPreview,
} from '@inkbar/core'

const tools = allTools()

/** What `useRedaction` says, as data attributes. */
function RedactionProbe() {
  const { canRedact, busy } = useRedaction()
  return (
    <output
      data-testid="probe"
      data-can-redact={String(canRedact)}
      data-busy={String(busy)}
    />
  )
}

export interface RedactionHarnessProps {
  src: DocumentSource
  assets: PdfAssets
  engine?: 'held' | undefined
  own?: boolean
  confirm?: 'yes' | 'no' | 'dialog' | undefined
  throwing?: boolean
  shown?: boolean
  controlled?: 'now' | 'late' | undefined
  swap?: DocumentSource | undefined
  strict?: boolean
}

function Harness({
  src,
  assets,
  loader,
  own = false,
  confirm,
  throwing = false,
  shown = true,
  controlled,
  swap,
}: Omit<RedactionHarnessProps, 'engine' | 'strict'> & {
  loader: EngineLoader | undefined
}) {
  const [errors, setErrors] = useState<string[]>([])
  const [previews, setPreviews] = useState<number[]>([])
  const [redacted, setRedacted] = useState(0)
  const [list, setList] = useState<Annotation[]>([])
  const [swapped, setSwapped] = useState<DocumentSource | null>(null)
  /** Set by `onRedacted`: the next proposal is the redaction's. */
  const redactionNext = useRef(false)
  const confirmRef = useRef(confirm)
  confirmRef.current = confirm
  const [ask] = useState(() => (preview: RedactionPreview) => {
    setPreviews((prev) => [...prev, preview.marks])
    return Promise.resolve(confirmRef.current === 'yes')
  })
  const onError = (e: InkError) => {
    const callback = e.details['callback']
    setErrors((prev) => [
      ...prev,
      typeof callback === 'string' ? `${e.code}:${callback}` : e.code,
    ])
  }
  const answer = (next: Annotation[]) => {
    const late = controlled === 'late' && redactionNext.current
    redactionNext.current = false
    if (late) setTimeout(() => setList(next), 50)
    else setList(next)
  }
  const model = controlled
    ? { annotations: list, onAnnotationsChange: answer, history: true }
    : {}
  return (
    <div>
      {shown ? (
        <InkRoot
          {...model}
          src={swapped ?? src}
          assets={assets}
          zoom={1}
          tools={tools}
          engine={loader}
          redactionConfirm={confirm === 'dialog' ? undefined : confirm ? ask : false}
          onError={onError}
          onRedacted={() => {
            setRedacted((n) => n + 1)
            redactionNext.current = true
            if (swap) setSwapped(swap)
            if (throwing) throw new Error('host failed')
          }}
        >
          <InkToolbar>
            <InkToolButton tool="redact-area" />
            <InkUndo />
            {own ? (
              <InkApplyRedactions asChild>
                {({ label, busy, disabled }) => (
                  <button
                    type="button"
                    className="host-apply"
                    data-busy={String(busy)}
                    data-disabled={String(disabled)}
                  >
                    {label}
                  </button>
                )}
              </InkApplyRedactions>
            ) : (
              <InkApplyRedactions />
            )}
          </InkToolbar>
          {/* Test-only box: the scroll container needs a bounded height. */}
          <div style={{ height: 400, width: 600 }}>
            <InkViewport />
          </div>
          <RedactionProbe />
        </InkRoot>
      ) : null}
      <output data-testid="errors">{errors.join(' ')}</output>
      <output data-testid="previews">{previews.join(' ')}</output>
      <output data-testid="redacted">{redacted}</output>
      <output data-testid="list">{list.map((a) => a.type).join(' ')}</output>
    </div>
  )
}

export function RedactionHarness({
  strict = false,
  engine,
  ...props
}: RedactionHarnessProps) {
  // Made outside StrictMode, which runs a state initialiser twice and would leave the page's
  // `__heldEngine` pointing at the copy React threw away.
  const [loader] = useState(() => (engine ? heldEngine() : undefined))
  return strict ? (
    <StrictMode>
      <Harness {...props} loader={loader} />
    </StrictMode>
  ) : (
    <Harness {...props} loader={loader} />
  )
}
