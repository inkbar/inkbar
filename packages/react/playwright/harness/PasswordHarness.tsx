import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { InkRoot } from '../../src/components/InkRoot'
import { InkViewport } from '../../src/components/InkViewport'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

export interface PasswordHarnessProps {
  src: DocumentSource | null
  assets: PdfAssets
  password?: string | undefined
  passwordPrompt?: boolean | undefined
  /** Renders the viewport's `locked` prop with a button that calls `promptPassword`. */
  customLocked?: boolean | undefined
  /** Switches to this source from the dialog's own submit, in the same batch as the retry. */
  switchOnSubmit?: DocumentSource | undefined
}

function Tree({
  src,
  assets,
  password,
  passwordPrompt,
  customLocked,
  switchOnSubmit,
}: PasswordHarnessProps) {
  // Playwright serialises callback arguments without an Error's own properties, so the codes
  // go in the DOM.
  const [codes, setCodes] = useState<string[]>([])
  const [switched, setSwitched] = useState<DocumentSource | null>(null)
  return (
    <InkRoot
      src={switched ?? src}
      assets={assets}
      password={password}
      passwordPrompt={passwordPrompt}
      onError={(e) => setCodes((c) => [...c, e.code])}
    >
      {({ status }) => (
        <>
          <output data-testid="status">
            {status.state === 'locked' ? `locked:${status.incorrect}` : status.state}
          </output>
          <output data-testid="error-codes">{codes.join(',')}</output>
          {/* The dialog's portal still bubbles React events here, after its own submit. */}
          <div
            style={{ height: 700, width: 900 }}
            onSubmit={switchOnSubmit ? () => setSwitched(switchOnSubmit) : undefined}
          >
            <InkViewport
              {...(customLocked
                ? {
                    locked: ({ incorrect, promptPassword }) => (
                      <button
                        type="button"
                        data-testid="custom-unlock"
                        onClick={promptPassword}
                      >
                        Custom unlock {incorrect ? 'again' : ''}
                      </button>
                    ),
                  }
                : {})}
            />
          </div>
        </>
      )}
    </InkRoot>
  )
}

export function PasswordHarness(props: PasswordHarnessProps) {
  return <Tree {...props} />
}

/** The same tree under development StrictMode, in a root of its own (see StrictHost). */
export function StrictPasswordHost(props: PasswordHarnessProps) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = createRoot(el.current!)
    root.render(
      <StrictMode>
        <Tree {...props} />
      </StrictMode>
    )
    return () => root.unmount()
    // Remounted for a new source only.
  }, [props.src, props.assets]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={el} />
}
