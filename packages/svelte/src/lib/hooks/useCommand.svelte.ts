import { InkError } from '@inkbar/core'

import { useInkContext } from '../context.js'
import { useReadable } from '../use-readable.svelte.js'

import type { IconNode } from '@inkbar/icons'

export interface CommandHandle {
  /** Runs the command; does nothing while it is busy or disabled. Never rejects. */
  run(): Promise<void>
  /** A ready document (or the plugin's own condition), and not busy. */
  readonly enabled: boolean
  readonly busy: boolean
  /** The command's progress or result message, `''` without one. */
  readonly status: string
  readonly label: string
  readonly icon: IconNode | undefined
}

/**
 * A plugin command by its namespaced id (`sandbox.suggest`), for hosts building their own
 * control. Throws `InkError('UnknownCommand')` for an id no plugin passed to InkRoot registered.
 * The id is read once: a different command is a different component.
 */
export function useCommand(id: string): CommandHandle {
  const command = useInkContext('useCommand()').pluginHost.command(id)
  if (!command)
    throw new InkError('UnknownCommand', `No plugin registered a command ${id}`, { id })
  const enabled = useReadable(() => command.enabled, false)
  const busy = useReadable(() => command.busy, false)
  const status = useReadable(() => command.status, '')
  return {
    run: () => command.run(),
    get enabled() {
      return enabled.current
    },
    get busy() {
      return busy.current
    },
    get status() {
      return status.current
    },
    label: command.label,
    icon: command.icon,
  }
}
