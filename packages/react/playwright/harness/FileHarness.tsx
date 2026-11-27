/*
 * Download and print buttons in a toolbar over a document. `engine` makes the held engine
 * (`held-engine.ts`) the one the root's document uses, through core's engine factory: `held`
 * holds its writes, `unavailable` stops it at its first write with no engine starting after it.
 * The codes of the errors the root reports show in `errors`.
 */
import { useEffect, useState } from 'react'

import { InkDownloadButton } from '../../src/components/InkDownloadButton'
import { InkPrintButton } from '../../src/components/InkPrintButton'
import { InkRoot } from '../../src/components/InkRoot'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkViewport } from '../../src/components/InkViewport'

import { holdEngine } from './held-engine'

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
  // Core's engine factory, cleared on unmount.
  const [release] = useState(() =>
    engine ? holdEngine(engine === 'unavailable') : undefined
  )
  useEffect(() => release, [release])
  const [errors, setErrors] = useState<string[]>([])
  return (
    <InkRoot
      src={src}
      assets={assets}
      zoom={1}
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
