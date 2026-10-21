import { InkError } from '@inkbar/core'
import { useCallback } from 'react'

import { useInkContext } from '../context'
import { useReadable } from '../use-readable'

import type { IconNode } from '@inkbar/icons'

export interface CommandHandle {
  /** Runs the command; does nothing while it is busy or disabled. Never rejects. */
  run: () => Promise<void>
  /** A ready document (or the plugin's own condition), and not busy. */
  enabled: boolean
  busy: boolean
  /** The command's progress or result message, `''` without one. */
  status: string
  label: string
  icon: IconNode | undefined
}

/**
 * A plugin command by its namespaced id (`sandbox.suggest`), for hosts building their own
 * control. Throws `InkError('UnknownCommand')` for an id no plugin passed to InkRoot registered.
 */
export function useCommand(id: string): CommandHandle {
  const command = useInkContext('useCommand()').pluginHost.command(id)
  if (!command)
    throw new InkError('UnknownCommand', `No plugin registered a command ${id}`, { id })
  const enabled = useReadable(command.enabled, false)
  const busy = useReadable(command.busy, false)
  const status = useReadable(command.status, '')
  const run = useCallback(() => command.run(), [command])
  return { run, enabled, busy, status, label: command.label, icon: command.icon }
}
