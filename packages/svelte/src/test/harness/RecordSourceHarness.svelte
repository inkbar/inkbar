<script lang="ts">
  /* A record list over a host's own source of two items, logging what it selects. */
  import { writable } from '@inkbar/core'

  import InkRecordList from '../../lib/components/InkRecordList.svelte'
  import InkRoot from '../../lib/components/InkRoot.svelte'

  import type { PdfAssets } from '@inkbar/core'
  import type { ListItem, RecordListSource } from '@inkbar/core/dom'

  let {
    assets,
    records,
  }: {
    assets: PdfAssets
    /** Also pass `records`, which `source` wins over. */
    records?: string | undefined
  } = $props()

  let selects = $state<(string | null)[]>([])
  // Sources hold functions and readables, built here so a test passes only plain props.
  const selected = writable<string | null>(null)
  const items: ListItem[] = [
    { id: 'a', page: 0 },
    { id: 'b', page: 1 },
  ]
  const source: RecordListSource = {
    items: writable<readonly ListItem[]>(items),
    card: (item) => ({
      title: `Item ${item.id}`,
      meta: `Page ${item.page + 1}`,
      actions: {},
    }),
    selected,
    select(id) {
      selects = [...selects, id]
      selected.set(id)
    },
    reveal() {},
    run: (_, fn) => fn(),
    replaying: () => false,
  }
</script>

<InkRoot src={null} {assets}>
  <output data-testid="selects">{selects.join(',')}</output>
  <div style="height: 300px; width: 280px; display: flex; flex-direction: column">
    <InkRecordList {source} {records} data-testid="list" />
  </div>
</InkRoot>
