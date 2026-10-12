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
} from './types'

import type { AnnotationDefaults } from './defaults'

export type AnnotationChange =
  | { kind: 'add'; annotation: Annotation }
  | { kind: 'update'; id: string; before: Annotation; after: Annotation }
  | { kind: 'remove'; annotation: Annotation }
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
  get(id: string): Annotation | undefined
  byPage(page: number): Annotation[]
  /** Returns the completed annotation. In controlled mode it is proposed to the host, not applied. */
  add(input: AnnotationInput): Annotation
  /** `id`, `type`, `createdAt` and `source` cannot be patched; `modifiedAt` is always bumped. */
  update(id: string, patch: Partial<Annotation>): Annotation | undefined
  remove(id: string): boolean
  select(ids: string[]): void
  replaceAll(list: Annotation[], reason: 'import' | 'sync' | 'history'): void
  /** Controlled mode only: the host pushes its current list. */
  setControlledValue(list: Annotation[]): void
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
  'rect',
  'quads',
  'paths',
  'start',
  'end',
  'vertices',
  'callout',
  'contents',
])

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
      const pad = (input.strokeWidth ?? 2) / 2
      const r = bounds(input.paths.flat())
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
  let destroyed = false

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
    if (input.type === 'redact') {
      if (input.fill === undefined) candidate.fill = opts.defaults.fill()
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
        // A macrotask, so hosts that apply the change a microtask or two later (Vue's
        // v-model) reach setControlledValue before the check runs.
        const timer = setTimeout(() => {
          warnIfIgnored(key)
        }, 0)
        pending.set(key, {
          id: change.kind === 'update' ? change.id : change.annotation.id,
          change,
          timer,
        })
      }
      controlled.onChange([...next], change)
      return
    }
    list.set(next)
    emitter.emit('change', change)
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
    get: (id) => list.get().find((a) => a.id === id),
    byPage: (page) => list.get().filter((a) => a.page === page),
    completeInput,
    add(input) {
      const a = completeInput(input)
      if (destroyed) return a
      commit([...list.get(), a], { kind: 'add', annotation: a })
      return a
    },
    update(id, patch) {
      const before = store.get(id)
      if (destroyed || !before) return undefined
      if (before.locked && Object.keys(patch).some((k) => LOCKED_KEYS.has(k)))
        return undefined
      const after = AnnotationSchema.parse({
        ...before,
        ...patch,
        id: before.id,
        type: before.type,
        createdAt: before.createdAt,
        source: before.source,
        modifiedAt: now(),
      })
      commit(
        list.get().map((a) => (a.id === id ? after : a)),
        { kind: 'update', id, before, after }
      )
      return after
    },
    remove(id) {
      const target = store.get(id)
      if (destroyed || !target) return false
      const doomed = new Set<string>([id])
      let grew = true
      while (grew) {
        grew = false
        for (const a of list.get()) {
          if (a.inReplyTo !== undefined && doomed.has(a.inReplyTo) && !doomed.has(a.id)) {
            doomed.add(a.id)
            grew = true
          }
        }
      }
      const next = list.get().filter((a) => !doomed.has(a.id))
      commit(next, { kind: 'remove', annotation: target })
      if (!controlled) pruneSelection(next)
      return true
    },
    select(ids) {
      const known = new Set(list.get().map((a) => a.id))
      selection.set(ids.filter((id) => known.has(id)))
    },
    replaceAll(list, reason) {
      if (destroyed) return
      const next = [...list]
      commit(next, { kind: 'replace', reason })
      if (!controlled) pruneSelection(next)
    },
    setControlledValue(value) {
      if (!controlled)
        throw new TypeError('setControlledValue is only valid in controlled mode')
      if (destroyed) return
      const next = [...value]
      list.set(next)
      for (const [key, entry] of [...pending]) {
        if (isApplied(entry.change, next)) clearPending(key)
      }
      pruneSelection(next)
      emitter.emit('change', { kind: 'replace', reason: 'sync' })
    },
    on: (event, fn) => emitter.on(event, fn),
    destroy() {
      destroyed = true
      for (const key of [...pending.keys()]) clearPending(key)
      emitter.clear()
    },
  }
  return store
}
