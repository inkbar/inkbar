import { InkError } from './errors'
import { Emitter } from './events'
import { readonly, writable, type Readable } from './readable'

export interface RecordBase {
  readonly id: string
}

export type RecordChange<T> =
  | { kind: 'add'; record: T }
  | { kind: 'update'; id: string; before: T; after: T }
  | { kind: 'remove'; record: T }
  | { kind: 'replace'; reason: 'history' | 'reset' }

export interface RecordStore<T extends RecordBase> {
  /** The slot name the store is registered under. */
  readonly key: string
  readonly list: Readable<readonly T[]>
  get(id: string): T | undefined
  /** Returns the stored (frozen) record. Throws `InkError('DuplicateId')` when the id is taken. */
  add(record: T): T
  /** `id` cannot be patched. Returns `undefined`, emitting nothing, for an unknown id. */
  update(id: string, patch: Partial<Omit<T, 'id'>>): T | undefined
  /** Returns the removed record, or `undefined`, emitting nothing, for an unknown id. */
  remove(id: string): T | undefined
  replaceAll(list: readonly T[], reason: 'history' | 'reset'): void
  on(event: 'change', fn: (change: RecordChange<T>) => void): () => void
  destroy(): void
}

export interface RecordStoreOptions<T extends RecordBase> {
  initial?: readonly T[]
  /** Called after every change, `replace` included, with the list as it now stands. */
  onChange?: (list: readonly T[], change: RecordChange<T>) => void
}

/**
 * A keyed list of plain records. Records are frozen, so a change's `before` and `after` can be
 * kept as history entries without copying.
 */
export function createRecordStore<T extends RecordBase>(
  key: string,
  opts: RecordStoreOptions<T> = {}
): RecordStore<T> {
  const list = writable<readonly T[]>((opts.initial ?? []).map((r) => Object.freeze(r)))
  const emitter = new Emitter<{ change: RecordChange<T> }>()

  function commit(next: readonly T[], change: RecordChange<T>): void {
    list.set(next)
    emitter.emit('change', change)
    opts.onChange?.(next, change)
  }

  return {
    key,
    list: readonly(list),
    get: (id) => list.get().find((r) => r.id === id),
    add(record) {
      if (list.get().some((r) => r.id === record.id))
        throw new InkError(
          'DuplicateId',
          `A record with id ${record.id} already exists`,
          {
            key,
            id: record.id,
          }
        )
      const stored = Object.freeze(record)
      commit([...list.get(), stored], { kind: 'add', record: stored })
      return stored
    },
    update(id, patch) {
      const before = list.get().find((r) => r.id === id)
      if (!before) return undefined
      const after = Object.freeze({ ...before, ...patch, id: before.id }) as T
      commit(
        list.get().map((r) => (r.id === id ? after : r)),
        { kind: 'update', id, before, after }
      )
      return after
    },
    remove(id) {
      const record = list.get().find((r) => r.id === id)
      if (!record) return undefined
      commit(
        list.get().filter((r) => r.id !== id),
        { kind: 'remove', record }
      )
      return record
    },
    replaceAll(next, reason) {
      commit(
        next.map((r) => Object.freeze(r)),
        { kind: 'replace', reason }
      )
    },
    on: (event, fn) => emitter.on(event, fn),
    destroy() {
      emitter.clear()
    },
  }
}
