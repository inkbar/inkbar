<script setup lang="ts">
/*
 * Line weight, solid or dashed, and arrowheads, for the selection or the active tool. Each
 * section disables when nothing selected (or no active tool) supports its props. The trigger
 * carries `data-mixed` when the selection disagrees on any of them; a section with no single
 * value shows no checkmark.
 */
import {
  focusInitialMenuItem,
  handleMenuKeys,
  lineStyleMenuModel,
} from '@inkbar/core/dom'
import { Check, Minus } from '@inkbar/icons'
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
  ToolbarButton,
} from 'reka-ui'
import { computed, ref } from 'vue'

import { useToolStyle } from '../composables/useToolStyle'

import InkIcon from './InkIcon.vue'

const { current, supported, set } = useToolStyle()
const open = ref(false)

const model = computed(() => lineStyleMenuModel(current.value, supported.value))

function onOpenAutoFocus(e: Event): void {
  e.preventDefault()
  // One menu is open at a time.
  const menu = document.querySelector('[data-ink-menu="line-style"] [role="menu"]')
  if (menu) focusInitialMenuItem(menu)
}

// Reka's typed props stop at its own; ARIA goes through bound objects.
const triggerAttrs = computed(() => ({
  'aria-label': 'Line style',
  title: 'Line style',
  'aria-haspopup': 'menu' as const,
  'data-mixed': model.value.mixed ? '' : undefined,
}))
const menuAttrs = { 'aria-label': 'Line style' }
const innerAttrs = {
  role: 'menu',
  'aria-label': 'Line style',
  onKeydown: (e: KeyboardEvent) => handleMenuKeys(e, e.currentTarget as HTMLElement),
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <ToolbarButton as-child>
      <PopoverTrigger as-child>
        <button
          type="button"
          class="ink-menu-trigger ink-line-style-menu"
          data-ink-line-style-menu
          :data-state="open ? 'open' : 'closed'"
          :disabled="!model.enabled"
          v-bind="triggerAttrs"
        >
          <slot><InkIcon :icon="Minus" /></slot>
        </button>
      </PopoverTrigger>
    </ToolbarButton>
    <PopoverPortal>
      <PopoverContent
        class="ink-select-content ink-menu-content"
        data-ink-select-content
        data-ink-menu="line-style"
        side="bottom"
        align="start"
        :side-offset="4"
        :collision-padding="8"
        v-bind="menuAttrs"
        @open-auto-focus="onOpenAutoFocus"
      >
        <div v-bind="innerAttrs">
          <div
            v-for="section in model.sections"
            :key="section.label"
            role="group"
            class="ink-menu-group"
            :aria-label="section.label"
            :aria-disabled="section.disabled || undefined"
            :data-disabled="section.disabled ? '' : undefined"
          >
            <div class="ink-menu-label" aria-hidden="true">{{ section.label }}</div>
            <button
              v-for="item in section.items"
              :key="item.key"
              type="button"
              role="menuitemradio"
              class="ink-select-item ink-menu-item"
              data-ink-select-item
              tabindex="-1"
              :aria-checked="item.checked"
              :disabled="section.disabled"
              :data-state="item.checked ? 'checked' : 'unchecked'"
              @click="set(item.patch)"
            >
              {{ item.label }}
              <span v-if="item.checked" class="ink-select-indicator">
                <InkIcon :icon="Check" :size="16" />
              </span>
            </button>
          </div>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
