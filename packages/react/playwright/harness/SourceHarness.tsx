/* A record list over a host's own source of two items, logging what it selects. */
import { writable } from '@inkbar/core'
import { useState } from 'react'

import { InkRecordList } from '../../src/components/InkRecordList'
import { InkRoot } from '../../src/components/InkRoot'

import type { PdfAssets } from '@inkbar/core'
import type { ListItem, RecordListSource } from '@inkbar/core/dom'

export function SourceHarness({ assets }: { assets: PdfAssets }) {
  const [selects, setSelects] = useState<(string | null)[]>([])
  // Sources hold functions and readables, which a component test cannot pass as props.
  const [source] = useState((): RecordListSource => {
    const selected = writable<string | null>(null)
    const items: ListItem[] = [
      { id: 'a', page: 0 },
      { id: 'b', page: 1 },
    ]
    return {
      items: writable<readonly ListItem[]>(items),
      card: (item) => ({
        title: `Item ${item.id}`,
        meta: `Page ${item.page + 1}`,
        actions: {},
      }),
      selected,
      select(id) {
        setSelects((list) => [...list, id])
        selected.set(id)
      },
      reveal() {},
      run: (_, fn) => fn(),
      replaying: () => false,
    }
  })
  return (
    <InkRoot src={null} assets={assets}>
      <output data-testid="selects">{selects.join(',')}</output>
      <div style={{ height: 300, width: 280, display: 'flex', flexDirection: 'column' }}>
        <InkRecordList source={source} data-testid="list" />
      </div>
    </InkRoot>
  )
}
