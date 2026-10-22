<script setup lang="ts">
import { ref, watch } from 'vue'

import { usePage } from '../composables/usePage'

const { current, count, goTo } = usePage()
// `v-model` on a number input hands back a number once the user types.
const draft = ref<string | number>(String(current.value + 1))
watch(current, (c) => (draft.value = String(c + 1)))

/**
 * 1-based in the input, 0-based in the viewport. Out of range resets to the current page. The
 * page on show is left alone, so the `change` that a blur fires never scrolls back to its top.
 */
function commit(): void {
  const n = Number(draft.value)
  if (Number.isInteger(n) && n >= 1 && n <= count.value) {
    if (n - 1 !== current.value) goTo(n - 1)
  } else draft.value = String(current.value + 1)
}
</script>

<template>
  <input
    v-model="draft"
    class="ink-page-input"
    data-ink-page-input
    type="number"
    inputmode="numeric"
    aria-label="Page"
    :min="1"
    :max="count"
    @change="commit"
    @keydown.enter.prevent="commit"
  />
</template>
