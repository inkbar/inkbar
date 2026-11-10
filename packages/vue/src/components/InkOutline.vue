<script setup lang="ts">
/*
 * The open document's outline as a tree: `createOutline`'s markup on core's outline controller,
 * which holds what is expanded, the Tab stop, the keys, the current item and Back's history.
 * Clicking an item, or Enter on it, follows it; its chevron expands and collapses it. It fills
 * its parent's height and scrolls, and keeps the item the reader has reached in view.
 *
 * The `item` slot, given `{ item, current, expanded }`, replaces an item's title. `emptyText`
 * is shown when the document has no outline. Inside `InkRoot`; the tree is empty on the server.
 */
import { createOutlineController, type OutlineController } from '@inkbar/core/dom'
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'

import { injectInkContext } from '../context'
import { toReadable } from '../to-readable'

import InkOutlineNodes from './InkOutlineNodes.vue'

import type { OutlineItem } from '@inkbar/core'

withDefaults(defineProps<{ emptyText?: string | undefined }>(), {
  emptyText: 'This document has no outline',
})

defineSlots<{
  item?(props: { item: OutlineItem; current: boolean; expanded: boolean }): unknown
}>()

const ctx = injectInkContext()
const deps = {
  document: toReadable(() => ctx.document.value),
  viewport: toReadable(() => ctx.viewport.value),
  navigation: toReadable(() => ctx.navigation.value),
}

// The controller is built on mount, as the other controller-backed components do: it
// subscribes to the document, so nothing is created while rendering on the server.
const controller = shallowRef<OutlineController | null>(null)
const items = shallowRef<readonly OutlineItem[]>([])
const loading = shallowRef(false)
const expanded = shallowRef<ReadonlySet<string>>(new Set())
const current = shallowRef<string | null>(null)
const focused = shallowRef<string | null>(null)

/** The item's attributes. Reading the stores here makes a render follow them. */
function attrs(id: string): Record<string, string | undefined> {
  void [expanded.value, current.value, focused.value]
  return controller.value?.itemAttrs(id) ?? {}
}

const root = useTemplateRef<HTMLElement>('root')
let stops: (() => void)[] = []
onMounted(() => {
  const c = createOutlineController(deps)
  controller.value = c
  items.value = c.items.get()
  loading.value = c.loading.get()
  expanded.value = c.expanded.get()
  current.value = c.current.get()
  focused.value = c.focused.get()
  stops = [
    c.items.subscribe((v) => (items.value = v)),
    c.loading.subscribe((v) => (loading.value = v)),
    c.expanded.subscribe((v) => (expanded.value = v)),
    c.current.subscribe((v) => (current.value = v)),
    c.focused.subscribe((v) => (focused.value = v)),
    c.bindScroll(root.value!),
  ]
})
onBeforeUnmount(() => {
  for (const stop of stops) stop()
  stops = []
  controller.value?.destroy()
  controller.value = null
})
</script>

<template>
  <div
    ref="root"
    class="ink-outline"
    data-ink-outline
    :aria-busy="loading ? 'true' : undefined"
  >
    <ul
      class="ink-outline-tree"
      role="tree"
      aria-label="Outline"
      :hidden="items.length === 0"
      @keydown="controller?.onKeydown($event)"
    >
      <InkOutlineNodes
        v-if="controller"
        :items="items"
        :controller="controller"
        :attrs="attrs"
        :expanded="expanded"
        :current="current"
      >
        <template v-if="$slots.item" #item="slotProps">
          <slot name="item" v-bind="slotProps" />
        </template>
      </InkOutlineNodes>
    </ul>
    <p v-if="controller && !loading && items.length === 0" class="ink-outline-empty">
      {{ emptyText }}
    </p>
  </div>
</template>
