<script setup lang="ts">
/*
 * An icon from `@inkbar/icons`, hidden from assistive technology: the control it sits in
 * carries the name. The theme sizes it with `--ink-icon-size`.
 */
import { ICON_ATTRIBUTES } from '@inkbar/icons'

import type { IconNode } from '@inkbar/icons'

withDefaults(defineProps<{ icon: IconNode; size?: number }>(), { size: 18 })
</script>

<template>
  <svg
    v-bind="ICON_ATTRIBUTES"
    :width="size"
    :height="size"
    class="ink-icon"
    aria-hidden="true"
  >
    <component :is="tag" v-for="([tag, attrs], i) in icon" :key="i" v-bind="attrs" />
  </svg>
</template>
