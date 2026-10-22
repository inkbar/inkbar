/*
 * `plugin.command`: a command whose run gets the document it started on and a signal that aborts
 * when that document goes away, and whose result or failure becomes its status message.
 */
import { isInkError } from '../../../model/errors'
import { readonly, writable } from '../../../model/readable'

import type { InkDocument } from '../../../model/document'
import type { Readable } from '../../../model/readable'
import type { Command, PluginContext } from '../define'
import type { IconNode } from '@inkbar/icons'

export interface CommandOptions {
  icon?: IconNode
  /** Default: a document is open and ready. */
  enabled?: Readable<boolean>
  /** The status after a failure. Default: "Something went wrong." */
  errorStatus?: string
}

export type CommandRun = (run: {
  /** The document open when the command started. */
  doc: InkDocument
  /** Aborts when that document closes or another opens. */
  signal: AbortSignal
}) => string | void | Promise<string | void>

const DEFAULT_ERROR_STATUS = 'Something went wrong.'

/** A failure that is the run being cancelled, not a bug: not logged, no error status. */
function isCancellation(error: unknown): boolean {
  if (isInkError(error) && error.code === 'DocumentDestroyed') return true
  return error instanceof Error && error.name === 'AbortError'
}

export function createCommand(
  ctx: PluginContext,
  id: string,
  label: string,
  run: CommandRun,
  opts: CommandOptions = {}
): Command {
  const status = writable('')
  let controller: AbortController | null = null

  // The status belongs to one document; a run in flight is cancelled when that document closes,
  // another opens or the host is destroyed.
  ctx.onDocument(() => () => {
    controller?.abort()
    status.set('')
  })

  return ctx.commands.add({
    id,
    label,
    ...(opts.icon && { icon: opts.icon }),
    ...(opts.enabled && { enabled: opts.enabled }),
    status: readonly(status),
    async run() {
      const doc = ctx.document.get()
      if (!doc) return
      const own = new AbortController()
      controller = own
      status.set('')
      try {
        const result = await run({ doc, signal: own.signal })
        if (!own.signal.aborted) status.set(result ?? '')
      } catch (error) {
        if (own.signal.aborted || isCancellation(error)) return
        // Handled here, so the registry's own logging never sees it.
        console.error(error)
        status.set(opts.errorStatus ?? DEFAULT_ERROR_STATUS)
      } finally {
        if (controller === own) controller = null
      }
    },
  })
}
