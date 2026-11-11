<script setup lang="ts">
/*
 * A sidebar of three panels. The Search panel holds a field and can be removed. With `stored`,
 * the sidebar keeps its width in a store the page shows; with `inRoot`, that store is InkRoot's
 * and the sidebar inherits it. The store outlives a remount.
 */
import { MessageSquare, Search, Square } from '@inkbar/icons'
import { computed, ref } from 'vue'

import InkPanel from '../../src/components/InkPanel.vue'
import InkRoot from '../../src/components/InkRoot.vue'
import InkSidebar from '../../src/components/InkSidebar.vue'

import SignatureStorageProbe from './SignatureStorageProbe.vue'

import type { InkStorage, PdfAssets } from '@inkbar/core'
import type { SidebarLayout, SidebarOpen, SidebarSide } from '@inkbar/core/dom'

const props = defineProps<{
  layout?: SidebarLayout | undefined
  side?: SidebarSide | undefined
  /** Bind `v-model:open` to a ref starting at this; leave it out for an uncontrolled sidebar. */
  open?: SidebarOpen | undefined
  /** Bind `v-model:width` to a ref starting at this; leave it out for an uncontrolled width. */
  width?: number | undefined
  /** The store's starting values. Leave it out for a sidebar with no store. */
  stored?: Record<string, unknown> | undefined
  /** Put the sidebar in an InkRoot that owns the store; needs `assets`. */
  inRoot?: boolean | undefined
  assets?: PdfAssets | undefined
}>()

const open = ref<SidebarOpen | undefined>(props.open)
const width = ref<number | undefined>(props.width)
const withSearch = ref(true)
const badge = ref(3)
const shown = ref(true)

/** A store whose contents the page shows. */
const saved = ref<Record<string, unknown>>({ ...props.stored })
const storage: InkStorage = {
  get: (key) => saved.value[key],
  set(key, value) {
    saved.value = { ...saved.value, [key]: value }
  },
  remove(key) {
    const next = { ...saved.value }
    delete next[key]
    saved.value = next
  },
}

const sidebarProps = computed(() => ({
  layout: props.layout,
  side: props.side,
  ...(props.open !== undefined && {
    open: open.value,
    'onUpdate:open': (v: SidebarOpen | undefined) => (open.value = v),
  }),
  ...(props.width !== undefined && {
    width: width.value,
    'onUpdate:width': (v: number) => (width.value = v),
  }),
  ...(props.stored && !props.inRoot && { storage }),
}))
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
  <button type="button" data-testid="remount" @click="shown = !shown">Remount</button>
  <output data-testid="open">{{ JSON.stringify(open ?? null) }}</output>
  <output data-testid="width">{{ JSON.stringify(width ?? null) }}</output>
  <output data-testid="stored">{{ JSON.stringify(saved) }}</output>
  <component
    :is="inRoot ? InkRoot : 'div'"
    v-bind="inRoot ? { src: null, assets, storage } : {}"
  >
    <SignatureStorageProbe v-if="inRoot" />
    <div style="display: flex; height: 400px">
      <InkSidebar v-if="shown" v-bind="sidebarProps" data-testid="sidebar">
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
  </component>
</template>
