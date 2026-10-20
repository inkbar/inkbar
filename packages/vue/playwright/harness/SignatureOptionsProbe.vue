<script setup lang="ts">
import { useToolOptions } from '../../src/composables/useToolOptions'

import type { SignatureOptions } from '@inkbar/core'

const { options } = useToolOptions<SignatureOptions>('signature')
</script>

<template>
  <output data-testid="signature-options" :data-template="options.templateId ?? ''" />
</template>
