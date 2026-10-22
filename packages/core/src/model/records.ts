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
  | {
      kind: 'replace'
      reason: 'history' | 'reset'
      /** Ids of the records the replace added, changed and dropped, in list order. */
      added: string[]
      updated: string[]
      removed: string[]
    }

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
  /** Drops the listeners. Writes after it change nothing and emit nothing. */
  destroy(): void
}

export interface RecordStoreOptions<T extends RecordBase> {
  initial?: readonly T[]
  /** Called after every change, `replace` included, with the list as it now stands. */
  onChange?: (list: readonly T[], change: RecordChange<T>) => void
}

/**
 * A keyed list of plain records. Records are stored as frozen copies, so a change's `before` and `after` can be
 * kept as history entries without copying.
 */
export function createRecordStore<T extends RecordBase>(
  key: string,
  opts: RecordStoreOptions<T> = {}
): RecordStore<T> {
  const list = writable<readonly T[]>((opts.initial ?? []).map(frozen))
  const emitter = new Emitter<{ change: RecordChange<T> }>()
  let destroyed = false

  function commit(next: readonly T[], change: RecordChange<T>): void {
    if (destroyed) return
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
      const stored = frozen(record)
      commit([...list.get(), stored], { kind: 'add', record: stored })
      return stored
    },
    update(id, patch) {
      const before = list.get().find((r) => r.id === id)
      if (destroyed || !before) return undefined
      const after = Object.freeze({ ...before, ...patch, id: before.id }) as T
      commit(
        list.get().map((r) => (r.id === id ? after : r)),
        { kind: 'update', id, before, after }
      )
      return after
    },
    remove(id) {
      const record = list.get().find((r) => r.id === id)
      if (destroyed || !record) return undefined
      commit(
        list.get().filter((r) => r.id !== id),
        { kind: 'remove', record }
      )
      return record
    },
    replaceAll(incoming, reason) {
      const prev = new Map(list.get().map((r) => [r.id, r]))
      const added: string[] = []
      const updated: string[] = []
      // A record whose fields all equal (===) the stored one's keeps the stored object, so a
      // history step reports only the records it really changed, and `updated` means "the
      // stored object changed".
      const next = incoming.map((r) => {
        const old = prev.get(r.id)
        if (!old) {
          added.push(r.id)
          return frozen(r)
        }
        if (shallowEqual(old, r)) return old
        updated.push(r.id)
        return frozen(r)
      })
      const kept = new Set(next.map((r) => r.id))
      const removed = [...prev.keys()].filter((id) => !kept.has(id))
      commit(next, { kind: 'replace', reason, added, updated, removed })
    },
    on: (event, fn) => emitter.on(event, fn),
    destroy() {
      destroyed = true
      emitter.clear()
    },
  }
}

/** Freezes a copy, so the caller's object stays theirs; an already frozen record is kept. */
function frozen<T extends RecordBase>(record: T): T {
  return Object.isFrozen(record) ? record : Object.freeze({ ...record })
}

function shallowEqual(a: object, b: object): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return (
    ka.length === kb.length &&
    ka.every(
      (k) =>
        Object.hasOwn(b, k) &&
        (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]
    )
  )
}
