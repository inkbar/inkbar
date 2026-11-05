/* Search results in a side box, with the find bar over the viewport. */
import { InkFindBar } from '../../src/components/InkFindBar'
import { InkRoot } from '../../src/components/InkRoot'
import { InkSearchButton } from '../../src/components/InkSearchButton'
import { InkSearchResults } from '../../src/components/InkSearchResults'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkViewport } from '../../src/components/InkViewport'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

export function SearchResultsHarness({
  src,
  assets,
  field = true,
}: {
  src: DocumentSource | null
  assets: PdfAssets
  field?: boolean | undefined
}) {
  return (
    <InkRoot src={src} assets={assets} zoom={1}>
      <InkToolbar>
        <InkSearchButton />
      </InkToolbar>
      <div style={{ display: 'flex' }}>
        {/* Test-only box: the list fills its parent's height. */}
        <div
          style={{ height: 300, width: 280, display: 'flex', flexDirection: 'column' }}
        >
          <InkSearchResults field={field} data-testid="results" />
        </div>
        <div style={{ height: 450, width: 600 }}>
          <InkViewport />
        </div>
      </div>
      <InkFindBar data-testid="find-bar" />
    </InkRoot>
  )
}
