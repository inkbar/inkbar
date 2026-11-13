import { InkFindBar } from '../../src/components/InkFindBar'
import { InkRoot } from '../../src/components/InkRoot'
import { InkSearchButton } from '../../src/components/InkSearchButton'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkViewport } from '../../src/components/InkViewport'
import { useSearch } from '../../src/hooks/useSearch'

import type { DocumentSource, InkMessagesInput, PdfAssets } from '@inkbar/core'

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

/** Test-only words, built here: a test cannot pass functions as props. */
function wordsFor(
  brokenCount: boolean,
  announceWord: string | undefined
): InkMessagesInput | undefined {
  if (!brokenCount && announceWord === undefined) return undefined
  const find: NonNullable<InkMessagesInput['find']> = {}
  if (brokenCount)
    find.count = () => {
      throw new Error('no words')
    }
  if (announceWord !== undefined)
    find.announce = ({ current, total, page }) =>
      `${announceWord} ${current}/${total} p${page}`
  return { find }
}

export function FindHarness({
  src,
  assets,
  withBar = true,
  brokenCount = false,
  announceWord,
}: {
  src: DocumentSource | null
  assets: PdfAssets
  withBar?: boolean
  /** A `find.count` that throws. */
  brokenCount?: boolean
  /** A `find.announce` starting with this word. */
  announceWord?: string | undefined
}) {
  return (
    <>
      <button type="button" data-testid="outside">
        Outside
      </button>
      <InkRoot
        src={src}
        assets={assets}
        zoom={1}
        messages={wordsFor(brokenCount, announceWord)}
      >
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
