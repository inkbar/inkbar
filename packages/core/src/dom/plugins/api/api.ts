/*
 * The API a `definePlugin(id, setup)` plugin receives: its context plus shorthands for the
 * common jobs, each built on the public context alone.
 */
import { createRecords, type Records } from './records'

import type { InkDocument } from '../../../model/document'
import type { RecordBase } from '../../../model/records'
import type { PluginContext, PluginStoreOptions } from '../define'

export interface PluginOptions {
  /** Store options by records name; `plugin.records(name)` picks them up. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each name has its own record type
  records?: Record<string, PluginStoreOptions<any>>
}

export interface PluginApi extends PluginContext {
  /**
   * A handle on the store `<plugin>.<name>` that follows the open document. Its options are
   * `opts` when given, else the host's `options.records[name]`.
   */
  records<T extends RecordBase>(name: string, opts?: PluginStoreOptions<T>): Records<T>
  /** Makes everything `fn` changes one undo step: `history.batch`. */
  batch(fn: () => void): void
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
      return createRecords<T>({ batch, storesDocument: () => storesDocument }, source)
    },
    batch,
  }
}
