<script setup lang="ts">
/*
 * A split button for the shape tool. The main part activates the tool with the current
 * kind and draws that kind's icon; the chevron opens a two-column grid of kinds. Choosing a
 * kind switches to the tool with it.
 */
import {
  focusInitialMenuItem,
  handleMenuKeys,
  menuItems,
  SHAPE_COLUMNS,
  SHAPE_ICONS,
  SHAPE_KINDS,
  shapeMenuModel,
  type ShapeKind,
  type ShapeOptions,
} from '@inkbar/core/dom'
import { ChevronDown } from '@inkbar/icons'
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
  ToolbarButton,
} from 'reka-ui'
import { computed, ref } from 'vue'

import { useTool } from '../composables/useTool'
import { useToolOptions } from '../composables/useToolOptions'

import InkIcon from './InkIcon.vue'

const { tool, setTool } = useTool()
const { options, setOptions } = useToolOptions<ShapeOptions>('shape')
const open = ref(false)

const model = computed(() => shapeMenuModel(options.value, SHAPE_KINDS))
const active = computed(() => tool.value === 'shape')
const icon = computed(() => SHAPE_ICONS[model.value.kind])

/** ArrowDown opens on the first item; a click opens on the checked one. */
let focusFirst = false
function onTriggerKeydown(e: KeyboardEvent): void {
  if (e.key !== 'ArrowDown' || e.defaultPrevented || open.value) return
  e.preventDefault()
  focusFirst = true
  open.value = true
}

function onOpenAutoFocus(e: Event): void {
  e.preventDefault()
  // One menu is open at a time.
  const menu = document.querySelector('[data-ink-menu="shape"] [role="menu"]')
  if (menu) {
    if (focusFirst) menuItems(menu)[0]?.focus({ preventScroll: true })
    else focusInitialMenuItem(menu)
  }
  focusFirst = false
}

function choose(kind: ShapeKind): void {
  setOptions({ kind })
  setTool('shape')
  open.value = false
}

// Reka's typed props stop at its own; ARIA and listeners go through bound objects.
const mainAttrs = computed(() => ({
  'aria-pressed': String(active.value),
  'aria-label': model.value.label,
  title: model.value.label,
  onClick: () => setTool('shape'),
}))
const triggerAttrs = {
  'aria-label': 'Choose shape',
  title: 'Choose shape',
  'aria-haspopup': 'menu' as const,
  onKeydown: onTriggerKeydown,
}
const menuAttrs = { 'aria-label': 'Shapes' }
const innerAttrs = {
  role: 'menu',
  'aria-label': 'Shapes',
  onKeydown: (e: KeyboardEvent) => handleMenuKeys(e, e.currentTarget as HTMLElement),
}
</script>

<template>
  <div
    role="group"
    aria-label="Shape"
    class="ink-split-button ink-shape-menu"
    data-ink-shape-menu
  >
    <ToolbarButton
      class="ink-tool-button ink-shape-button"
      data-ink-tool-button
      data-ink-shape-button
      data-tool="shape"
      :data-kind="model.kind"
      :data-state="active ? 'on' : 'off'"
      v-bind="mainAttrs"
    >
      <slot :active="active" :kind="model.kind"><InkIcon :icon="icon" /></slot>
    </ToolbarButton>
    <PopoverRoot v-model:open="open">
      <ToolbarButton as-child>
        <PopoverTrigger as-child>
          <button
            type="button"
            class="ink-menu-trigger ink-shape-menu-trigger"
            data-ink-shape-menu-trigger
            :data-state="open ? 'open' : 'closed'"
            v-bind="triggerAttrs"
          >
            <InkIcon :icon="ChevronDown" />
          </button>
        </PopoverTrigger>
      </ToolbarButton>
      <PopoverPortal>
        <PopoverContent
          class="ink-select-content ink-menu-content"
          data-ink-select-content
          data-ink-menu="shape"
          side="bottom"
          align="start"
          :side-offset="4"
          :collision-padding="8"
          v-bind="menuAttrs"
          @open-auto-focus="onOpenAutoFocus"
        >
          <div v-bind="innerAttrs">
            <div
              role="group"
              aria-label="Shapes"
              class="ink-shape-grid"
              :data-ink-menu-columns="SHAPE_COLUMNS"
            >
              <button
                v-for="item in model.items"
                :key="item.kind"
                type="button"
                role="menuitemradio"
                class="ink-select-item ink-menu-item ink-shape-item"
                data-ink-select-item
                tabindex="-1"
                :data-key="item.kind"
                :aria-checked="item.checked"
                :data-state="item.checked ? 'checked' : 'unchecked'"
                @click="choose(item.kind)"
              >
                <InkIcon :icon="SHAPE_ICONS[item.kind]" :size="16" />
                {{ item.label }}
              </button>
            </div>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </div>
</template>
