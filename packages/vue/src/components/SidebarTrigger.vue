<script setup lang="ts">
/*
 * A sidebar trigger's content: `createSidebar`'s markup, so the theme styles both alike. The
 * rail shows the icon alone (the trigger's `title` carries the label); tabs and stack headers
 * show the label too. The badge is hidden from assistive technology: the trigger's name has it.
 */
import { sidebarBadge, type SidebarPanelInfo } from '@inkbar/core/dom'
import { computed } from 'vue'

import InkIcon from './InkIcon.vue'

const props = defineProps<{ panel: SidebarPanelInfo; rail: boolean }>()
const badge = computed(() => sidebarBadge(props.panel.badge))
</script>

<template>
  <InkIcon v-if="panel.icon" :icon="panel.icon" />
  <span v-if="!panel.icon || !rail" class="ink-sidebar-label">{{ panel.label }}</span>
  <span class="ink-sidebar-badge" aria-hidden="true" :hidden="badge === null">{{
    badge
  }}</span>
</template>
