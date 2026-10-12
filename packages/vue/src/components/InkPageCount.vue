<script setup lang="ts">
import { computed } from 'vue'

import { usePage } from '../composables/usePage'

const { count } = usePage()
const text = computed(() => `of ${count.value}`)
</script>

<template>
  <span class="ink-page-count" data-ink-page-count aria-live="polite">{{ text }}</span>
</template>
