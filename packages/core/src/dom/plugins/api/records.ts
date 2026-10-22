/*
 * A handle on one of a plugin's record stores that follows the open document, so a plugin
 * reads and writes its records without a null check. With no document open it reads empty and
 * its writes do nothing.
 */
import { derived, type Readable } from '../../../model/readable'

import type { InkDocument } from '../../../model/document'
import type { RecordBase, RecordStore } from '../../../model/records'

export interface Records<T extends RecordBase> {
  /** The open document's records; `[]` while none is open. Emits when the document changes. */
  readonly list: Readable<readonly T[]>
  all(): readonly T[]
  find(id: string): T | undefined
  has(id: string): boolean
  /** Records whose fields equal (===) every field of `match`, or that pass it. */
  where(match: Partial<T> | ((record: T) => boolean)): T[]
  /**
   * Returns the stored record, or `undefined` with no document open. Throws
   * `InkError('DuplicateId')` when the id is taken; `addMissing` skips taken ids.
   *
   * Every write is one undo step, and `plugin.batch` makes several one step. A write after an
   * `await` goes to whatever document is open then: inside a command, write through `in(doc)`.
   */
  add(record: T): T | undefined
  /** Adds the records whose ids are not present yet, in one undo step; returns those added. */
  addMissing(records: readonly T[]): T[]
  update(id: string, patch: Partial<Omit<T, 'id'>>): T | undefined
  remove(id: string): T | undefined
  /**
   * The same handle bound to `doc`'s store, as it is when called. Empty and inert once `doc`
   * closes, and from the start when `doc` is not the open document.
   */
  in(doc: InkDocument): Records<T>
  /** The underlying store, or null; for anything the handle lacks. */
  store(): RecordStore<T> | null
}

const EMPTY: readonly never[] = Object.freeze([])

/** The list of whichever store `source` holds, `[]` for none; emits on swaps and changes. */
function listOf<T extends RecordBase>(
  source: Readable<RecordStore<T> | null>
): Readable<readonly T[]> {
  const read = (store: RecordStore<T> | null) => store?.list.get() ?? EMPTY
  return {
    get: () => read(source.get()),
    subscribe(fn) {
      let last = read(source.get())
      let stopList: (() => void) | undefined
      const emit = (next: readonly T[]) => {
        // A swap passes through null (`[]`) to the next store's list: one emit when both are empty.
        if (Object.is(next, last) || (next.length === 0 && last.length === 0)) return
        last = next
        fn(next)
      }
      const follow = (store: RecordStore<T> | null) => {
        stopList?.()
        stopList = store?.list.subscribe(emit)
        emit(read(store))
      }
      follow(source.get())
      const stopSource = source.subscribe(follow)
      return () => {
        stopSource()
        stopList?.()
      }
    },
  }
}

function matches<T extends RecordBase>(record: T, match: Partial<T>): boolean {
  return Object.entries(match).every(
    ([k, v]) => (record as Record<string, unknown>)[k] === v
  )
}

export interface RecordsDeps {
  /** The plugin's `history.batch`. */
  batch(fn: () => void): void
  /**
   * The document the plugin's stores belong to now, or null. Not `ctx.document`, which changes
   * before the host swaps the stores.
   */
  storesDocument(): InkDocument | null
}

/**
 * Builds a handle over `source`, a plugin store from `ctx.store`. Every call reads the store
 * `source` holds then.
 */
export function createRecords<T extends RecordBase>(
  deps: RecordsDeps,
  source: Readable<RecordStore<T> | null>,
  /** The handle `in` binds from: the unbound store, whatever this handle is bound to. */
  base: Readable<RecordStore<T> | null> = source
): Records<T> {
  const current = () => source.get()
  const all = () => current()?.list.get() ?? EMPTY
  return {
    list: listOf(source),
    all,
    find: (id) => current()?.get(id),
    has: (id) => current()?.get(id) !== undefined,
    where: (match) =>
      all().filter(typeof match === 'function' ? match : (r) => matches(r, match)),
    add: (record) => current()?.add(record),
    addMissing(records) {
      const store = current()
      if (!store) return []
      const added: T[] = []
      deps.batch(() => {
        for (const record of records)
          if (!store.get(record.id)) added.push(store.add(record))
      })
      return added
    },
    update: (id, patch) => current()?.update(id, patch),
    remove: (id) => current()?.remove(id),
    in(doc) {
      // Captured now: the store only while `doc` is open, and that store only while it lasts
      // (closing `doc` swaps it for null or the next document's store).
      const captured = deps.storesDocument() === doc ? base.get() : null
      const bound = derived(base, (store) => (store && store === captured ? store : null))
      return createRecords(deps, bound, base)
    },
    store: current,
  }
}
