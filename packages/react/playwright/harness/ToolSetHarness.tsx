import { allTools } from '@inkbar/core/dom'
import { useState } from 'react'

import { InkRoot } from '../../src/components/InkRoot'
import { InkViewport } from '../../src/components/InkViewport'

import type { DocumentSource, PdfAssets } from '@inkbar/core'
import type { ToolId } from '@inkbar/core/dom'

/** A viewer with a controlled `tool`, and every creation tool unless `bare`. */
export function ToolSetHarness({
  src,
  assets,
  tool,
  bare = false,
  follow = false,
  onToolChange,
}: {
  src: DocumentSource
  assets: PdfAssets
  tool: ToolId
  /** Passes no creation tools. */
  bare?: boolean
  /** Feeds `onToolChange` back into `tool`; without it the host keeps passing `tool` as given. */
  follow?: boolean
  onToolChange?: ((t: ToolId) => void) | undefined
}) {
  const [current, setCurrent] = useState(tool)
  const [tools] = useState(allTools)
  return (
    <InkRoot
      src={src}
      assets={assets}
      zoom={1}
      tool={follow ? current : tool}
      tools={bare ? [] : tools}
      onToolChange={(t) => {
        if (follow) setCurrent(t)
        onToolChange?.(t)
      }}
    >
      {/* Test-only box: the scroll container needs a bounded height to scroll. */}
      <div style={{ height: 600, width: 900 }}>
        <InkViewport />
      </div>
    </InkRoot>
  )
}
