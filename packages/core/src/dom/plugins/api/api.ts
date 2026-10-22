/*
 * The API a `definePlugin(id, setup)` plugin receives: its context plus shorthands for the
 * common jobs, each built on the public context alone.
 */
import { createCommand, type CommandOptions, type CommandRun } from './command'
import { createMarks, type MarksHandle, type MarksOptions } from './marks'
import { createRecords, type Records } from './records'

import type { InkDocument } from '../../../model/document'
import type { RecordBase } from '../../../model/records'
import type { Command, PluginContext, PluginStoreOptions } from '../define'

export interface PluginOptions {
  /** Store options by records name; `plugin.records(name)` picks them up. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each name has its own record type
  records?: Record<string, PluginStoreOptions<any>>
}

export interface PluginApi extends PluginContext {
  /**
   * A handle on the store `<plugin>.<name>` that follows the open document. Its options are
   * `opts` when given, else the host's `options.records[name]`. Call it once per name in
   * setup and keep the handle: a second call for the same name throws `InkError('DuplicateId')`.
   */
  records<T extends RecordBase>(name: string, opts?: PluginStoreOptions<T>): Records<T>
  /** Makes everything `fn` changes one undo step: `history.batch`. */
  batch(fn: () => void): void
  /**
   * Registers `<plugin>.<id>`. `run` gets the document open when it started and a signal that
   * aborts when that document closes or another opens. A returned string becomes the command's
   * status and `undefined` clears it; a failure is logged once and sets `errorStatus` (default
   * "Something went wrong."). The status clears when the document changes.
   *
   * Inside a command, write through `records.in(doc)`.
   */
  command(id: string, label: string, run: CommandRun, opts?: CommandOptions): Command
  /**
   * Draws a `<button>` for each record that passes `where`, on page `record.page` at
   * `rect(record)`, in a layer of its own. The marks redraw when the records change; call
   * `refresh()` when they read state of your own that changed.
   */
  marks<T extends RecordBase & { page: number }>(
    records: Records<T>,
    opts: MarksOptions<T>
  ): MarksHandle
}

export function createPluginApi(ctx: PluginContext, options: PluginOptions): PluginApi {
  let storesDocument: InkDocument | null = null
  // `onDocument` runs once the stores exist and cleans up after they are destroyed.
  ctx.onDocument((doc) => {
    storesDocument = doc
    return () => {
      storesDocument = null
    }
  })
  const batch = (fn: () => void) => ctx.history.batch(fn)
  return {
    ...ctx,
    records<T extends RecordBase>(name: string, opts?: PluginStoreOptions<T>) {
      const source = ctx.store<T>(name, opts ?? options.records?.[name])
      return createRecords<T>(
        {
          batch,
          storesDocument: () => storesDocument,
          plugin: ctx.id,
          name,
          onAnnotationEdit: (fn) => ctx.onAnnotationEdit(fn),
        },
        source
      )
    },
    batch,
    command: (id, label, run, opts) => createCommand(ctx, id, label, run, opts),
    marks: (records, opts) => createMarks(ctx, records, opts),
  }
}
