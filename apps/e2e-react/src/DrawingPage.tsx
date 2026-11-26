import { allTools } from '@inkbar/core/dom'
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

const tools = allTools()

/*
 * A fixture with its thumbnails and outline beside the pages, and the shape tools, which
 * draw loupes.
 */
export function DrawingPage({ fixture }: { fixture: string }) {
  const src = useMemo(
    () => ({ url: fixtureUrl(fixture as FixtureName), key: fixture }),
    [fixture]
  )
  const [status, setStatus] = useState('loading')
  return (
    <InkRoot
      src={src}
      assets={assets}
      tools={tools}
      className="sandbox-root"
      onReady={() => {
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
      <p className="sandbox-status" role="status" data-testid="status">
        {status}
      </p>
    </InkRoot>
  )
}
