<script setup lang="ts">
import { useEmbedded } from '@inkbar/vue'

const { summary, total } = useEmbedded()
</script>

<template>
  <p v-if="total > 0" class="sandbox-banner" role="status" data-testid="embedded-banner">
    This file already contains {{ total }} annotation{{ total === 1 ? '' : 's' }} ({{
      summary.map((s) => `${s.count} ${s.subtype}`).join(', ')
    }}).
  </p>
</template>
