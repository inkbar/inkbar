import { allTools } from '@inkbar/core/dom'
import { useState } from 'react'

import { InkHighlightMenu } from '../../src/components/InkHighlightMenu'
import { InkNextPage } from '../../src/components/InkNextPage'
import { InkPrevPage } from '../../src/components/InkPrevPage'
import { InkRedo } from '../../src/components/InkRedo'
import { InkRoot } from '../../src/components/InkRoot'
import { InkSearchButton } from '../../src/components/InkSearchButton'
import { InkShapeMenu } from '../../src/components/InkShapeMenu'
import { InkThreadPopover } from '../../src/components/InkThreadPopover'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkToolButton } from '../../src/components/InkToolButton'
import { InkUndo } from '../../src/components/InkUndo'
import { InkViewport } from '../../src/components/InkViewport'
import { InkZoomSelect } from '../../src/components/InkZoomSelect'

import type { DocumentSource, InkMessagesInput, PdfAssets } from '@inkbar/core'
import type { ZoomValue } from '@inkbar/core/dom'

type TestWindow = Window & { __inkDrawWord?: string; __inkRenders?: number }

/** A host label that reads its own language, which the test changes before new messages. */
const drawLabel = (): string => (window as TestWindow).__inkDrawWord ?? 'Pen'

/** Counts its renders inside the root, to show new messages do not loop. */
function RenderProbe() {
  const w = window as TestWindow
  w.__inkRenders = (w.__inkRenders ?? 0) + 1
  return null
}

export function MessagesHarness({
  src,
  assets,
  messages,
  locale,
  zoom,
  percentSuffix,
  inline = false,
  tick = 0,
}: {
  src: DocumentSource
  assets: PdfAssets
  messages?: InkMessagesInput | undefined
  locale?: string | undefined
  zoom?: ZoomValue | undefined
  /** Test-only: a `toolbar.zoomPercent` function, which a test cannot pass as a prop. */
  percentSuffix?: string | undefined
  /** Pass a new inline `messages` object on every render. */
  inline?: boolean
  /** Changes to re-render the host. */
  tick?: number
}) {
  const [tools] = useState(allTools)
  const words: InkMessagesInput | undefined = inline
    ? { find: { close: 'X' } }
    : percentSuffix === undefined
      ? messages
      : {
          ...messages,
          toolbar: {
            ...messages?.toolbar,
            zoomPercent: ({ percent }) => `${percent} ${percentSuffix}`,
          },
        }
  return (
    <InkRoot
      src={src}
      assets={assets}
      zoom={zoom ?? 1}
      tools={tools}
      messages={words}
      locale={locale}
      data-tick={tick}
    >
      <InkToolbar>
        <InkSearchButton />
        <InkUndo />
        <InkRedo />
        <InkPrevPage />
        <InkNextPage />
        <InkHighlightMenu />
        <InkShapeMenu />
        <InkToolButton tool="draw" label={drawLabel} />
        <InkZoomSelect />
      </InkToolbar>
      {/* Test-only box: the scroll container needs a bounded height to scroll. */}
      <div style={{ height: 600, width: 900 }}>
        <InkViewport />
      </div>
      <InkThreadPopover />
      <RenderProbe />
    </InkRoot>
  )
}
