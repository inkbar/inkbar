<script setup lang="ts">
/*
 * Opens the find bar; pressed while it is open. Pressing it again focuses the field. Place it
 * in a toolbar next to `InkFindBar`, which it needs for the field to focus.
 */
import { Search } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'
import { computed, nextTick } from 'vue'

import { useSearch } from '../composables/useSearch'
import { useInkContext } from '../context'

import InkIcon from './InkIcon.vue'

withDefaults(defineProps<{ asChild?: boolean }>(), { asChild: false })
const ctx = useInkContext('InkSearchButton')
const { state, open } = useSearch()

async function onClick(): Promise<void> {
  open()
  // The bar shows on the next render; its field takes focus then.
  await nextTick()
  const field = ctx.rootEl.value?.querySelector<HTMLInputElement>(
    '[data-ink-find-bar] input'
  )
  field?.focus()
  field?.select()
}
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const attrs = computed(() => ({
  'aria-label': 'Find',
  title: 'Find',
  'aria-pressed': state.value.open,
  'data-state': state.value.open ? 'on' : 'off',
  onClick,
}))
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    class="ink-search-button"
    data-ink-search-button
    v-bind="attrs"
  >
    <slot><InkIcon :icon="Search" /></slot>
  </ToolbarButton>
</template>
