import { InkRoot } from '../../src/components/InkRoot'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkViewport } from '../../src/components/InkViewport'
import { InkZoomIn } from '../../src/components/InkZoomIn'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

/** A zoom-in button carrying a host onClick. */
export function ZoomClickHarness({
  src,
  assets,
  onHostClick,
}: {
  src: DocumentSource
  assets: PdfAssets
  onHostClick: () => void
}) {
  return (
    <InkRoot src={src} assets={assets} zoom={1}>
      <InkToolbar>
        <InkZoomIn onClick={onHostClick} />
      </InkToolbar>
      {/* Test-only box: the scroll container needs a bounded height to scroll. */}
      <div style={{ height: 600, width: 900 }}>
        <InkViewport />
      </div>
    </InkRoot>
  )
}
