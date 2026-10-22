import { unknownCommand } from '@inkbar/core/dom'

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
  /** `''` until the plugins are set up. */
  readonly label: string
  readonly icon: IconNode | undefined
}

/**
 * A plugin command by its namespaced id (`sandbox.suggest`), for hosts building their own
 * control. Plugins are set up once InkRoot has mounted, so until then (and on the server) the
 * command is disabled with no label; it fills in then. Once they are set up, an id no plugin
 * passed to InkRoot registered stays that way, and logs `InkError('UnknownCommand')` to the
 * console once.
 * The id is read once: a different command is a different component.
 */
export function useCommand(id: string): CommandHandle {
  const ctx = useInkContext('useCommand()')
  const command = $derived(ctx.pluginHost?.command(id))
  let logged = false
  $effect(() => {
    const host = ctx.pluginHost
    if (!host || command || logged) return
    logged = true
    console.error(unknownCommand(id, [...host.commands.keys()]))
  })
  const enabled = useReadable(() => command?.enabled, false)
  const busy = useReadable(() => command?.busy, false)
  const status = useReadable(() => command?.status, '')
  return {
    run: async () => command?.run(),
    get enabled() {
      return enabled.current
    },
    get busy() {
      return busy.current
    },
    get status() {
      return status.current
    },
    get label() {
      return command?.label ?? ''
    },
    get icon() {
      return command?.icon
    },
  }
}
