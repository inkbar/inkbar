// The current style per style group, shared by the tools that create into a group and the
// style controls. Within a group the style is shared: recolouring a line also colours the next
// rectangle. Groups start empty, so until a control sets a prop each type keeps its theme
// default (the store's `completeInput` fills it).
//
// `set` writes through the store, so in controlled mode every change is proposed to the host's
// `onChange` and nothing is applied before the host applies it.
import { writable, type Readable, type Writable } from '../readable'

import { fromAnnotation, styleGroupOf, supportedProps, toFields } from './style-map'

import type { AnnotationStore } from './store'
import type { Annotation, AnnotationInput, AnnotationType, LineEnding } from './types'

export type StyleGroup = 'shape' | 'ink' | 'text' | 'markup' | 'redact'

export const STYLE_GROUPS: readonly StyleGroup[] = [
  'shape',
  'ink',
  'text',
  'markup',
  'redact',
]

/** Style as the controls name it; `style-map` turns it into each type's fields. */
export interface StyleProps {
  /** #RRGGBB */
  border?: string
  /** `null` means no fill. */
  fill?: string | null
  textColor?: string
  opacity?: number
  width?: number
  /** `null` means solid. */
  dashes?: number[] | null
  head?: LineEnding
  tail?: LineEnding
  fontFamily?: string
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  textDecoration?: 'none' | 'underline'
  textAlign?: 'left' | 'center' | 'right' | 'justify'
}

export type StyleKey = keyof StyleProps

/** What the controls show: one value per prop, or `'mixed'` when a selection disagrees. */
export type CurrentStyle = { [K in StyleKey]?: StyleProps[K] | 'mixed' }

export interface ToolStyle {
  get(group: StyleGroup): Readonly<StyleProps>
  readable(group: StyleGroup): Readable<Readonly<StyleProps>>
  /**
   * Values the controls show: the selection's when it is non-empty, else the active group's.
   * `'mixed'` per prop when selected values differ.
   */
  readonly current: Readable<CurrentStyle>
  /** Which props the active tool or the selection supports; controls disable the rest. */
  readonly supported: Readable<ReadonlySet<StyleKey>>
  /**
   * Updates the active tool's group, or under a select tool (no active group) the group of each
   * selected annotation. With `apply` (the default) it also updates every selected, unlocked
   * annotation that has the props, in one history step. `group` names the group explicitly.
   */
  set(patch: StyleProps, opts?: { group?: StyleGroup; apply?: boolean }): void
  /** Fills an AnnotationInput's unset style fields from the group (input wins). */
  resolve<T extends AnnotationInput>(group: StyleGroup, input: T): T
}

export interface ToolStyleDeps {
  store: AnnotationStore
  history: { batch(fn: () => void): void }
  /** The active tool's style group; `undefined` for select tools. */
  activeGroup: () => StyleGroup | undefined
  /** Fires when the active tool changes, so `current` and `supported` follow it. */
  active?: Readable<unknown>
}

const TYPES_BY_GROUP = new Map<StyleGroup, AnnotationType[]>()
for (const type of [
  'square',
  'circle',
  'line',
  'polyline',
  'polygon',
  'ink',
  'freetext',
  'highlight',
  'underline',
  'strikeout',
  'squiggly',
  'redact',
] as const) {
  const group = styleGroupOf({ type })
  if (!group) continue
  TYPES_BY_GROUP.set(group, [...(TYPES_BY_GROUP.get(group) ?? []), type])
}

/** Every prop some type in `group` supports. */
function groupProps(group: StyleGroup): ReadonlySet<StyleKey> {
  const out = new Set<StyleKey>()
  for (const type of TYPES_BY_GROUP.get(group) ?? [])
    for (const key of supportedProps(type)) out.add(key)
  return out
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  return false
}

function sameRecord(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => k in b && sameValue(a[k], b[k]))
}

function sameSet<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  return a.size === b.size && [...a].every((v) => b.has(v))
}

/**
 * A readable recomputed from `fn` whenever any source fires, subscribed to its sources only
 * while it has subscribers. Equal results (by `eq`) are not re-emitted and keep their identity.
 */
