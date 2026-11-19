<script setup lang="ts">
/* What `useRedaction` says, as data attributes. */
import { useRedaction } from '../../src/composables/useRedaction'

const { canRedact, busy } = useRedaction()
</script>

<template>
  <output
    data-testid="probe"
    :data-can-redact="String(canRedact)"
    :data-busy="String(busy)"
  />
</template>
