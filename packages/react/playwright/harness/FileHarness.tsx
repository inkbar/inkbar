/*
 * Download and print buttons in a toolbar over a document. `engine` gives the root a stand-in
 * engine (`held-engine.ts`); the codes of the errors the root reports show in `errors`.
 */
import { useEffect, useState } from 'react'

import { InkDownloadButton } from '../../src/components/InkDownloadButton'
import { InkPrintButton } from '../../src/components/InkPrintButton'
import { InkRoot } from '../../src/components/InkRoot'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkViewport } from '../../src/components/InkViewport'

import { heldEngine, holdEngine } from './held-engine'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

export function FileHarness({
  src,
  assets,
  filename,
  engine,
}: {
  src: DocumentSource
  assets: PdfAssets
  filename?: string
  engine?: 'held' | 'unavailable'
}) {
  // `held` is core's engine factory, which the root's document uses with no `engine` option,
  // cleared on unmount; `unavailable` is a loader that fails.
  const [loader] = useState(() =>
    engine === 'unavailable' ? heldEngine(true) : undefined
  )
  const [release] = useState(() => (engine === 'held' ? holdEngine() : undefined))
  useEffect(() => release, [release])
  const [errors, setErrors] = useState<string[]>([])
  return (
    <InkRoot
      src={src}
      assets={assets}
      zoom={1}
      engine={loader}
      onError={(e) => setErrors((prev) => [...prev, e.code])}
    >
      <InkToolbar>
        <InkDownloadButton filename={filename} />
        <InkPrintButton />
      </InkToolbar>
      {/* Test-only box: the scroll container needs a bounded height. */}
      <div style={{ height: 400, width: 600 }}>
        <InkViewport />
      </div>
      <output data-testid="errors">{errors.join(' ')}</output>
    </InkRoot>
  )
}
