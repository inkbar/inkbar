import { highlightTool } from '@inkbar/core/dom'
import { useState } from 'react'

import { InkHighlightMenu } from '../../src/components/InkHighlightMenu'
import { InkRoot } from '../../src/components/InkRoot'
import { InkShapeMenu } from '../../src/components/InkShapeMenu'
import { InkSignatureMenu } from '../../src/components/InkSignatureMenu'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkToolButton } from '../../src/components/InkToolButton'
import { InkViewport } from '../../src/components/InkViewport'

import { HookProbe } from './HookProbe'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

/** A viewer with no `tools` (or only `highlight`), showing only the controls a test names. */
export function MissingToolsHarness({
  src,
  assets,
  controls,
  highlight = false,
}: {
  src: DocumentSource
  assets: PdfAssets
  controls: ('highlight-button' | 'highlight' | 'shape' | 'signature')[]
  /** Passes the highlight tool. */
  highlight?: boolean
}) {
  const [tools] = useState(() => [highlightTool()])
  return (
    <InkRoot src={src} assets={assets} zoom={1} tools={highlight ? tools : undefined}>
      <InkToolbar>
        <InkToolButton tool="select-text" />
        {controls.includes('highlight-button') ? (
          <InkToolButton tool="highlight" />
        ) : null}
        {controls.includes('highlight') ? <InkHighlightMenu /> : null}
        {controls.includes('shape') ? <InkShapeMenu /> : null}
        {controls.includes('signature') ? <InkSignatureMenu /> : null}
      </InkToolbar>
      {/* Test-only box: the scroll container needs a bounded height to scroll. */}
      <div style={{ height: 600, width: 900 }}>
        <InkViewport />
      </div>
      <HookProbe />
    </InkRoot>
  )
}