function computed<T>(
  sources: readonly Readable<unknown>[],
  fn: () => T,
  eq: (a: T, b: T) => boolean
): Readable<T> {
  const subs = new Set<(v: T) => void>()
  let cached: { value: T } | undefined
  let stops: (() => void)[] | undefined
  /** Recomputes, keeping the previous value's identity when equal. True when it changed. */
  const recompute = (): boolean => {
    const next = fn()
    if (cached && eq(next, cached.value)) return false
    cached = { value: next }
    return true
  }
  const refresh = (): void => {
    if (!recompute() || !cached) return
    const value = cached.value
    for (const sub of [...subs]) sub(value)
  }
  return {
    // Stable identity for equal values even unobserved: React's useSyncExternalStore reads
    // the snapshot before it subscribes and loops on a fresh object.
    get: () => {
      if (!stops) recompute()
      return (cached as { value: T }).value
    },
    subscribe(sub) {
      if (!stops) {
        recompute()
        stops = sources.map((s) => s.subscribe(refresh))
      }
      subs.add(sub)
      return () => {
        if (!subs.delete(sub) || subs.size > 0) return
        for (const stop of stops ?? []) stop()
        stops = undefined
      }
    },
  }
}

export function createToolStyle(deps: ToolStyleDeps): ToolStyle {
  const { store, history, activeGroup } = deps
  const groups = new Map<StyleGroup, Writable<Readonly<StyleProps>>>(
    STYLE_GROUPS.map((g) => [g, writable<Readonly<StyleProps>>({})])
  )
  const groupStore = (g: StyleGroup): Writable<Readonly<StyleProps>> => {
    const w = groups.get(g)
    if (!w) throw new RangeError(`Unknown style group ${String(g)}`)
    return w
  }

  /** The selected annotations, including changes proposed to a controlled host. */
  const selected = (): Annotation[] =>
    store.selection
      .get()
      .map((id) => store._getProposed(id) ?? store.get(id))
      .filter((a): a is Annotation => a !== undefined)

  const sources: Readable<unknown>[] = [
    store.list,
    store.selection,
    ...groups.values(),
    ...(deps.active ? [deps.active] : []),
  ]

  const current = computed<CurrentStyle>(
    sources,
    () => {
      const items = selected()
      if (items.length === 0) {
        const g = activeGroup()
        return g ? { ...groupStore(g).get() } : {}
      }
      const out: Record<string, unknown> = {}
      for (const a of items) {
        const props = fromAnnotation(a) as Record<string, unknown>
        for (const [key, value] of Object.entries(props)) {
          if (!(key in out)) out[key] = value
          else if (out[key] !== 'mixed' && !sameValue(out[key], value)) out[key] = 'mixed'
        }
      }
      return out
    },
    (a, b) => sameRecord(a, b)
  )

  const supported = computed<ReadonlySet<StyleKey>>(
    sources,
    () => {
      const items = selected()
      if (items.length === 0) {
        const g = activeGroup()
        return g ? groupProps(g) : new Set()
      }
      const out = new Set<StyleKey>()
      for (const a of items) for (const key of supportedProps(a.type)) out.add(key)
      return out
    },
    sameSet
  )

  function set(
    patch: StyleProps,
    opts: { group?: StyleGroup; apply?: boolean } = {}
  ): void {
    const items = selected()
    const active = opts.group ?? activeGroup()
    const targets = active
      ? [active]
      : [
          ...new Set(
            items
              .map((a) => styleGroupOf(a))
              .filter((g): g is StyleGroup => g !== undefined)
          ),
        ]
    for (const g of targets) {
      const allowed = groupProps(g)
      const next: Record<string, unknown> = { ...groupStore(g).get() }
      let changed = false
      for (const key of Object.keys(patch) as StyleKey[]) {
        if (!allowed.has(key) || patch[key] === undefined) continue
        next[key] = patch[key]
        changed = true
      }
      if (changed) groupStore(g).set(next)
    }
    if (opts.apply === false) return
    const edits = items
      .filter((a) => !a.locked)
      .map((a) => ({ id: a.id, fields: toFields(a.type, patch) }))
      .filter((e) => Object.keys(e.fields).length > 0)
    if (edits.length === 0) return
    history.batch(() => {
      for (const e of edits) store.update(e.id, e.fields)
    })
  }

  function resolve<T extends AnnotationInput>(group: StyleGroup, input: T): T {
    const fields = toFields(input.type, groupStore(group).get()) as Record<
      string,
      unknown
    >
    const out: Record<string, unknown> = { ...input }
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'defaultStyle') {
        // Nested text style: the group's keys fill those the input leaves unset.
        const style: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value as Record<string, unknown>))
          if (v !== undefined) style[k] = v
        out[key] = { ...style, ...(out[key] as object | undefined) }
      } else if (value !== undefined && out[key] === undefined) out[key] = value
    }
    return out as T
  }

  return {
    get: (g) => groupStore(g).get(),
    readable: (g) => {
      const w = groupStore(g)
      return { get: () => w.get(), subscribe: (fn) => w.subscribe(fn) }
    },
    current,
    supported,
    set,
    resolve,
  }
}
