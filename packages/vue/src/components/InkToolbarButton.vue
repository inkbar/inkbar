<script setup lang="ts">
/*
 * Your own button in an `InkToolbar`. It joins the toolbar's arrow-key focus and takes the
 * theme's toolbar button styles; what it shows and does is up to you. Button attributes and
 * listeners, such as `aria-label` and `@click`, pass through to the button.
 */
import { ToolbarButton } from 'reka-ui'

import type { ButtonHTMLAttributes } from 'vue'

interface InkToolbarButtonProps extends /* @vue-ignore */ ButtonHTMLAttributes {
  asChild?: boolean
  disabled?: boolean
}

withDefaults(defineProps<InkToolbarButtonProps>(), { asChild: false, disabled: false })
// Reka's typed props stop at its own; plain attributes go through a bound object.
const attrs = { type: 'button' }
</script>

<template>
  <ToolbarButton
    :as-child="asChild"
    :disabled="disabled"
    class="ink-toolbar-button"
    data-ink-toolbar-button
    v-bind="attrs"
  >
    <slot />
  </ToolbarButton>
</template>
