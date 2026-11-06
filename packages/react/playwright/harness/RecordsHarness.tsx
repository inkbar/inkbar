/* A record list of the suggestions plugin beside the viewport, with undo and a hooks probe. */
import { StrictMode, useState } from 'react'

import { InkRecordList } from '../../src/components/InkRecordList'
import { InkRoot } from '../../src/components/InkRoot'
import { InkToolbar } from '../../src/components/InkToolbar'
import { InkUndo } from '../../src/components/InkUndo'
import { InkViewport } from '../../src/components/InkViewport'
import { useRecords } from '../../src/hooks/useRecords'
import { useRecordSelection } from '../../src/hooks/useRecordSelection'

import { suggestions, suggestionsPlugin, type Suggestion } from './suggestions-plugin'

import type { DocumentSource, PdfAssets } from '@inkbar/core'

function RecordsProbe() {
  const { records, handle } = useRecords<Suggestion>('sandbox.suggestions')
  const { selected, select } = useRecordSelection('sandbox.suggestions')
  // What the first render saw: the plugins are set up only once the root has mounted.
  const [first] = useState(() => `${handle !== null}/${records.length}/${selected}`)
  const open = records.filter((s) => s.status === 'open').length
  return (
    <>
      <output data-testid="first">{first}</output>
      <output data-testid="ready">{String(handle !== null)}</output>
      <output data-testid="open-count">{open}</output>
      <output data-testid="selected">{selected ?? 'none'}</output>
      <button type="button" data-testid="select-s2" onClick={() => select('s2')}>
        Select s2
      </button>
      <button
        type="button"
        data-testid="add-s9"
        onClick={() =>
          handle?.add({
            id: 's9',
            page: 0,
            rect: { x: 72, y: 500, width: 120, height: 14 },
            reason: 'Suggestion 9',
            status: 'open',
          })
        }
      >
        Add s9
      </button>
    </>
  )
}

export interface RecordsHarnessProps {
  src: DocumentSource | null
  assets: PdfAssets
  /** How many open suggestions the document starts with. */
  initial: number
  /** Render a custom `empty`. */
  customEmpty?: boolean | undefined
  /** Render under StrictMode, which replays effects. */
  strict?: boolean | undefined
}

export function RecordsHarness({
  src,
  assets,
  initial,
  customEmpty,
  strict,
}: RecordsHarnessProps) {
  // Plugins hold functions, which a component test cannot pass as props: the harness builds it.
  const [plugins] = useState(() => [suggestionsPlugin({ initial: suggestions(initial) })])
  const [count, setCount] = useState<number | null>(null)
  const tree = (
    <InkRoot src={src} assets={assets} zoom={1} plugins={plugins}>
      <InkToolbar>
        <InkUndo />
      </InkToolbar>
      <output data-testid="count">{count ?? 'none'}</output>
      <RecordsProbe />
      <div style={{ display: 'flex' }}>
        {/* Test-only box: the list fills its parent's height. */}
        <div
          style={{ height: 300, width: 280, display: 'flex', flexDirection: 'column' }}
        >
          <InkRecordList
            records="sandbox.suggestions"
            data-testid="list"
            onCountChange={setCount}
            empty={
              customEmpty ? (
                <span data-testid="custom-empty">All caught up</span>
              ) : undefined
            }
          />
        </div>
        <div style={{ height: 450, width: 600 }}>
          <InkViewport />
        </div>
      </div>
    </InkRoot>
  )
  return strict ? <StrictMode>{tree}</StrictMode> : tree
}
