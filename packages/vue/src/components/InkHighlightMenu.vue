<script setup lang="ts">
/*
 * A split button for the highlight tool. The main part activates the tool with the current
 * markup kind and draws that kind's icon; the chevron opens a menu of the four kinds plus
 * the markup colour. Choosing a kind switches to the tool with it. The colour is a nested
 * `InkColorMenu` scoped to the `markup` style group, so it works whatever tool is active.
 */
import {
  focusInitialMenuItem,
  handleMenuKeys,
  highlightMenuModel,
  MARKUP_ICONS,
  MARKUP_KINDS,
  menuItems,
  type HighlightOptions,
  type MarkupKind,
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

import InkColorMenu from './InkColorMenu.vue'
import InkIcon from './InkIcon.vue'

const { tool, setTool } = useTool()
const { options, setOptions } = useToolOptions<HighlightOptions>('highlight')
const open = ref(false)

const model = computed(() => highlightMenuModel(options.value, MARKUP_KINDS))
const active = computed(() => tool.value === 'highlight')
const icon = computed(() => MARKUP_ICONS[model.value.kind])

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
  // One highlight menu is open at a time.
  const menu = document.querySelector('[data-ink-menu="highlight"] [role="menu"]')
  if (menu) {
    if (focusFirst) menuItems(menu)[0]?.focus({ preventScroll: true })
    else focusInitialMenuItem(menu)
  }
  focusFirst = false
}

function choose(kind: MarkupKind): void {
  setOptions({ kind })
  setTool('highlight')
  open.value = false
}

// Reka's typed props stop at its own; ARIA and listeners go through bound objects.
const mainAttrs = computed(() => ({
  'aria-pressed': String(active.value),
  'aria-label': model.value.label,
  title: model.value.label,
  onClick: () => setTool('highlight'),
}))
const triggerAttrs = {
  'aria-label': 'Choose highlight',
  title: 'Choose highlight',
  'aria-haspopup': 'menu' as const,
  onKeydown: onTriggerKeydown,
}
const menuAttrs = { 'aria-label': 'Highlights' }
/** The colour trigger is an item of this menu, reached with the arrow keys. */
const colourAttrs = { role: 'menuitem', tabindex: -1 }
const innerAttrs = {
  role: 'menu',
  'aria-label': 'Highlights',
  // Capture, so the arrow keys move on from the colour item before its own ArrowDown
  // opens the nested menu.
  onKeydownCapture: (e: KeyboardEvent) =>
    handleMenuKeys(e, e.currentTarget as HTMLElement),
}
</script>

<template>
  <div
    role="group"
    aria-label="Highlight"
    class="ink-split-button ink-highlight-menu"
    data-ink-highlight-menu
  >
    <ToolbarButton
      class="ink-tool-button ink-highlight-button"
      data-ink-tool-button
      data-ink-highlight-button
      data-tool="highlight"
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
            class="ink-menu-trigger ink-highlight-menu-trigger"
            data-ink-highlight-menu-trigger
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
          data-ink-menu="highlight"
          side="bottom"
          align="start"
          :side-offset="4"
          :collision-padding="8"
          v-bind="menuAttrs"
          @open-auto-focus="onOpenAutoFocus"
        >
          <div v-bind="innerAttrs">
            <div role="group" aria-label="Kinds" class="ink-highlight-kinds">
              <button
                v-for="item in model.items"
                :key="item.kind"
                type="button"
                role="menuitemradio"
                class="ink-select-item ink-menu-item ink-highlight-item"
                data-ink-select-item
                tabindex="-1"
                :data-key="item.kind"
                :aria-checked="item.checked"
                :data-state="item.checked ? 'checked' : 'unchecked'"
                @click="choose(item.kind)"
              >
                <InkIcon :icon="MARKUP_ICONS[item.kind]" :size="16" />
                {{ item.label }}
              </button>
            </div>
            <div role="separator" class="ink-select-separator" />
            <div role="group" aria-label="Colour" class="ink-highlight-colour">
              <span class="ink-highlight-colour-label" aria-hidden="true">Colour</span>
              <InkColorMenu
                property="border"
                group="markup"
                label="Highlight colour"
                standalone
                v-bind="colourAttrs"
              />
            </div>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </div>
</template>
