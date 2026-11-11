<script setup lang="ts">
/*
 * The right sidebar. Suggestions lists the plugin's open suggestions as the cards their marks
 * open. Accepted is your own component on useRecords: Undo accept puts a suggestion back up for
 * review and removes its redaction, in one undo step. The sidebar opens Suggestions when the
 * Suggest command finishes. It sits inside InkRoot to reach the records and the command.
 */
import { Check, SquareDashed } from '@inkbar/icons'
import {
  InkPanel,
  InkRecordList,
  InkSidebar,
  useAnnotations,
  useCommand,
  useRecords,
} from '@inkbar/vue'
import { computed, ref, watch } from 'vue'

import { acceptedFrom, type Suggestion } from '../../plugin/suggestions'

import type { SidebarOpen } from '@inkbar/core/dom'

const { records, handle } = useRecords<Suggestion>('sandbox.suggestions')
const { annotations, remove } = useAnnotations()
const { busy } = useCommand('sandbox.suggest')

/** Closed until Suggest has something to show. */
const open = ref<SidebarOpen | undefined>(null)
watch(busy, (now, before) => {
  if (before && !now) open.value = 'suggestions'
})

const openCount = computed(
  () => records.value.filter((s) => s.status === 'suggested').length
)
const accepted = computed(() => records.value.filter((s) => s.status === 'accepted'))

function undoAccept(suggestion: Suggestion): void {
  const records = handle.value
  records?.batch(() => {
    records.update(suggestion.id, { status: 'suggested' })
    for (const a of annotations.value) if (acceptedFrom(a) === suggestion.id) remove(a.id)
  })
}
</script>

<template>
  <InkSidebar
    v-model:open="open"
    name="redactions-right"
    side="right"
    layout="rail"
    :default-width="240"
  >
    <InkPanel
      id="suggestions"
      label="Suggestions"
      :icon="SquareDashed"
      :badge="openCount"
    >
      <InkRecordList records="sandbox.suggestions" />
    </InkPanel>
    <InkPanel id="accepted" label="Accepted" :icon="Check">
      <div class="accepted">
        <ul v-if="accepted.length">
          <li v-for="s in accepted" :key="s.id">
            <span class="accepted-reason">{{ s.reason }}</span>
            <span class="accepted-meta">{{ s.text }}, page {{ s.page + 1 }}</span>
            <button type="button" @click="undoAccept(s)">Undo accept</button>
          </li>
        </ul>
        <p v-else class="accepted-empty">Nothing accepted yet.</p>
      </div>
    </InkPanel>
  </InkSidebar>
</template>
