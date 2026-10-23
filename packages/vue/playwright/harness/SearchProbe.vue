<script setup lang="ts">
import { useSearch } from '../../src/composables/useSearch'

const { state, setQuery, next, previous } = useSearch()

/** Steps forward and back in one task, to check the live region sees both. */
function thereAndBack(): void {
  next()
  previous()
}
</script>

<template>
  <output data-testid="query">{{ state.query }}</output>
  <output data-testid="open">{{ state.open }}</output>
  <button type="button" data-testid="set-query" @click="setQuery('Inkbar')">Set</button>
  <button type="button" data-testid="there-and-back" @click="thereAndBack()">Step</button>
</template>
