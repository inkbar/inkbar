<script setup lang="ts">
import { ZOOM_LEVELS } from '@inkbar/core/dom'
import { computed } from 'vue'

import { useZoom } from '../composables/useZoom'

import type { ZoomValue } from '@inkbar/core/dom'

const CUSTOM = 'custom:'

const { zoom, scale, setZoom } = useZoom()

const level = (z: number) => ZOOM_LEVELS.find((l) => Math.abs(l - z) < 0.001)
/** A numeric zoom that is not one of the levels (zoom in and out multiply). */
const custom = computed(() =>
  typeof zoom.value === 'number' && level(zoom.value) === undefined ? zoom.value : null
)
const value = computed(() => {
  const z = zoom.value
  if (typeof z !== 'number') return z
  return custom.value === null ? String(level(z)) : `${CUSTOM}${z}`
})

function onChange(e: Event): void {
  const v = (e.target as HTMLSelectElement).value
  const next: ZoomValue =
    v === 'fit-width' || v === 'fit-page' ? v : Number(v.replace(CUSTOM, ''))
  setZoom(next)
}
</script>

<template>
  <select
    class="ink-zoom-select"
    data-ink-zoom-select
    aria-label="Zoom"
    :value="value"
    @change="onChange"
  >
    <option value="fit-width">Fit width</option>
    <option value="fit-page">Fit page</option>
    <option v-for="l in ZOOM_LEVELS" :key="l" :value="String(l)">
      {{ Math.round(l * 100) }}%
    </option>
    <option v-if="custom !== null" :value="`${CUSTOM}${custom}`">
      {{ Math.round(scale * 100) }}%
    </option>
  </select>
</template>
