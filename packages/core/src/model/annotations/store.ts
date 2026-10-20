import { v7 as uuidv7 } from 'uuid'

import { isProduction } from '../env'
import { Emitter } from '../events'
import { rectFromQuad, unionRects, type Point, type Rect } from '../geometry'
import { readonly, writable, type Readable } from '../readable'

import {
  AnnotationSchema,
  confidenceBucket,
  type Annotation,
  type AnnotationInput,
  type AnnotationPatch,
} from './types'

import type { AnnotationDefaults } from './defaults'

export type AnnotationChange =
  | { kind: 'add'; annotation: Annotation }
  | { kind: 'update'; id: string; before: Annotation; after: Annotation }
  | {
      kind: 'remove'
      /** The annotation `remove` was called with. */
      annotation: Annotation
      /** Everything that went: `annotation` first, then the replies removed with it. */
      removed: Annotation[]
    }
  | { kind: 'replace'; reason: 'import' | 'sync' | 'history' }

export type StoreMode =
  | { mode: 'uncontrolled'; initial?: Annotation[] }
  | {
      mode: 'controlled'
      initial: Annotation[]
      onChange: (next: Annotation[], change: AnnotationChange) => void
    }

export interface AnnotationStore {
  readonly mode: 'uncontrolled' | 'controlled'
  readonly list: Readable<readonly Annotation[]>
  readonly selection: Readable<readonly string[]>
  /** The colour, fill and opacity defaults new annotations get. */
  readonly defaults: AnnotationDefaults
  get(id: string): Annotation | undefined
  byPage(page: number): Annotation[]
  /**
   * Returns the completed annotation. In controlled mode it is proposed to the host, not
   * applied. Throws an `Error` naming the id when it is already in the list, whether it came
   * from `input.id` or the store's `id` generator.
   */
  add(input: AnnotationInput): Annotation
  /**
   * `id`, `type`, `createdAt` and `source` cannot be patched, nor can `locked` on an embedded
   * (`source: 'pdf'`) annotation: those keys are ignored. `modifiedAt` is always bumped. A
   * locked annotation refuses any patch to its geometry, `page` or `contents`.
   */
  update(id: string, patch: AnnotationPatch): Annotation | undefined
  remove(id: string): boolean
  select(ids: string[]): void
  /**
   * Uncontrolled: embedded annotations survive (the list may edit them like `update` would, but
   * cannot drop or add them). Controlled: proposes the list minus embedded items to `onChange`.
   */
  replaceAll(list: Annotation[], reason: 'import' | 'sync' | 'history'): void
  /**
   * Controlled mode only: the host pushes its current list. Embedded (`source: 'pdf'`) items
   * belong to the store, so they stay in `list` whatever the host sends; host items that reuse
   * an embedded id are dropped.
   */
  setControlledValue(list: Annotation[]): void
  /**
   * @internal Replaces the annotations embedded in the file (`source: 'pdf'`). Applied
   * directly in both modes and never passed to `onChange`; the document calls it once on open.
   */
  _setEmbedded(list: readonly Annotation[]): void
  /**
   * @internal Like `get`, but in controlled mode it also sees changes proposed to the host and
   * not applied yet: the list `update` and `remove` build on.
   */
  _getProposed(id: string): Annotation | undefined
  completeInput(input: AnnotationInput): Annotation
  on(event: 'change', fn: (change: AnnotationChange) => void): () => void
  destroy(): void
}

export interface StoreOptions {
  mode: StoreMode
  defaults: AnnotationDefaults
  now?: () => string
  id?: () => string
}

/** Keys a locked annotation refuses to change. */
const LOCKED_KEYS = new Set([
  'page',
  'rect',
  'quads',
  'inklist',
  'start',
  'end',
  'vertices',
  'callout',
  'contents',
])

function keepKey(target: Record<string, unknown>, from: Annotation, key: string): void {
  if (Object.prototype.hasOwnProperty.call(from, key))
    target[key] = (from as Record<string, unknown>)[key]
  else delete target[key]
}

