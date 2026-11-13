import { commandLabel, unknownCommand } from '@inkbar/core/dom'
import { useCallback, useEffect, useMemo, useRef } from 'react'

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
 * passed to InkRoot registered stays that way, and logs `InkError('UnknownCommand')` to the
 * console once.
 */
export function useCommand(id: string): CommandHandle {
  const { pluginHost, messages } = useInkContext('useCommand()')
  const command = pluginHost?.command(id)
  const logged = useRef(false)
  useEffect(() => {
    if (!pluginHost || command || logged.current) return
    logged.current = true
    console.error(unknownCommand(id, [...pluginHost.commands.keys()]))
  }, [pluginHost, command, id])
  const enabled = useReadable(command?.enabled, false)
  const busy = useReadable(command?.busy, false)
  const status = useReadable(command?.status, '')
  const run = useCallback(async () => command?.run(), [command])
  // Read again on new messages, so a label function follows them; the id when it is empty.
  // Memoised, so an empty label warns once per change, not once per render.
  const label = useMemo(
    () => (command ? commandLabel(command) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `messages` re-reads the label
    [command, messages]
  )
  return {
    run,
    enabled,
    busy,
    status,
    label,
    icon: command?.icon,
  }
}
