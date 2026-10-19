<script setup lang="ts">
// Adds a square or a line and selects it, so the menus have something to colour.
import { computed } from 'vue'

import { useAnnotations } from '../../src/composables/useAnnotations'
import { useSelection } from '../../src/composables/useSelection'

const { annotations, add } = useAnnotations()
const { select } = useSelection()

const colors = computed(() =>
  annotations.value.map((a) => ('color' in a ? a.color : '-')).join(',')
)
const fills = computed(() =>
  annotations.value
    .map((a) => ('interiorColor' in a && a.interiorColor ? a.interiorColor : '-'))
    .join(',')
)
</script>

<template>
  <div data-testid="probe" :data-colors="colors" :data-fills="fills">
    <button
      data-testid="add-square"
      @click="
        add({
          type: 'square',
          page: 0,
          rect: { x: 50, y: 500, width: 100, height: 60 },
          color: '#FF3B30',
          interiorColor: '#34C759',
        })
      "
    >
      square
    </button>
    <button
      data-testid="add-square-2"
      @click="
        add({
          type: 'square',
          page: 0,
          rect: { x: 200, y: 500, width: 100, height: 60 },
          color: '#007AFF',
          interiorColor: '#FF9500',
        })
      "
    >
      square 2
    </button>
    <button
      data-testid="add-line"
      @click="
        add({
          type: 'line',
          page: 0,
          start: { x: 50, y: 700 },
          end: { x: 150, y: 700 },
        })
      "
    >
      line
    </button>
    <button data-testid="select-all" @click="select(annotations.map((a) => a.id))">
      select all
    </button>
  </div>
</template>
