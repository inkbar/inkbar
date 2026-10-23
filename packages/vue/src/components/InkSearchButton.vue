<script setup lang="ts">
/*
 * Opens the find bar; pressed while it is open. Pressing it again focuses the field. Place it
 * in a toolbar next to `InkFindBar`, which it needs for the field to focus.
 */
import { Search } from '@inkbar/icons'
import { ToolbarButton } from 'reka-ui'
import { computed, mergeProps, nextTick } from 'vue'

import { useDocument } from '../composables/useDocument'
import { useSearch } from '../composables/useSearch'
import { useInkContext } from '../context'

import InkIcon from './InkIcon.vue'

// Bound below, under the button's own label, so a caller's attributes cannot replace its copy.
defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{ asChild?: boolean }>(), { asChild: false })
const ctx = useInkContext('InkSearchButton')
const { state, open } = useSearch()
const { isReady } = useDocument()

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
/** Disabled until a document is open, whatever the caller's `disabled` says, as in React and Svelte. */
const disabled = (fromCaller: unknown): boolean =>
  !isReady.value || (fromCaller != null && fromCaller !== false)
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    class="ink-search-button"
    data-ink-search-button
    v-bind="mergeProps($attrs, attrs, { disabled: disabled($attrs.disabled) })"
  >
    <slot><InkIcon :icon="Search" /></slot>
  </ToolbarButton>
</template>
