/*
 * Download and print buttons in a toolbar over a document. `engine` gives the root a stand-in
 * engine (`held-engine.ts`); the codes of the errors the root reports show in `errors`.
 */
import { useState } from 'react'

import { InkDownloadButton } from '../../src/components/InkDownloadButton'
import { InkPrintButton } from '../../src/components/InkPrintButton'
import { InkRoot } from '../../src/components/InkRoot'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkViewport } from '../../src/components/InkViewport'

import { heldEngine } from './held-engine'

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
  const [loader] = useState(() =>
    engine ? heldEngine(engine === 'unavailable') : undefined
  )
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
