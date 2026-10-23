import { InkFindBar } from '../../src/components/InkFindBar'
import { InkRoot } from '../../src/components/InkRoot'
import { InkSearchButton } from '../../src/components/InkSearchButton'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkViewport } from '../../src/components/InkViewport'
import { useSearch } from '../../src/hooks/useSearch'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

function SearchProbe() {
  const { state, setQuery, next, previous } = useSearch()
  return (
    <>
      <output data-testid="query">{state.query}</output>
      <output data-testid="open">{String(state.open)}</output>
      <button type="button" data-testid="set-query" onClick={() => setQuery('Inkbar')}>
        Set
      </button>
      {/* Steps forward and back in one task, to check the live region sees both. */}
      <button
        type="button"
        data-testid="there-and-back"
        onClick={() => {
          next()
          previous()
        }}
      >
        Step
      </button>
    </>
  )
}

export function FindHarness({
  src,
  assets,
  withBar = true,
}: {
  src: DocumentSource | null
  assets: PdfAssets
  withBar?: boolean
}) {
  return (
    <>
      <button type="button" data-testid="outside">
        Outside
      </button>
      <InkRoot src={src} assets={assets} zoom={1}>
        <InkToolbar>
          {/* Its own label must win over these. */}
          <InkSearchButton aria-label="Search the PDF" title="Search the PDF" />
        </InkToolbar>
        {/* Test-only box: the scroll container needs a bounded height to scroll. */}
        <div style={{ height: 600, width: 900 }}>
          <InkViewport />
        </div>
        {withBar ? <InkFindBar /> : null}
        <SearchProbe />
      </InkRoot>
    </>
  )
}
