import { InkError } from '@inkbar/core'

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
  label: string
  icon: IconNode | undefined
}

/**
 * A plugin command by its namespaced id (`sandbox.suggest`), for hosts building their own
 * control. Throws `InkError('UnknownCommand')` for an id no plugin passed to InkRoot registered.
 */
export function useCommand(id: string): CommandHandle {
  const command = useInkContext('useCommand()').pluginHost.value?.command(id)
  if (!command)
    throw new InkError('UnknownCommand', `No plugin registered a command ${id}`, { id })
  return {
    run: () => command.run(),
    enabled: useReadable(command.enabled, false),
    busy: useReadable(command.busy, false),
    status: useReadable(command.status, ''),
    label: command.label,
    icon: command.icon,
  }
}
