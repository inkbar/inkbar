<script setup lang="ts">
/* A sidebar of three panels, with no viewer. The Search panel holds a field and can be removed. */
import { MessageSquare, Search, Square } from '@inkbar/icons'
import { ref } from 'vue'

import InkPanel from '../../src/components/InkPanel.vue'
import InkSidebar from '../../src/components/InkSidebar.vue'

import type { SidebarLayout, SidebarOpen, SidebarSide } from '@inkbar/core/dom'

const props = defineProps<{
  layout?: SidebarLayout | undefined
  side?: SidebarSide | undefined
  /** Bind `v-model:open` to a ref starting at this; leave it out for an uncontrolled sidebar. */
  open?: SidebarOpen | undefined
}>()

const controlled = props.open !== undefined
const open = ref<SidebarOpen | undefined>(props.open)
const withSearch = ref(true)
const badge = ref(3)
</script>

<template>
  <button type="button" data-testid="toggle-search" @click="withSearch = !withSearch">
    Toggle search
  </button>
  <button
    type="button"
    data-testid="open-notes"
    @click="open = layout === 'stack' ? ['notes'] : 'notes'"
  >
    Open notes
  </button>
  <button type="button" data-testid="clear-badge" @click="badge = 0">Clear badge</button>
  <output data-testid="open">{{ JSON.stringify(open ?? null) }}</output>
  <div style="display: flex; height: 400px">
    <InkSidebar
      v-if="controlled"
      v-model:open="open"
      :layout="layout"
      :side="side"
      data-testid="sidebar"
    >
      <InkPanel id="pages" label="Pages" :icon="Square"><p>Pages content</p></InkPanel>
      <InkPanel
        v-if="withSearch"
        id="search"
        label="Search"
        :icon="Search"
        :badge="badge"
      >
        <input aria-label="Query" />
      </InkPanel>
      <InkPanel id="notes" label="Notes" :icon="MessageSquare">
        <p>Notes content</p>
      </InkPanel>
    </InkSidebar>
    <InkSidebar v-else :layout="layout" :side="side" data-testid="sidebar">
      <InkPanel id="pages" label="Pages" :icon="Square"><p>Pages content</p></InkPanel>
      <InkPanel
        v-if="withSearch"
        id="search"
        label="Search"
        :icon="Search"
        :badge="badge"
      >
        <input aria-label="Query" />
      </InkPanel>
      <InkPanel id="notes" label="Notes" :icon="MessageSquare">
        <p>Notes content</p>
      </InkPanel>
    </InkSidebar>
  </div>
</template>
