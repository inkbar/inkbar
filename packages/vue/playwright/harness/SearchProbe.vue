<script setup lang="ts">
import { useSearch } from '../../src/composables/useSearch'

const { state, setQuery } = useSearch()
</script>

<template>
  <output data-testid="query">{{ state.query }}</output>
  <output data-testid="open">{{ state.open }}</output>
  <button type="button" data-testid="set-query" @click="setQuery('Inkbar')">Set</button>
</template>
