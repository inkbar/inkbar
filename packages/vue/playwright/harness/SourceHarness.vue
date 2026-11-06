<script setup lang="ts">
/* A record list over a host's own source of two items, logging what it selects. */
import { writable } from '@inkbar/core'
import { ref } from 'vue'

import InkRecordList from '../../src/components/InkRecordList.vue'
import InkRoot from '../../src/components/InkRoot.vue'

import type { PdfAssets } from '@inkbar/core'
import type { ListItem, RecordListSource } from '@inkbar/core/dom'

defineProps<{ assets: PdfAssets }>()

const selects = ref<(string | null)[]>([])
const selected = writable<string | null>(null)
const items: ListItem[] = [
  { id: 'a', page: 0 },
  { id: 'b', page: 1 },
]
// Sources hold functions and readables, which a component test cannot pass as props.
const source: RecordListSource = {
  items: writable<readonly ListItem[]>(items),
  card: (item) => ({
    title: `Item ${item.id}`,
    meta: `Page ${item.page + 1}`,
    actions: {},
  }),
  selected,
  select(id) {
    selects.value.push(id)
    selected.set(id)
  },
  reveal() {},
  run: (_, fn) => fn(),
  replaying: () => false,
}
</script>

<template>
  <InkRoot :src="null" :assets="assets">
    <output data-testid="selects">{{ selects.join(',') }}</output>
    <div style="height: 300px; width: 280px; display: flex; flex-direction: column">
      <InkRecordList :source="source" data-testid="list" />
    </div>
  </InkRoot>
</template>
