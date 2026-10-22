<script setup lang="ts">
/*
 * A plugin command as a toolbar button with its status beside it: the markup of core's
 * `createCommandButton`, so the theme styles both alike. The button is named by the command's
 * label and disabled while the command is, except while it runs: then it keeps focus, with
 * `aria-busy` and `aria-disabled`, and a press does nothing. The status is a live region. A command without an icon shows its label as the button's text. Until the plugins
 * are set up (once InkRoot has mounted; never on the server) the button is disabled and
 * `aria-hidden`. An id no plugin registered stays that way and logs `InkError('UnknownCommand')`
 * to the console once.
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
const { enabled, busy, status, label, icon } = command
// Reka's typed props stop at its own; ARIA and listeners go through a bound object.
const attrs = computed(() => ({
  type: 'button',
  // No label until the plugins are set up: the disabled button stays out of the
  // accessibility tree rather than go unnamed.
  'aria-label': label.value || undefined,
  title: label.value || undefined,
  'aria-hidden': label.value ? undefined : 'true',
  'aria-busy': String(busy.value),
  // Disabled while it runs, but not `disabled`, so the button keeps focus.
  'aria-disabled': busy.value ? 'true' : undefined,
  onClick: () => void command.run(),
}))
</script>

<template>
  <div class="ink-command">
    <ToolbarButton
      :as-child="asChild"
      :disabled="!enabled && !busy"
      :data-command="id"
      v-bind="attrs"
    >
      <slot :label="label" :busy="busy">
        <InkIcon v-if="icon" :icon="icon" />
        <template v-else>{{ label }}</template>
      </slot>
    </ToolbarButton>
    <span class="ink-command-status" role="status">{{ status }}</span>
  </div>
</template>
