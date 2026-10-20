<script setup lang="ts">
// Adds lines and a square and selects them, so the menu has something to style.
import { computed } from 'vue'

import { useAnnotations } from '../../src/composables/useAnnotations'
import { useSelection } from '../../src/composables/useSelection'

const { annotations, add } = useAnnotations()
const { select } = useSelection()

const line = (width: number, y: number) =>
  add({ type: 'line', page: 0, start: { x: 50, y }, end: { x: 150, y }, width })
const widths = computed(() =>
  annotations.value.map((a) => ('width' in a ? a.width : '')).join(',')
)
const dashes = computed(() =>
  annotations.value
    .map((a) => ('dashes' in a && a.dashes ? a.dashes.join('/') : '-'))
    .join(',')
)
const tails = computed(() =>
  annotations.value.map((a) => ('tail' in a && a.tail ? a.tail : '-')).join(',')
)
</script>

<template>
  <div
    data-testid="probe"
    :data-widths="widths"
    :data-dashes="dashes"
    :data-tails="tails"
  >
    <button data-testid="add-line-1" @click="line(1, 700)">line 1</button>
    <button data-testid="add-line-3" @click="line(3, 650)">line 3</button>
    <button
      data-testid="add-line-unknown"
      @click="
        add({
          type: 'line',
          page: 0,
          start: { x: 50, y: 600 },
          end: { x: 150, y: 600 },
          head: 'Foo_1',
          tail: 'Square',
        })
      "
    >
      line with an unknown ending
    </button>
    <button
      data-testid="add-square"
      @click="
        add({ type: 'square', page: 0, rect: { x: 50, y: 500, width: 100, height: 60 } })
      "
    >
      square
    </button>
    <button data-testid="select-all" @click="select(annotations.map((a) => a.id))">
      select all
    </button>
    <button data-testid="select-none" @click="select([])">select none</button>
  </div>
</template>
