<script setup lang="ts">
/*
 * A colour menu for one colour property (border, fill or text) of the selection or the active
 * tool. The trigger shows the current colour as a swatch: split when the selection disagrees,
 * slashed for no fill. The panel is a palette grid, plus "No fill" for `fill` and "Custom…",
 * which opens a native colour input. The menu disables when nothing supports the property.
 */
import {
  COLOR_COLUMNS,
  colorMenuModel,
  focusInitialMenuItem,
  handleMenuKeys,
  menuItems,
  type ColorProperty,
} from '@inkbar/core/dom'
import { Check } from '@inkbar/icons'
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
  ToolbarButton,
} from 'reka-ui'
import { computed, defineComponent, ref, watch } from 'vue'

import { useToolStyle } from '../composables/useToolStyle'

import InkIcon from './InkIcon.vue'

import type { StyleGroup } from '@inkbar/core'

defineOptions({ inheritAttrs: false })

/** Stands in for the toolbar item when the menu is nested in another panel. */
const PassThrough = defineComponent({
  inheritAttrs: false,
  setup:
    (_, { slots }) =>
    () =>
      slots.default?.(),
})

const props = defineProps<{
  /** The colour this menu sets. */
  property: ColorProperty
  /** Accessible name; defaults to "Border colour", "Fill colour" or "Text colour". */
  label?: string
  /**
   * Renders the trigger outside the toolbar's roving focus, for a menu nested in another
   * panel (the text style menu's text colour).
   */
  standalone?: boolean
  /**
   * Scopes the menu to one style group: it shows and sets that group's colour whatever tool
   * is active, and recolours the selection only when it is all in the group.
   */
  group?: StyleGroup
}>()

const { current, supported, set } = useToolStyle(props.group)
const open = ref(false)
const customInput = ref<HTMLInputElement | null>(null)

const model = computed(() =>
  colorMenuModel(props.property, current.value, supported.value)
)
const name = computed(() => props.label ?? model.value.label)
const trigger = computed(() => model.value.trigger)

// The menu closes when the control disables (the selection cleared while it was open).
watch(
  () => model.value.enabled,
  (enabled) => {
    if (!enabled) open.value = false
  }
)

/** ArrowDown opens on the first item; a click opens on the checked one. */
let focusFirst = false
function onTriggerKeydown(e: KeyboardEvent): void {
  if (e.key !== 'ArrowDown' || e.defaultPrevented || open.value || !model.value.enabled)
    return
  e.preventDefault()
  focusFirst = true
  open.value = true
}

function onOpenAutoFocus(e: Event): void {
  e.preventDefault()
  // One menu is open at a time.
  const menu = document.querySelector(
    `[data-ink-menu="color-${props.property}"] [role="menu"]`
  )
  if (menu) {
    if (focusFirst) menuItems(menu)[0]?.focus({ preventScroll: true })
    else focusInitialMenuItem(menu)
  }
  focusFirst = false
}

// Reka's typed props stop at its own; ARIA goes through bound objects.
const triggerAttrs = computed(() => ({
  'aria-label': name.value,
  title: name.value,
  'aria-haspopup': 'menu' as const,
  onKeydown: onTriggerKeydown,
  'data-mixed': model.value.mixed ? '' : undefined,
}))
const menuAttrs = computed(() => ({ 'aria-label': name.value }))
const innerAttrs = computed(() => ({
  role: 'menu',
  'aria-label': name.value,
  onKeydown: (e: KeyboardEvent) => handleMenuKeys(e, e.currentTarget as HTMLElement),
}))
</script>

<template>
  <PopoverRoot v-model:open="open">
    <component :is="standalone ? PassThrough : ToolbarButton" as-child>
      <PopoverTrigger as-child>
        <button
          type="button"
          class="ink-menu-trigger ink-color-menu"
          :data-ink-color-menu="property"
          :data-state="open ? 'open' : 'closed'"
          :disabled="!model.enabled"
          v-bind="{ ...$attrs, ...triggerAttrs }"
        >
          <slot>
            <span
              class="ink-swatch"
              data-ink-swatch
              aria-hidden="true"
              :data-property="property"
              :data-kind="trigger.kind"
              :data-color="trigger.kind === 'color' ? trigger.color : undefined"
              :style="
                trigger.kind === 'color' ? { '--ink-swatch': trigger.color } : undefined
              "
            />
          </slot>
        </button>
      </PopoverTrigger>
    </component>
    <PopoverPortal>
      <PopoverContent
        class="ink-select-content ink-menu-content"
        data-ink-select-content
        :data-ink-menu="`color-${property}`"
        side="bottom"
        align="start"
        :side-offset="4"
        :collision-padding="8"
        v-bind="menuAttrs"
        @open-auto-focus="onOpenAutoFocus"
      >
        <div v-bind="innerAttrs">
          <button
            v-if="model.noFill"
            type="button"
            role="menuitemradio"
            class="ink-select-item ink-menu-item"
            data-ink-select-item
            tabindex="-1"
            :aria-checked="model.noFill.checked"
            :data-state="model.noFill.checked ? 'checked' : 'unchecked'"
            @click="set(model.noFill.patch)"
          >
            No fill
            <span v-if="model.noFill.checked" class="ink-select-indicator">
              <InkIcon :icon="Check" :size="16" />
            </span>
          </button>
          <div
            role="group"
            aria-label="Colours"
            class="ink-color-grid"
            :data-ink-menu-columns="COLOR_COLUMNS"
          >
            <button
              v-for="sw in model.swatches"
              :key="sw.key"
              type="button"
              role="menuitemradio"
              class="ink-swatch-item"
              tabindex="-1"
              :aria-label="sw.label"
              :aria-checked="sw.checked"
              :data-state="sw.checked ? 'checked' : 'unchecked'"
              :style="{ '--ink-swatch': sw.color }"
              @click="set(sw.patch)"
            />
          </div>
          <button
            type="button"
            role="menuitem"
            class="ink-select-item ink-menu-item"
            data-ink-select-item
            tabindex="-1"
            @click="customInput?.click()"
          >
            Custom…
          </button>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
  <input
    ref="customInput"
    type="color"
    class="ink-color-input"
    aria-label="Custom colour"
    :data-ink-color-input="property"
    tabindex="-1"
    :value="model.customValue.toLowerCase()"
    @change="set(model.custom(($event.target as HTMLInputElement).value))"
  />
</template>
