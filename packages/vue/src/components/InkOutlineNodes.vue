<script setup lang="ts">
/*
 * One level of `InkOutline`'s tree, and below it the levels of the items that have children.
 * Internal: it renders the markup `OutlineController.itemAttrs` documents and spreads what the
 * controller gives it.
 */
import { ChevronRight } from '@inkbar/icons'

import InkIcon from './InkIcon.vue'

import type { OutlineItem } from '@inkbar/core'
import type { OutlineController } from '@inkbar/core/dom'

const props = defineProps<{
  items: readonly OutlineItem[]
  controller: OutlineController
  /** Reads the controller's stores so a render follows them. */
  attrs: (id: string) => Record<string, string | undefined>
  expanded: ReadonlySet<string>
  current: string | null
}>()

const isOpen = (item: OutlineItem): boolean => props.expanded.has(item.id)

defineSlots<{
  item?(props: { item: OutlineItem; current: boolean; expanded: boolean }): unknown
}>()
</script>

<template>
  <li
    v-for="item in items"
    :key="item.id"
    class="ink-outline-item"
    :data-ink-outline-item="item.id"
    :data-bold="item.bold ? '' : undefined"
    :data-italic="item.italic ? '' : undefined"
    :style="{ '--ink-outline-level': item.id.split('.').length - 1 }"
    v-bind="attrs(item.id)"
  >
    <div
      class="ink-outline-row"
      v-bind="controller.rowAttrs(item.id)"
      @click="controller.activate(item.id)"
    >
      <span
        v-if="item.children.length > 0"
        class="ink-outline-toggle"
        aria-hidden="true"
        @click.stop="controller.toggle(item.id)"
      >
        <InkIcon :icon="ChevronRight" />
      </span>
      <span v-else class="ink-outline-spacer" aria-hidden="true" />
      <span class="ink-outline-title" v-bind="controller.titleAttrs(item.id)">
        <slot
          name="item"
          :item="item"
          :current="current === item.id"
          :expanded="isOpen(item)"
        >
          {{ item.title }}
        </slot>
      </span>
    </div>
    <ul
      v-if="item.children.length > 0"
      class="ink-outline-group"
      role="group"
      :hidden="!expanded.has(item.id)"
    >
      <InkOutlineNodes
        :items="item.children"
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
  </li>
</template>
