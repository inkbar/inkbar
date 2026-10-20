<script setup lang="ts">
/*
 * Font, size, text colour, bold, italic, underline and alignment for the selected text boxes or
 * the text tool. A popover panel rather than a menu list: it holds a select, a number input
 * with a stepper, toggle buttons and a radio group, each named and operable on its own. The
 * trigger carries `data-mixed` when the selection disagrees on any of them.
 */
import { handleRadioKeys, textStyleMenuModel } from '@inkbar/core/dom'
import {
  ALargeSmall,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Minus,
  Plus,
  Underline,
} from '@inkbar/icons'
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
  ToolbarButton,
} from 'reka-ui'
import { computed, ref, watch } from 'vue'

import { useToolStyle } from '../composables/useToolStyle'
import { useInkContext } from '../context'

import InkColorMenu from './InkColorMenu.vue'
import InkIcon from './InkIcon.vue'

const { fonts } = useInkContext('InkTextStyleMenu')
const { current, supported, set } = useToolStyle()
const open = ref(false)
/** The size as typed, until it is committed with Enter or blur. */
const draft = ref<string | null>(null)

const model = computed(() =>
  textStyleMenuModel(current.value, supported.value, fonts.value)
)
const sizeShown = computed(
  () =>
    draft.value ?? (model.value.size.value === null ? '' : String(model.value.size.value))
)

const TOGGLE_ICONS = { bold: Bold, italic: Italic, underline: Underline }
const ALIGN_ICONS = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  justify: AlignJustify,
}

// The menu closes when the control disables (the selection cleared while it was open).
watch(
  () => model.value.enabled,
  (enabled) => {
    if (!enabled) open.value = false
  }
)

function onTriggerKeydown(e: KeyboardEvent): void {
  if (e.key !== 'ArrowDown' || e.defaultPrevented || open.value || !model.value.enabled)
    return
  e.preventDefault()
  open.value = true
}

function commitSize(): void {
  if (draft.value === null) return
  if (draft.value.trim() !== '') {
    const patch = model.value.size.commit(Number(draft.value))
    if (patch) set(patch)
  }
  draft.value = null
}
function nudge(direction: 1 | -1): void {
  const patch = model.value.size.nudge(direction)
  if (patch) set(patch)
  draft.value = null
}

// Reka's typed props stop at its own; ARIA goes through bound objects.
const triggerAttrs = computed(() => ({
  'aria-label': model.value.label,
  title: model.value.label,
  'aria-haspopup': 'dialog' as const,
  onKeydown: onTriggerKeydown,
  'data-mixed': model.value.mixed ? '' : undefined,
}))
const menuAttrs = computed(() => ({ 'aria-label': model.value.label }))
</script>

<template>
  <PopoverRoot v-model:open="open">
    <ToolbarButton as-child>
      <PopoverTrigger as-child>
        <button
          type="button"
          class="ink-menu-trigger ink-text-style-menu"
          data-ink-text-style-menu
          :data-state="open ? 'open' : 'closed'"
          :disabled="!model.enabled"
          v-bind="triggerAttrs"
        >
          <slot><InkIcon :icon="ALargeSmall" /></slot>
        </button>
      </PopoverTrigger>
    </ToolbarButton>
    <PopoverPortal>
      <PopoverContent
        class="ink-select-content ink-menu-content ink-text-style-content"
        data-ink-select-content
        data-ink-menu="text-style"
        side="bottom"
        align="start"
        :side-offset="4"
        :collision-padding="8"
        v-bind="menuAttrs"
      >
        <select
          class="ink-text-style-font"
          :aria-label="model.font.label"
          :value="model.font.value"
          @change="set(model.font.patch(($event.target as HTMLSelectElement).value))"
        >
          <option v-if="model.font.value === ''" value="" disabled hidden>Mixed</option>
          <option v-for="f in model.font.options" :key="f" :value="f">{{ f }}</option>
        </select>
        <div class="ink-text-style-row">
          <InkColorMenu property="textColor" standalone />
          <div class="ink-text-style-size" role="group" aria-label="Size">
            <button
              type="button"
              class="ink-text-style-button"
              aria-label="Decrease font size"
              @click="nudge(-1)"
            >
              <InkIcon :icon="Minus" :size="16" />
            </button>
            <input
              type="number"
              class="ink-text-style-input"
              :aria-label="model.size.label"
              :min="model.size.min"
              :max="model.size.max"
              :step="model.size.step"
              :value="sizeShown"
              @input="draft = ($event.target as HTMLInputElement).value"
              @blur="commitSize"
              @keydown.enter.prevent="commitSize"
            />
            <button
              type="button"
              class="ink-text-style-button"
              aria-label="Increase font size"
              @click="nudge(1)"
            >
              <InkIcon :icon="Plus" :size="16" />
            </button>
          </div>
        </div>
        <div class="ink-text-style-row" role="group" aria-label="Emphasis">
          <button
            v-for="t in model.toggles"
            :key="t.key"
            type="button"
            class="ink-text-style-button"
            :aria-label="t.label"
            :title="t.label"
            :aria-pressed="t.pressed"
            :data-state="t.pressed === true ? 'on' : 'off'"
            :data-mixed="t.pressed === 'mixed' ? '' : undefined"
            @click="set(t.patch)"
          >
            <InkIcon :icon="TOGGLE_ICONS[t.key]" :size="16" />
          </button>
        </div>
        <div
          class="ink-text-style-row"
          role="radiogroup"
          :aria-label="model.align.label"
          @keydown="handleRadioKeys($event, $event.currentTarget as HTMLElement)"
        >
          <button
            v-for="c in model.align.choices"
            :key="c.key"
            type="button"
            role="radio"
            class="ink-text-style-button"
            :aria-label="c.label"
            :title="c.label"
            :aria-checked="c.checked"
            :tabindex="c.tabStop ? 0 : -1"
            :data-state="c.checked ? 'on' : 'off'"
            @click="set(c.patch)"
          >
            <InkIcon :icon="ALIGN_ICONS[c.key]" :size="16" />
          </button>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
