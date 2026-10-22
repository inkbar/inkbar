<script setup lang="ts">
import { ref, watch } from 'vue'

import InkCommand from '../../src/components/InkCommand.vue'
import InkToolbar from '../../src/components/InkToolbar.vue'
import { useCommand } from '../../src/composables/useCommand'

const props = defineProps<{ id: string }>()

const command = useCommand(props.id)
// Destructured, as a host would: the refs still follow the command once it exists.
const { label } = command
/** Every value `enabled` takes, from the first render on. */
const seen = ref<boolean[]>([])
watch(command.enabled, (v) => seen.value.push(v), { immediate: true, flush: 'sync' })
</script>

<template>
  <InkToolbar><InkCommand :id="id" /></InkToolbar>
  <output data-testid="seen">{{ seen.join(',') }}</output>
  <output data-testid="label">{{ label }}</output>
</template>
