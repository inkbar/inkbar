import { allTools } from '@inkbar/core/dom'
import { readerOf } from '@inkbar/e2e-shared/engine-reader'
import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import {
  InkFindBar,
  InkOutline,
  InkPanel,
  InkRoot,
  InkShapeMenu,
  InkSidebar,
  InkThumbnails,
  InkToolbar,
  InkToolButton,
  InkViewport,
  InkZoomIn,
} from '@inkbar/react'
import { useMemo, useState } from 'react'
import { assets } from 'virtual:inkbar-assets'

import type { InkDocument } from '@inkbar/core'

const engine = () => import('@inkbar/engine')
const tools = allTools()

/*
 * A fixture whose pages, thumbnails and loupes the engine draws, and whose text, links and
 * outline it reads: the route turned core's switch on before this mounted. The status names the
 * reader, for the tests.
 */
export function EngineReaderPage({ fixture }: { fixture: string }) {
  const src = useMemo(
    () => ({ url: fixtureUrl(fixture as FixtureName), key: fixture }),
    [fixture]
  )
  const [status, setStatus] = useState('loading')
  const [reader, setReader] = useState('')
  return (
    <InkRoot
      src={src}
      assets={assets}
      engine={engine}
      tools={tools}
      className="sandbox-root"
      onReady={(doc: InkDocument) => {
        setReader(readerOf(doc))
        setStatus('ready')
      }}
      onError={() => setStatus('error')}
    >
      <InkToolbar>
        <InkToolButton tool="select-text" />
        <InkShapeMenu />
        <InkZoomIn />
      </InkToolbar>
      <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>
        <InkSidebar side="left">
          <InkPanel id="outline" label="Outline">
            <InkOutline />
          </InkPanel>
          <InkPanel id="thumbnails" label="Thumbnails">
            <InkThumbnails />
          </InkPanel>
        </InkSidebar>
        <div className="sandbox-editor" style={{ flex: '1 1 auto', minWidth: 0 }}>
          <InkViewport />
          <InkFindBar />
        </div>
      </div>
      <p
        className="sandbox-status"
        role="status"
        data-testid="status"
        data-reader={reader}
      >
        {status}
      </p>
    </InkRoot>
  )
}
