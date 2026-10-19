import { InkColorMenu } from '../../src/components/InkColorMenu'
import { InkLineStyleMenu } from '../../src/components/InkLineStyleMenu'
import { InkNextPage } from '../../src/components/InkNextPage'
import { InkPageCount } from '../../src/components/InkPageCount'
import { InkPageInput } from '../../src/components/InkPageInput'
import { InkPrevPage } from '../../src/components/InkPrevPage'
import { InkRedo } from '../../src/components/InkRedo'
import { InkRoot } from '../../src/components/InkRoot'
import { InkShapeMenu } from '../../src/components/InkShapeMenu'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkToolbarSeparator } from '../../src/components/InkToolbarSeparator'
import { InkToolButton } from '../../src/components/InkToolButton'
import { InkUndo } from '../../src/components/InkUndo'
import { InkViewport } from '../../src/components/InkViewport'
import { InkZoomIn } from '../../src/components/InkZoomIn'
import { InkZoomOut } from '../../src/components/InkZoomOut'
import { InkZoomSelect } from '../../src/components/InkZoomSelect'

import { HookProbe } from './HookProbe'

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
      <InkToolbar>
        <InkToolButton tool="select-text" />
        <InkToolButton tool="select" />
        <InkToolButton tool="highlight" />
        <InkToolButton tool="redact-area" />
        <InkToolButton tool="note" />
        <InkShapeMenu />
        <InkToolbarSeparator />
        <InkLineStyleMenu />
        <InkColorMenu property="border" />
        <InkColorMenu property="fill" />
        <InkUndo />
        <InkRedo />
      </InkToolbar>
      {/* Test-only box: the scroll container needs a bounded height to scroll. */}
      <div style={{ height: 600, width: 900 }}>
        <InkViewport />
      </div>
      <InkToolbar label="Page and zoom">
        <InkPrevPage />
        <InkPageInput />
        <InkPageCount />
        <InkNextPage />
        <InkZoomOut />
        <InkZoomSelect />
        <InkZoomIn />
      </InkToolbar>
      <HookProbe />
    </InkRoot>
  )
}
