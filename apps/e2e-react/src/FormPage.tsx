import { readerOf } from '@inkbar/e2e-shared/engine-reader'
import { describeAction } from '@inkbar/e2e-shared/form-actions'
import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import {
  InkNextPage,
  InkPageCount,
  InkPageInput,
  InkPrevPage,
  InkRedo,
  InkRoot,
  InkToolbar,
  InkToolButton,
  InkUndo,
  InkViewport,
} from '@inkbar/react'
import { useCallback, useMemo, useState } from 'react'
import { assets } from 'virtual:inkbar-assets'

import type { InkDocument, ViewerAction } from '@inkbar/core'

const engine = () => import('@inkbar/engine')

/*
 * A form fixture, opened with Inkbar keeping both annotations and field values, so its own
 * history undoes a field commit and the calculation it caused in one step. Form actions are
 * listed, newest first, because Inkbar never acts on them itself. On the engine-reader route
 * the page is given the engine, and the status names the reader, for the tests.
 */
export function FormPage({
  fixture,
  engineReader = false,
}: {
  fixture: string
  engineReader?: boolean
}) {
  const src = useMemo(
    () => ({ url: fixtureUrl(fixture as FixtureName), key: fixture }),
    [fixture]
  )
  const [status, setStatus] = useState('loading')
  const [actions, setActions] = useState<string[]>([])
  const [reader, setReader] = useState('')
  const onReady = useCallback((doc: InkDocument) => {
    setReader(readerOf(doc))
    setStatus('ready')
  }, [])
  const onAction = useCallback(
    (a: ViewerAction) => setActions((list) => [describeAction(a), ...list]),
    []
  )
  return (
    <InkRoot
      src={src}
      assets={assets}
      engine={engineReader ? engine : undefined}
      className="sandbox-root"
      onReady={onReady}
      onError={() => setStatus('error')}
      onAction={onAction}
    >
      <InkToolbar>
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
        <InkUndo />
        <InkRedo />
      </InkToolbar>
      <div className="sandbox-editor">
        <InkViewport />
        <InkToolbar label="Page">
          <InkPrevPage />
          <InkPageInput />
          <InkPageCount />
          <InkNextPage />
        </InkToolbar>
      </div>
      <ol
        className="sandbox-actions"
        aria-label="Form actions"
        data-testid="form-actions"
      >
        {actions.map((line, i) => (
          <li key={actions.length - i}>{line}</li>
        ))}
      </ol>
      <p
        className="sandbox-status"
        role="status"
        data-testid="status"
        data-reader={reader}
      >
        {status}
      </p>
    </InkRoot>
  )
}
