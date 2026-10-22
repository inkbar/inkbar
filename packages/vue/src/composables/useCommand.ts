import { unknownCommand } from '@inkbar/core/dom'
import { computed, watch } from 'vue'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { IconNode } from '@inkbar/icons'
import type { Ref } from 'vue'

export interface CommandHandle {
  /** Runs the command; does nothing while it is busy or disabled. Never rejects. */
  run(): Promise<void>
  /** A ready document (or the plugin's own condition), and not busy. */
  enabled: Readonly<Ref<boolean>>
  busy: Readonly<Ref<boolean>>
  /** The command's progress or result message, `''` without one. */
  status: Readonly<Ref<string>>
  /** `''` until the plugins are set up. */
  label: Readonly<Ref<string>>
  icon: Readonly<Ref<IconNode | undefined>>
}

/**
 * A plugin command by its namespaced id (`sandbox.suggest`), for hosts building their own
 * control. Plugins are set up once InkRoot has mounted, so until then (and on the server) the
 * command is disabled with no label; it fills in then. Once they are set up, an id no plugin
 * passed to InkRoot registered stays that way, and logs `InkError('UnknownCommand')` to the
 * console once.
 */
export function useCommand(id: string): CommandHandle {
  const host = useInkContext('useCommand()').pluginHost
  const command = computed(() => host.value?.command(id))
  watch(
    host,
    (set) => {
      if (set && !set.command(id))
        console.error(unknownCommand(id, [...set.commands.keys()]))
    },
    { immediate: true }
  )
  return {
    run: async () => command.value?.run(),
    enabled: useReadable(() => command.value?.enabled, false),
    busy: useReadable(() => command.value?.busy, false),
    status: useReadable(() => command.value?.status, ''),
    label: computed(() => command.value?.label ?? ''),
    icon: computed(() => command.value?.icon),
  }
}
