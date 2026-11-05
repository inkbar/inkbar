<script setup lang="ts">
/* A toolbar of the host's own buttons, with no viewer. */
import InkToolbar from '../../src/components/InkToolbar.vue'
import InkToolbarButton from '../../src/components/InkToolbarButton.vue'

defineProps<{ onOpen: () => void }>()
</script>

<template>
  <InkToolbar>
    <InkToolbarButton>Share</InkToolbarButton>
    <InkToolbarButton class="host-open" @click="onOpen()">Open a PDF</InkToolbarButton>
  </InkToolbar>
</template>
