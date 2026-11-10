import { allTools } from '@inkbar/core/dom'
import { fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import {
  InkBack,
  InkForward,
  InkOutline,
  InkPageCount,
  InkPageInput,
  InkPanel,
  InkRoot,
  InkUndo,
  InkSidebar,
  InkToolbar,
  InkToolButton,
  InkViewport,
} from '@inkbar/react'
import { useCallback, useMemo, useState } from 'react'
import { assets } from 'virtual:inkbar-assets'

import type { ViewerAction } from '@inkbar/core'

const tools = allTools()

/*
 * The outline and links fixtures, with the outline in a left sidebar and Back and Forward in
 * the toolbar. Actions reach `window.__actions`, since Inkbar never opens a URL itself; the
 * button swaps the document in place, as a host opening another file would.
 */
export function LinksPage({ fixture }: { fixture: string }) {
  const [name, setName] = useState(fixture)
  const src = useMemo(() => ({ url: fixtureUrl(name as FixtureName), key: name }), [name])
  const [status, setStatus] = useState('loading')
  const onAction = useCallback((a: ViewerAction) => {
    ;(window.__actions ??= []).push(a)
  }, [])
  return (
    <InkRoot
      src={src}
      assets={assets}
      tools={tools}
      history={true}
      className="sandbox-root"
      onReady={() => setStatus('ready')}
      onError={() => setStatus('error')}
      onAction={onAction}
    >
      <InkToolbar>
        <InkBack />
        <InkForward />
        <InkToolButton tool="select-text" />
        <InkToolButton tool="highlight" />
        <InkUndo />
        <button
          type="button"
          data-testid="swap"
          onClick={() => {
            setStatus('loading')
            setName(name === 'outline' ? 'links' : 'outline')
          }}
        >
          Open {name === 'outline' ? 'links' : 'outline'}
        </button>
      </InkToolbar>
      <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>
        <InkSidebar side="left">
          <InkPanel id="outline" label="Outline">
            <InkOutline />
          </InkPanel>
        </InkSidebar>
        <div className="sandbox-editor" style={{ flex: '1 1 auto', minWidth: 0 }}>
          <InkViewport />
          <InkToolbar label="Page">
            <InkPageInput />
            <InkPageCount />
          </InkToolbar>
        </div>
      </div>
      <p className="sandbox-status" role="status" data-testid="status">
        {status}
      </p>
    </InkRoot>
  )
}
