// What the two readers tell the document about the file itself, as core's reader shapes them, and
// how two such values are compared: one line per difference, naming the place, PDF.js's value
// first.
import type { InkDocument } from '@inkbar/core'

type Reader = InkDocument['_reader']
export type FileFacts = Awaited<ReturnType<Reader['facts']>>
export type FileAnnotation = Awaited<ReturnType<Reader['annotations']>>[number]
export type FileField = Awaited<ReturnType<Reader['form']>>[number]
export type FileWidget = FileField['widgets'][number]
export type FileScripts = NonNullable<Awaited<ReturnType<Reader['scripts']>>>

/** How far apart, in points, two readers may place a `rect`. Every other number must be equal. */
export const RECT_TOLERANCE = 0.01

/** Characters of a long string shown from where two differ. */
const WINDOW = 40

type Obj = Record<string, unknown>

const isObject = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A number, string, boolean, or an array of those or of such arrays: shown whole. */
const isPlain = (v: unknown): boolean =>
  Array.isArray(v) ? v.every(isPlain) : !isObject(v)

/** `v` as a line shows it; a number that is not finite shows as a string, `"NaN"`. */
const show = (v: unknown) =>
  v === undefined
    ? 'none'
    : JSON.stringify(v, (_key, x: unknown) =>
        typeof x === 'number' && !Number.isFinite(x) ? String(x) : x
      )

/** Whether two plain values are equal: numbers by `Object.is`, so `NaN` matches only `NaN`. */
const samePlain = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((x, i) => samePlain(x, b[i]))
    : Object.is(a, b)

const nearRect = (a: unknown, b: unknown) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  a.length === b.length &&
  a.every(
    (n, i) =>
      typeof n === 'number' &&
      typeof b[i] === 'number' &&
      Math.abs(n - b[i]) <= RECT_TOLERANCE
  )

/** `prefix` and `line` joined, for a line under a place. */
const under = (prefix: string, line: string) =>
  prefix === '' ? line : `${prefix}: ${line}`

function walk(a: unknown, b: unknown, path: string, key: string, out: string[]): void {
  if (key === 'rect' && nearRect(a, b)) return
  if (isPlain(a) && isPlain(b)) {
    if (samePlain(a, b)) return
    if (
      typeof a === 'string' &&
      typeof b === 'string' &&
      Math.max(a.length, b.length) > 2 * WINDOW
    ) {
      let at = 0
      while (a[at] === b[at]) at++
      out.push(
        `${`${path} from character ${at}`.trim()}: PDF.js ${show(a.slice(at, at + WINDOW))}, engine ${show(b.slice(at, at + WINDOW))}`
      )
      return
    }
    out.push(under(path, `PDF.js ${show(a)}, engine ${show(b)}`))
    return
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      out.push(under(path, `PDF.js ${a.length} entries, engine ${b.length}`))
      return
    }
    a.forEach((x, i) => walk(x, b[i], `${path}[${i}]`, '', out))
    return
  }
  if (isObject(a) && isObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    for (const k of keys) walk(a[k], b[k], path === '' ? k : `${path}.${k}`, k, out)
    return
  }
  out.push(under(path, `PDF.js ${show(a)}, engine ${show(b)}`))
}

/**
 * How `b` (the engine's) differs from `a` (PDF.js's), key by key: one line per value that
 * differs, named by its path. A key whose value is `undefined` counts as absent; a `rect` may be
 * `RECT_TOLERANCE` apart, every other number must be equal. Each line starts with `at`.
 */
export function valueDifferences(a: unknown, b: unknown, at = ''): string[] {
  const out: string[] = []
  walk(a, b, '', '', out)
  // A whole string's place reads `source from character 12`, not `source: from character 12`.
  return out.map((line) =>
    at !== '' && line.startsWith('from character ') ? `${at} ${line}` : under(at, line)
  )
}

/**
 * How two lists of things that each have a key compare. When both hold the same keys, a
 * different order is one line and each pair is compared by `each`. When they hold the same
 * number of things but different keys, they are paired by place and each place whose key differs
 * is named. Otherwise each thing only one list holds is named, and the rest compared. A key that
 * repeats is paired in turn: the first with the first.
 */
export function pairDifferences<T>(
  a: readonly T[],
  b: readonly T[],
  opts: {
    /** What one thing is called: `field`, `annotation`. */
    noun: string
    /** What the list is called: `fields`, `annotations`. */
    plural: string
    /** What the key is called: `name`, `id`. */
    keyName: string
    keyOf: (t: T) => string
    /** The key as lines show it. */
    showKey: (key: string) => string
    each: (x: T, y: T, at: string) => string[]
  }
): string[] {
  const { noun, keyOf, showKey, each } = opts
  const keysA = a.map(keyOf)
  const keysB = b.map(keyOf)
  const at = (key: string) => `${noun} ${showKey(key)}`
  /** Each of `xs` with the one of `ys` of the same key and turn, or undefined. */
  const partners = (xs: readonly T[], ys: readonly T[]) => {
    const used = new Set<number>()
    return xs.map((x) => {
      const i = ys.findIndex((y, j) => !used.has(j) && keyOf(y) === keyOf(x))
      if (i < 0) return undefined
      used.add(i)
      return ys[i]
    })
  }
  const sorted = (keys: string[]) => [...keys].sort()
  if (JSON.stringify(sorted(keysA)) === JSON.stringify(sorted(keysB))) {
    const out: string[] = []
    if (keysA.some((k, i) => k !== keysB[i]))
      out.push(
        `${opts.plural} in a different order: PDF.js ${keysA.map(showKey).join(', ')}; engine ${keysB.map(showKey).join(', ')}`
      )
    const other = partners(a, b)
    a.forEach((x, i) => out.push(...each(x, other[i]!, at(keyOf(x)))))
    return out
  }
  if (a.length === b.length) {
    const out: string[] = []
    a.forEach((x, i) => {
      const y = b[i]!
      if (keyOf(x) !== keyOf(y))
        out.push(
          `${noun} ${i + 1}: ${opts.keyName}: PDF.js ${showKey(keyOf(x))}, engine ${showKey(keyOf(y))}`
        )
      else out.push(...each(x, y, at(keyOf(x))))
    })
    return out
  }
  const out: string[] = []
  const inB = partners(a, b)
  a.forEach((x, i) => {
    const y = inB[i]
    if (y === undefined) out.push(`${at(keyOf(x))}: only PDF.js gives it`)
    else out.push(...each(x, y, at(keyOf(x))))
  })
  partners(b, a).forEach((x, i) => {
    if (x === undefined) out.push(`${at(keyOf(b[i]!))}: only the engine gives it`)
  })
  return out
}
