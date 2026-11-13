<script setup lang="ts">
import { computed } from 'vue'

import { useMessages } from '../composables/useMessages'
import { usePage } from '../composables/usePage'

const { count } = usePage()
const messages = useMessages()
const text = computed(() => messages.value.toolbar.pageOf({ total: count.value }))
</script>

<template>
  <span class="ink-page-count" data-ink-page-count aria-live="polite">{{ text }}</span>
</template>
