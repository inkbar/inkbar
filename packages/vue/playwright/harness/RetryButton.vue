<script setup lang="ts">
/* Submits the password prompt: the root opens the document's source again. */
import { useInkContext } from '../../src/context'

const ctx = useInkContext('RetryButton')
</script>

<template>
  <button
    type="button"
    data-testid="retry"
    @click="ctx.passwordPrompt.value?.submit('again')"
  >
    Retry
  </button>
</template>
