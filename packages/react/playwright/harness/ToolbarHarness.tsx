import { InkRoot } from '../../src/components/InkRoot'
import { InkViewport } from '../../src/components/InkViewport'
import { DefaultToolbar } from '../../src/compositions/DefaultToolbar'

import type { DocumentSource, PdfAssets } from '@inkbar/core'
import type { ToolId } from '@inkbar/core/dom'

export function ToolbarHarness({
  src,
  assets,
  onToolChange,
}: {
  src: DocumentSource
  assets: PdfAssets
  onToolChange?: ((t: ToolId) => void) | undefined
}) {
  return (
    <InkRoot src={src} assets={assets} zoom={1} onToolChange={onToolChange}>
      <DefaultToolbar />
      {/* Test-only box: the scroll container needs a bounded height to scroll. */}
      <div style={{ height: 600, width: 900 }}>
        <InkViewport />
      </div>
    </InkRoot>
  )
}
