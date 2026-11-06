/* Download and print buttons in a toolbar over a document. */
import { InkDownloadButton } from '../../src/components/InkDownloadButton'
import { InkPrintButton } from '../../src/components/InkPrintButton'
import { InkRoot } from '../../src/components/InkRoot'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkViewport } from '../../src/components/InkViewport'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

export function FileHarness({
  src,
  assets,
  filename,
}: {
  src: DocumentSource
  assets: PdfAssets
  filename?: string
}) {
  return (
    <InkRoot src={src} assets={assets} zoom={1}>
      <InkToolbar>
        <InkDownloadButton filename={filename} />
        <InkPrintButton />
      </InkToolbar>
      {/* Test-only box: the scroll container needs a bounded height. */}
      <div style={{ height: 400, width: 600 }}>
        <InkViewport />
      </div>
    </InkRoot>
  )
}
