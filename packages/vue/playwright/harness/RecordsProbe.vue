<script setup lang="ts">
import { computed } from 'vue'

import { useRecords } from '../../src/composables/useRecords'
import { useRecordSelection } from '../../src/composables/useRecordSelection'

import type { Suggestion } from './suggestions-plugin'

const { records, handle } = useRecords<Suggestion>('sandbox.suggestions')
const { selected, select } = useRecordSelection('sandbox.suggestions')
const open = computed(() => records.value.filter((s) => s.status === 'open').length)
</script>

<template>
  <output data-testid="ready">{{ handle !== null }}</output>
  <output data-testid="open-count">{{ open }}</output>
  <output data-testid="selected">{{ selected ?? 'none' }}</output>
  <button type="button" data-testid="select-s2" @click="select('s2')">Select s2</button>
</template>
