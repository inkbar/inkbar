import { InkError, isInkError } from '../../model/errors'
import { readonly, writable, type Readable } from '../../model/readable'

import type { Command, CommandSpec } from './define'
import type { InkDocument } from '../../model/document'

export interface CommandRegistry {
  readonly commands: ReadonlyMap<string, Command>
  /**
   * Registers `spec` as `<plugin>.<spec.id>`. Throws `InkError('DuplicateId')` when taken and
   * `InkError('InvalidCommandLabel')` for an empty label.
   */
  add(plugin: string, spec: CommandSpec): Command
}

const EMPTY: Readable<string> = { get: () => '', subscribe: () => () => {} }

/**
 * A boolean readable computed from `sources`. Like `derived`, it subscribes to the sources only
 * while it has subscribers of its own; `watch` re-reads them, so a source can be swapped while
 * subscribed (a document's status when the document changes).
 */
function computed(
  compute: () => boolean,
  watch: (changed: () => void) => () => void
): Readable<boolean> {
  const subs = new Set<(v: boolean) => void>()
  let cached = false
  let stop: (() => void) | undefined
  const changed = () => {
    const next = compute()
    if (next === cached) return
    cached = next
    for (const sub of [...subs]) sub(next)
  }
  return {
    get: () => (stop ? cached : compute()),
    subscribe(sub) {
      if (!stop) {
        cached = compute()
        stop = watch(changed)
      }
      subs.add(sub)
      return () => {
        if (!subs.delete(sub) || subs.size > 0) return
        stop?.()
        stop = undefined
      }
    },
  }
}

/** True while `document` holds a document whose status is ready. */
function documentReady(document: Readable<InkDocument | null>): Readable<boolean> {
  return computed(
    () => document.get()?.status.get().state === 'ready',
    (changed) => {
      let stopStatus: (() => void) | undefined
      const follow = (doc: InkDocument | null) => {
        stopStatus?.()
        stopStatus = doc?.status.subscribe(changed)
        changed()
      }
      const stopDocument = document.subscribe(follow)
      follow(document.get())
      return () => {
        stopDocument()
        stopStatus?.()
      }
    }
  )
}

/**
 * Plugin commands by namespaced id. A command is busy from `run()` until the promise its spec
 * returned settles, and is disabled meanwhile, so a double click runs it once.
 */
export function createCommandRegistry(opts: {
  document: Readable<InkDocument | null>
}): CommandRegistry {
  const commands = new Map<string, Command>()
  const ready = documentReady(opts.document)

  return {
    commands,
    add(plugin, spec) {
      const id = `${plugin}.${spec.id}`
      if (commands.has(id))
        throw new InkError('DuplicateId', `A command with id ${id} already exists`, {
          id,
        })
      // The label names the command's button; without one it would have no accessible name.
      if (!spec.label.trim())
        throw new InkError('InvalidCommandLabel', `Command ${id} needs a label`, { id })
      const busy = writable(false)
      const allowed = spec.enabled ?? ready
      const enabled = computed(
        () => allowed.get() && !busy.get(),
        (changed) => {
          const stops = [allowed.subscribe(changed), busy.subscribe(changed)]
          return () => {
            for (const stop of stops) stop()
          }
        }
      )
      const command: Command = {
        id,
        label: spec.label,
        icon: spec.icon,
        enabled,
        busy: readonly(busy),
        status: spec.status ?? EMPTY,
        async run() {
          if (!enabled.get()) return
          busy.set(true)
          try {
            await spec.run()
          } catch (error) {
            // The document closing under a running command is expected, not a failure.
            if (!(isInkError(error) && error.code === 'DocumentDestroyed'))
              console.error(error)
          } finally {
            busy.set(false)
          }
        },
      }
      commands.set(id, command)
      return command
    },
  }
}
