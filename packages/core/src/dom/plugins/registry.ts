/*
 * The marks registry and record selection, one of each per viewer, held by the plugin host.
 *
 * Every `plugin.marks(records, opts)` call registers what it draws under the records' key
 * (`<plugin>.<name>`), so a record list or a thumbnail can show a record as its mark does: the
 * same card, label and rect, and actions in the plugin's own undo step. When several `marks`
 * calls cover the same records, a record takes the first registration, in call order, whose
 * `where` it passes.
 *
 * A selection holds at most one selected record per key, shared by the marks, every list and
 * the host app. It clears when the record leaves the store (removed, or undone away), when it
 * stops resolving to a registration, and when the document closes. A key with no registrations
 * resolves every record, so its selection clears only on removal or close.
 */
import { writable, readonly, type Readable } from '../../model/readable'

import type { CardSpec } from './api/card'
import type { MarksOptions } from './api/marks'
import type { Rect } from '../../model/geometry'
import type { RecordBase, RecordStore } from '../../model/records'

/** What one `plugin.marks` call drew its records with. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each key has its own record type
export interface MarksRegistration<T extends RecordBase & { page: number } = any> {
  /** The id of the plugin that called `marks`. */
  plugin: string
  /** Whether `record` gets a mark from this call. */
  where(record: T): boolean
  label(record: T): string
  rect(record: T): Rect
  card?(record: T): CardSpec
  className?: string
  style?: MarksOptions<T>['style']
  /** The plugin's `history.batch`: everything `fn` changes is one undo step. */
  batch(fn: () => void): void
}

export interface MarksRegistry {
  /** Registers `reg` under `key`; returns a function that removes it. */
  add(key: string, reg: MarksRegistration): () => void
  /** Registrations for `key`, in call order. */
  of(key: string): readonly MarksRegistration[]
  /** The first registration whose `where` passes, or undefined. */
  resolve<T extends RecordBase & { page: number }>(
    key: string,
    record: T
  ): MarksRegistration<T> | undefined
  /** Keys that have registrations. */
  keys(): readonly string[]
  /** Calls `listener` after every add and remove; returns a stop function. */
  watch(listener: () => void): () => void
}

export interface RecordSelection {
  /** The selected record's id, or null. */
  readonly selected: Readable<string | null>
  /**
   * Selects the record with `id`, or clears with null. An id the open document's store lacks,
   * or whose record resolves to no registration, changes nothing.
   */
  select(id: string | null): void
}

const NONE: readonly never[] = Object.freeze([])

export function createMarksRegistry(): MarksRegistry {
  const byKey = new Map<string, MarksRegistration[]>()
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const listener of [...listeners]) listener()
  }
  return {
    add(key, reg) {
      byKey.set(key, [...(byKey.get(key) ?? []), reg])
      emit()
      let added = true
      return () => {
        if (!added) return
        added = false
        const rest = (byKey.get(key) ?? []).filter((r) => r !== reg)
        if (rest.length > 0) byKey.set(key, rest)
        else byKey.delete(key)
        emit()
      }
    },
    of: (key) => byKey.get(key) ?? NONE,
    resolve: (key, record) => byKey.get(key)?.find((reg) => reg.where(record)),
    keys: () => [...byKey.keys()],
    watch(listener) {
      // Wrapped, so the same listener added twice runs twice and each stop removes its own.
      const run = () => listener()
      listeners.add(run)
      return () => {
        listeners.delete(run)
      }
    },
  }
}

/** A selection as the host keeps it: `destroy` stops it following its store. */
export type HostRecordSelection = RecordSelection & { destroy(): void }

/**
 * A selection over whichever store `store` holds. `resolves` says whether a record may stay
 * selected; `recheck`, when given, reports when that answer may have changed for every record.
 */
export function createRecordSelection(
  store: Readable<RecordStore<RecordBase> | null>,
  resolves: (record: RecordBase) => boolean,
  recheck?: (listener: () => void) => () => void
): HostRecordSelection {
  const selected = writable<string | null>(null)
  /** Whether `id` is in the store now and resolves. */
  const valid = (id: string) => {
    const record = store.get()?.get(id)
    return record !== undefined && resolves(record)
  }
  const check = () => {
    const id = selected.get()
    if (id !== null && !valid(id)) selected.set(null)
  }

  let stopList: (() => void) | undefined
  const follow = (next: RecordStore<RecordBase> | null) => {
    stopList?.()
    // Another store, or none, is another document: what was selected belongs to the last one.
    selected.set(null)
    stopList = next?.list.subscribe(check)
  }
  stopList = store.get()?.list.subscribe(check)
  const stopStore = store.subscribe(follow)
  const stopRecheck = recheck?.(check)

  return {
    selected: readonly(selected),
    select(id) {
      if (id === null || valid(id)) selected.set(id)
    },
    destroy() {
      stopStore()
      stopList?.()
      stopRecheck?.()
      selected.set(null)
    },
  }
}

/**
 * Page first, then top to bottom and left to right, by each record's rect in user space. Records
 * with no rect go after the others on their page, in the order they came.
 */
export function readingOrder<T extends { page: number }>(
  rect: (record: T) => Rect | undefined
): (a: T, b: T) => number {
  return (a, b) => {
    if (a.page !== b.page) return a.page - b.page
    const ra = rect(a)
    const rb = rect(b)
    if (!ra || !rb) return (ra ? 0 : 1) - (rb ? 0 : 1)
    return rb.y + rb.height - (ra.y + ra.height) || ra.x - rb.x
  }
}