/** `proposed` as a replacement for embedded `current`, with what the file owns kept from `current`. */
function guardEmbedded(current: Annotation, proposed: Annotation): Annotation {
  if (proposed === current) return current
  if (proposed.type !== current.type) return current
  const candidate: Record<string, unknown> = {
    ...proposed,
    id: current.id,
    createdAt: current.createdAt,
    source: 'pdf',
  }
  keepKey(candidate, current, 'locked')
  if (current.locked) for (const key of LOCKED_KEYS) keepKey(candidate, current, key)
  const parsed = AnnotationSchema.safeParse(candidate)
  return parsed.success ? parsed.data : current
}

export function deriveRect(input: AnnotationInput): Rect {
  switch (input.type) {
    case 'highlight':
    case 'underline':
    case 'strikeout':
    case 'squiggly':
      return unionRects(input.quads.map(rectFromQuad))
    case 'redact':
      if (input.quads) return unionRects(input.quads.map(rectFromQuad))
      break
    case 'ink': {
      const pad = (input.width ?? 2) / 2
      const r = bounds(input.inklist.flat())
      return {
        x: r.x - pad,
        y: r.y - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      }
    }
    case 'line':
      return bounds([input.start, input.end])
    case 'polyline':
    case 'polygon':
      return bounds(input.vertices)
    default:
      break
  }
  if (input.rect) return input.rect
  throw new TypeError(`rect is required for ${input.type}`)
}

