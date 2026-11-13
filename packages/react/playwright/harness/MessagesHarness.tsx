import { allTools } from '@inkbar/core/dom'
import { fr } from '@inkbar/core/locales/fr'
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

import { suggestions, suggestionsPlugin } from './suggestions-plugin'

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
  french = false,
  inline = false,
  withCard = false,
  hostLang,
  undefinedLang = false,
  tick = 0,
}: {
  src: DocumentSource
  assets: PdfAssets
  messages?: InkMessagesInput | undefined
  locale?: string | undefined
  zoom?: ZoomValue | undefined
  /** Test-only: a `toolbar.zoomPercent` function, which a test cannot pass as a prop. */
  percentSuffix?: string | undefined
  /** Test-only: pass the shipped French, whose functions a test cannot pass as a prop. */
  french?: boolean
  /** Pass a new inline `messages` object on every render. */
  inline?: boolean
  /** Run a plugin with one mark, whose card a test can open. */
  withCard?: boolean
  /** A `lang` the host passes to the root. */
  hostLang?: string | undefined
  /** Test-only: pass `lang={undefined}` to the root, which a test cannot pass as a prop. */
  undefinedLang?: boolean
  /** Changes to re-render the host. */
  tick?: number
}) {
  const [tools] = useState(allTools)
  const [plugins] = useState(() =>
    withCard ? [suggestionsPlugin({ initial: suggestions(1) })] : undefined
  )
  const words: InkMessagesInput | undefined = french
    ? fr
    : inline
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
  const langAttr = undefinedLang
    ? { lang: undefined }
    : hostLang === undefined
      ? {}
      : { lang: hostLang }
  return (
    <InkRoot
      {...langAttr}
      src={src}
      assets={assets}
      zoom={zoom ?? 1}
      tools={tools}
      plugins={plugins}
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
