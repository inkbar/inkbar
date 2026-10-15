<script setup lang="ts">
import { ZOOM_LEVELS } from '@inkbar/core/dom'
import { Check, ChevronDown } from '@inkbar/icons'
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import { computed } from 'vue'

import { useZoom } from '../composables/useZoom'

import InkIcon from './InkIcon.vue'

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

function onChange(v: unknown): void {
  if (typeof v !== 'string' || v === value.value) return
  const next: ZoomValue =
    v === 'fit-width' || v === 'fit-page' ? v : Number(v.replace(CUSTOM, ''))
  setZoom(next)
}

const FITS = [
  { value: 'fit-width', label: 'Fit width' },
  { value: 'fit-page', label: 'Fit page' },
]
// Reka's typed props stop at its own; ARIA goes through a bound object.
const triggerAttrs = { 'aria-label': 'Zoom' }
const percent = (z: number) => `${Math.round(z * 100)}%`
/** The levels, with a custom zoom in its place among them. */
const levels = computed(() => {
  const list = ZOOM_LEVELS.map((l) => ({ z: l, value: String(l), label: percent(l) }))
  const c = custom.value
  if (c !== null) list.push({ z: c, value: `${CUSTOM}${c}`, label: percent(scale.value) })
  return list.sort((a, b) => a.z - b.z)
})
</script>

<template>
  <SelectRoot :model-value="value" @update:model-value="onChange">
    <SelectTrigger
      class="ink-zoom-select ink-select-trigger"
      data-ink-zoom-select
      v-bind="triggerAttrs"
    >
      <SelectValue class="ink-select-value" />
      <SelectIcon class="ink-select-icon">
        <InkIcon :icon="ChevronDown" :size="16" />
      </SelectIcon>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        class="ink-select-content"
        data-ink-select-content
        position="popper"
        side="top"
        :side-offset="4"
      >
        <SelectViewport>
          <SelectItem
            v-for="o in FITS"
            :key="o.value"
            :value="o.value"
            class="ink-select-item"
            data-ink-select-item
          >
            <SelectItemText>{{ o.label }}</SelectItemText>
            <SelectItemIndicator class="ink-select-indicator">
              <InkIcon :icon="Check" :size="16" />
            </SelectItemIndicator>
          </SelectItem>
          <SelectSeparator class="ink-select-separator" />
          <SelectItem
            v-for="o in levels"
            :key="o.value"
            :value="o.value"
            class="ink-select-item"
            data-ink-select-item
          >
            <SelectItemText>{{ o.label }}</SelectItemText>
            <SelectItemIndicator class="ink-select-indicator">
              <InkIcon :icon="Check" :size="16" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