function bounds(pts: readonly Point[]): Rect {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** `o` without its `undefined` values. */
function withoutUndefined(o: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
}

/**
 * A `defaultStyle` patch merges one level deep into the current one, so changing the weight
 * keeps the font and size. An `undefined` value removes its key.
 */
function mergedStyle(
  before: Annotation,
  patch: AnnotationPatch
): { defaultStyle?: Record<string, unknown> } {
  const next = (patch as { defaultStyle?: unknown }).defaultStyle
  if (before.type !== 'freetext' || next === undefined || next === null) return {}
  return { defaultStyle: withoutUndefined({ ...before.defaultStyle, ...next }) }
}

/** Pending-map key; only annotation changes are tracked, and the prefix keeps ids apart from any other slot. */
function changeKey(change: Exclude<AnnotationChange, { kind: 'replace' }>): string {
  return `annotation:${change.kind === 'update' ? change.id : change.annotation.id}`
}

/** Structural equality for plain JSON values, ignoring `modifiedAt` at the top level. */
function sameIgnoringModifiedAt(a: Annotation, b: Annotation): boolean {
  const { modifiedAt: _a, ...restA } = a
  const { modifiedAt: _b, ...restB } = b
  return deepEqual(restA, restB)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null)
    return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every(
    (k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
  )
}

function isApplied(change: AnnotationChange, current: readonly Annotation[]): boolean {
  switch (change.kind) {
    case 'add':
      return current.some((a) => a.id === change.annotation.id)
    case 'remove':
      return !current.some((a) => a.id === change.annotation.id)
    case 'update': {
      const mine = current.find((a) => a.id === change.id)
      if (!mine) return false
      // A host or server may re-stamp modifiedAt, so fall back to a structural match.
      return mine === change.after || sameIgnoringModifiedAt(mine, change.after)
    }
    case 'replace':
      return true
  }
}

interface Pending {
  id: string
  change: AnnotationChange
  timer: ReturnType<typeof setTimeout>
}

export function createAnnotationStore(opts: StoreOptions): AnnotationStore {
  const now = opts.now ?? (() => new Date().toISOString())
  const nextId = opts.id ?? (() => uuidv7())
  const list = writable<readonly Annotation[]>([...(opts.mode.initial ?? [])])
  const selection = writable<readonly string[]>([])
  const emitter = new Emitter<{ change: AnnotationChange }>()
  const controlled = opts.mode.mode === 'controlled' ? opts.mode : undefined
  const pending = new Map<string, Pending>()
  /**
   * Controlled mode: the list as the store last proposed it, embedded items included. Later
   * proposals build on it, so several mutations in a row (one highlight per page, a bulk
   * remove, add then select) all reach the host. It resets to the applied list when the host
   * pushes a value or a pending change's check fires without one.
   */
  let proposed: readonly Annotation[] | undefined
  let destroyed = false

  /** What mutations build on: the pending proposal in controlled mode, else the list. */
  const basis = (): readonly Annotation[] => proposed ?? list.get()
  const findIn = (items: readonly Annotation[], id: string): Annotation | undefined =>
    items.find((a) => a.id === id)

  function completeInput(input: AnnotationInput): Annotation {
    const ts = now()
    const candidate: Record<string, unknown> = {
      ...input,
      id: input.id ?? nextId(),
      rect: input.rect ?? deriveRect(input),
      color: input.color ?? opts.defaults.color(input.type),
      opacity: input.opacity ?? opts.defaults.opacity(input.type),
      createdAt: ts,
      modifiedAt: ts,
      source: 'session',
    }
    if (input.type === 'freetext') {
      // A box's `color` is its fill, which has no default: the default colour is the text's.
      if (input.color === undefined) delete candidate.color
      candidate.defaultStyle = {
        color: opts.defaults.color('freetext'),
        ...withoutUndefined(input.defaultStyle ?? {}),
      }
    }
    if (input.type === 'redact') {
      if (input.interiorColor === undefined)
        candidate.interiorColor = opts.defaults.fill()
      if (input.origin === 'suggested' && input.suggestion && input.color === undefined) {
        candidate.color = opts.defaults.suggestion(
          confidenceBucket(input.suggestion.confidence)
        )
      }
    }
    return AnnotationSchema.parse(candidate)
  }

  function clearPending(key: string): void {
    const entry = pending.get(key)
    if (!entry) return
    clearTimeout(entry.timer)
    pending.delete(key)
  }

  function warnIfIgnored(key: string): void {
    const entry = pending.get(key)
    if (!entry) return
    pending.delete(key)
    // Later proposals may still be pending; they keep building on the proposed list.
    if (pending.size === 0) proposed = undefined
    if (isApplied(entry.change, list.get()) || isProduction()) return
    console.warn(
      `[inkbar] ControlledMutationIgnored: the host did not apply a ${entry.change.kind} for ` +
        `annotation ${entry.id}. In controlled mode, pass the list from onChange back into the store.`
    )
  }

  function commit(next: readonly Annotation[], change: AnnotationChange): void {
    if (controlled) {
      if (change.kind !== 'replace') {
        const key = changeKey(change)
        clearPending(key)
        // Two macrotasks. Vue applies the change in a microtask; React may apply it after its
        // scheduler's macrotask plus an effect, so one macrotask warns a host that did apply it.
        const entry: Pending = {
          id: change.kind === 'update' ? change.id : change.annotation.id,
          change,
          timer: setTimeout(() => {
            entry.timer = setTimeout(() => {
              warnIfIgnored(key)
            }, 0)
          }, 0),
        }
        pending.set(key, entry)
      }
      proposed =
        change.kind === 'replace'
          ? [
              ...list.get().filter((a) => a.source === 'pdf'),
              ...next.filter((a) => a.source !== 'pdf'),
            ]
          : next
      // Embedded items are the store's, never the host's.
      controlled.onChange(
        next.filter((a) => a.source !== 'pdf'),
        change
      )
      return
    }
    list.set(next)
    emitter.emit('change', change)
  }

  /**
   * Uncontrolled `replaceAll` cannot drop or forge embedded annotations: every current embedded
   * item stays (taking the list's version of it, guarded like `update`, when the list has one),
   * and items claiming `source: 'pdf'` that the store does not hold are dropped. History
   * snapshots contain the embedded items, so undo and redo of their edits still work.
   */
  function withEmbedded(proposed: readonly Annotation[]): Annotation[] {
    const current = new Map(
      list
        .get()
        .filter((a) => a.source === 'pdf')
        .map((a) => [a.id, a])
    )
    const seen = new Set<string>()
    const out: Annotation[] = []
    for (const a of proposed) {
      const mine = current.get(a.id)
      if (mine) {
        if (!seen.has(a.id)) out.push(guardEmbedded(mine, a))
        seen.add(a.id)
      } else if (a.source !== 'pdf') {
        out.push(a)
      }
    }
    return [...[...current.values()].filter((a) => !seen.has(a.id)), ...out]
  }

  function pruneSelection(next: readonly Annotation[]): void {
    const known = new Set(next.map((a) => a.id))
    const current = selection.get()
    if (current.every((id) => known.has(id))) return
    selection.set(current.filter((id) => known.has(id)))
  }

  const store: AnnotationStore = {
    mode: opts.mode.mode,
    list: readonly(list),
    selection: readonly(selection),
    defaults: opts.defaults,
    get: (id) => list.get().find((a) => a.id === id),
    _getProposed: (id) => findIn(basis(), id),
    byPage: (page) => list.get().filter((a) => a.page === page),
    completeInput,
    add(input) {
      const a = completeInput(input)
      // Covers ids from the input and from the `id` option's generator alike.
      if (findIn(basis(), a.id))
        throw new Error(`An annotation with id ${a.id} already exists`)
      if (destroyed) return a
      commit([...basis(), a], { kind: 'add', annotation: a })
      return a
    },
    update(id, patch) {
      const before = findIn(basis(), id)
      if (destroyed || !before) return undefined
      if (before.locked && Object.keys(patch).some((k) => LOCKED_KEYS.has(k)))
        return undefined
      const candidate: Record<string, unknown> = {
        ...before,
        ...patch,
        ...mergedStyle(before, patch),
        id: before.id,
        type: before.type,
        createdAt: before.createdAt,
        source: before.source,
        modifiedAt: now(),
      }
      // An embedded annotation's lock belongs to the file: a `locked` key in the patch is ignored.
      if (before.source === 'pdf') keepKey(candidate, before, 'locked')
      const after = AnnotationSchema.parse(candidate)
      const swap = (items: readonly Annotation[]): Annotation[] =>
        items.map((a) => (a.id === id ? after : a))
      const next = swap(basis())
      const change: AnnotationChange = { kind: 'update', id, before, after }
      if (controlled && before.source === 'pdf') {
        // The host never holds embedded items, so their edits apply here.
        list.set(swap(list.get()))
        if (proposed) proposed = next
        emitter.emit('change', change)
      } else {
        commit(next, change)
      }
      return after
    },
    remove(id) {
      const items = basis()
      const target = findIn(items, id)
      if (destroyed || !target || target.locked) return false
      const doomed = new Set<string>([id])
      let grew = true
      while (grew) {
        grew = false
        for (const a of items) {
          if (a.inReplyTo !== undefined && doomed.has(a.inReplyTo) && !doomed.has(a.id)) {
            doomed.add(a.id)
            grew = true
          }
        }
      }
      const next = items.filter((a) => !doomed.has(a.id))
      const removed = [target, ...items.filter((a) => a.id !== id && doomed.has(a.id))]
      commit(next, { kind: 'remove', annotation: target, removed })
      if (!controlled) pruneSelection(next)
      return true
    },
    select(ids) {
      const known = new Set(basis().map((a) => a.id))
      selection.set(ids.filter((id) => known.has(id)))
    },
    replaceAll(list, reason) {
      if (destroyed) return
      const next = controlled ? [...list] : withEmbedded(list)
      commit(next, { kind: 'replace', reason })
      if (!controlled) pruneSelection(next)
    },
    setControlledValue(value) {
      if (!controlled)
        throw new TypeError('setControlledValue is only valid in controlled mode')
      if (destroyed) return
      const embedded = list.get().filter((a) => a.source === 'pdf')
      const embeddedIds = new Set(embedded.map((a) => a.id))
      const next = [...embedded, ...value.filter((a) => !embeddedIds.has(a.id))]
      list.set(next)
      proposed = undefined
      for (const [key, entry] of [...pending]) {
        if (isApplied(entry.change, next)) clearPending(key)
      }
      pruneSelection(next)
      emitter.emit('change', { kind: 'replace', reason: 'sync' })
    },
    _setEmbedded(items) {
      if (destroyed) return
      const ids = new Set(items.map((a) => a.id))
      const next = [
        ...items,
        ...list.get().filter((a) => a.source !== 'pdf' && !ids.has(a.id)),
      ]
      proposed = undefined
      list.set(next)
      pruneSelection(next)
      emitter.emit('change', { kind: 'replace', reason: 'import' })
    },
    on: (event, fn) => emitter.on(event, fn),
    destroy() {
      destroyed = true
      proposed = undefined
      for (const key of [...pending.keys()]) clearPending(key)
      emitter.clear()
    },
  }
  return store
}
