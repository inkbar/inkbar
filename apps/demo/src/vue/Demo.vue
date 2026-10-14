<script setup lang="ts">
/* Uncontrolled: the document keeps its own annotations and undo history. */
import {
  DefaultToolbar,
  InkNotePopover,
  InkRoot,
  InkSuggestionCard,
  InkViewport,
} from '@inkbar/vue'
import '@inkbar/theme/theme.css'
import { assets } from 'virtual:inkbar-assets'

import Actions from './Actions.vue'

import type { DocumentSource } from '@inkbar/core'

defineProps<{ source: DocumentSource }>()
</script>

<template>
  <InkRoot :src="source" :assets="assets" class="demo-root">
    <DefaultToolbar>
      <Actions />
    </DefaultToolbar>
    <InkViewport />
    <InkNotePopover />
    <InkSuggestionCard />
  </InkRoot>
</template>
