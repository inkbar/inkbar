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
  /** `''` until the plugins are set up. */
  label: string
  icon: IconNode | undefined
}

/**
 * A plugin command by its namespaced id (`sandbox.suggest`), for hosts building their own
 * control. Plugins are set up once InkRoot has mounted, so until then (and on the server) the
 * command is disabled with no label; it fills in then. Once they are set up, an id no plugin
 * passed to InkRoot registered throws `InkError('UnknownCommand')`.
 */
export function useCommand(id: string): CommandHandle {
  const { pluginHost } = useInkContext('useCommand()')
  const command = pluginHost?.command(id)
  if (pluginHost && !command)
    throw new InkError('UnknownCommand', `No plugin registered a command ${id}`, { id })
  const enabled = useReadable(command?.enabled, false)
  const busy = useReadable(command?.busy, false)
  const status = useReadable(command?.status, '')
  const run = useCallback(async () => command?.run(), [command])
  return { run, enabled, busy, status, label: command?.label ?? '', icon: command?.icon }
}
