// Test support only, never production code: node tests import it. It gives the field objects the
// kept sandbox is started with as the sandbox reads them, so two sets of them can be held equal
// on what the sandbox uses and nothing else.
import { expect } from 'vitest'

import type { FileScripts } from '../reader/file'

/**
 * What the sandbox never reads of the field objects it is started with, found by reading
 * `initSandbox` and the `Field`, `RadioButtonField` and `CheckboxField` constructors of
 * `pdf.sandbox.mjs` (PDF.js 6.4.299). Everything else of every object is read.
 */
export const UNREAD = [
  {
    of: 'every object',
    keeps: 'every key but numItems',
    reason:
      '`Field` counts `items` itself through its own `numItems` getter; its constructor never reads `data.numItems`.',
  },
  {
    of: 'a container (type "") whose name also has a widget object',
    keeps: 'id and type',
    reason:
      "`initSandbox` builds the field from the name's first widget object; of the container it reads only `type`, to set it apart, and `id`, to send events and `/CO` entries naming it to that field.",
  },
  {
    of: 'a widget object after the first of its name',
    keeps:
      'id and type; with a first object of type radiobutton or checkbox, exportValues and actions too',
    reason:
      "`initSandbox` builds the field from the first object and reads only the ids of the rest (`siblings`); `RadioButtonField` also reads each one's `exportValues` and `actions`.",
  },
] as const

type Obj = Record<string, unknown>

const pick = (o: Obj, keys: readonly string[]): Obj =>
  Object.fromEntries(Object.entries(o).filter(([key]) => keys.includes(key)))

const omit = (o: Obj, keys: readonly string[]): Obj =>
  Object.fromEntries(Object.entries(o).filter(([key]) => !keys.includes(key)))

/** A field-objects view, name by name. */
export type SandboxView = [string, Obj[]][] | null

/** What a reader gives the sandbox: its field objects as it reads them, and the file's scripts. */
export interface SandboxRead {
  fields: SandboxView
  scripts?: FileScripts | undefined
}

/**
 * Where what core gives the sandbox is known to differ from what PDF.js gives it, each with its
 * cause and the files it shows on. Each is applied to both reads of those files before they are
 * compared, so the rest is still held equal; a file listed whose reads no longer differ fails.
 */
export const SANDBOX_EXCEPTIONS: Record<
  string,
  {
    cause: string
    fixtures: readonly string[]
    /** The comparisons it shows in. */
    in: readonly Comparison[]
    apply: (read: SandboxRead) => SandboxRead
  }
> = {}

/** A comparison with PDF.js: the builder over PDF.js's own shapes, or the engine reader. */
export type Comparison = 'builder' | 'engine'

/**
 * `read` and `other` held equal with the exceptions `SANDBOX_EXCEPTIONS` lists for `fixture` in
 * `comparison` applied to both, after checking each listed exception still shows.
 */
export function expectSameRead(
  read: SandboxRead,
  other: SandboxRead,
  fixture: string,
  comparison: Comparison
): void {
  const known = Object.values(SANDBOX_EXCEPTIONS).filter(
    (e) => e.fixtures.includes(fixture) && e.in.includes(comparison)
  )
  const applying = (list: typeof known) => (r: SandboxRead) =>
    list.reduce((acc, e) => e.apply(acc), r)
  for (const exception of known) {
    const others = applying(known.filter((e) => e !== exception))
    expect(others(read), `${exception.cause} still shows`).not.toStrictEqual(
      others(other)
    )
  }
  const all = applying(known)
  expect(all(read)).toStrictEqual(all(other))
}

/**
 * `objects` as the sandbox reads them, name by name in their order: as `create` hands them over
 * (`JSON.stringify` with each `Map` as an object, so `undefined` keys go and a typed array becomes
 * an object of its indices), with what `UNREAD` lists left out. `null` for none.
 */
export function sandboxView(objects: unknown): SandboxView {
  const json = JSON.parse(
    JSON.stringify(objects ?? null, (_key, value: unknown) =>
      value instanceof Map ? Object.fromEntries(value as Map<string, unknown>) : value
    )
  ) as Record<string, Obj[]> | null
  if (json === null) return null
  return Object.entries(json).map(([name, list]) => {
    const widgets = list.filter((o) => o.type !== '')
    const first = widgets[0]
    const toggle = first?.type === 'radiobutton' || first?.type === 'checkbox'
    return [
      name,
      list.map((o) => {
        if (o.type === '') return first ? pick(o, ['id', 'type']) : omit(o, ['numItems'])
        if (o === first) return omit(o, ['numItems'])
        return pick(
          o,
          toggle ? ['id', 'type', 'exportValues', 'actions'] : ['id', 'type']
        )
      }),
    ]
  })
}
