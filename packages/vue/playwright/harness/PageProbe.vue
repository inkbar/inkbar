<script setup lang="ts">
import { usePage } from '../../src/composables/usePage'

const { current } = usePage()
</script>

<template>
  <output data-testid="current">{{ current }}</output>
</template>
