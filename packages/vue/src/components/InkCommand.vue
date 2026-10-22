<script setup lang="ts">
/*
 * A plugin command as a toolbar button with its status beside it: the markup of core's
 * `createCommandButton`, so the theme styles both alike. The button is named by the command's
 * label, disabled while the command is, and `aria-busy` while it runs; the status is a live
 * region. A command without an icon shows its label as the button's text. Until the plugins
 * are set up (once InkRoot has mounted; never on the server) the button is disabled. After
 * that, an id no plugin registered throws `InkError('UnknownCommand')`.
 */
import { ToolbarButton } from 'reka-ui'
import { computed } from 'vue'

import { useCommand } from '../composables/useCommand'

import InkIcon from './InkIcon.vue'

const props = withDefaults(defineProps<{ id: string; asChild?: boolean }>(), {
  asChild: false,
})

// The id is read once, as `useCommand` does: a different command is a different component.
const command = useCommand(props.id)
const { enabled, busy, status } = command
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const attrs = computed(() => ({
  type: 'button',
  // No label until the plugins are set up: no empty name either.
  'aria-label': command.label || undefined,
  title: command.label || undefined,
  'aria-busy': String(busy.value),
  onClick: () => void command.run(),
}))
</script>

<template>
  <div class="ink-command">
    <ToolbarButton
      :as-child="asChild"
      :disabled="!enabled"
      :data-command="id"
      v-bind="attrs"
    >
      <slot :label="command.label" :busy="busy">
        <InkIcon v-if="command.icon" :icon="command.icon" />
        <template v-else>{{ command.label }}</template>
      </slot>
    </ToolbarButton>
    <span class="ink-command-status" role="status">{{ status }}</span>
  </div>
</template>
