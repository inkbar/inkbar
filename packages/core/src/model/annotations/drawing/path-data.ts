import type { PathCommand } from './types'
import type { Point } from '../../geometry'

/** How many numbers each command takes, and what it becomes. */
const ARITY: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
}

/** A number at `lastIndex`: sticky, so reading one never copies the rest of the string. */
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y

/**
 * SVG path data as absolute `M L C A Z` commands. It accepts `M m L l H h V v C c S s Q q T t A a
 * Z z`: horizontal and vertical lines become `L`, smooth curves are made explicit, and quadratics
 * become cubics. An arc keeps SVG's meaning: its `sweep` is true when the arc runs in the
 * direction of increasing angle with y pointing down, as the path data was written. An arc has no
 * rotation of its axes, as `PathCommand` `A` has none: a nonzero x-axis rotation throws, like
 * anything else it does not accept, a `SyntaxError` naming the position. The glyphs of the note
 * icons have no such arc (a test checks them).
 */
export function parsePathData(d: string): PathCommand[] {
  const out: PathCommand[] = []
  let i = 0
  let cur: Point = { x: 0, y: 0 }
  let start: Point = { x: 0, y: 0 }
  /** The last control point and whether it was a cubic's or a quadratic's, for S and T. */
  let control: { p: Point; cubic: boolean } | undefined
  let command = ''
  let first = true

  const fail = (what: string): never => {
    throw new SyntaxError(`${what} at position ${i} in path data`)
  }
  const space = (): void => {
    while (i < d.length && /[\s,]/.test(d[i]!)) i++
  }
  /** The length of the number at `at`, or 0 if there is none. */
  const numberLength = (at: number): number => {
    NUMBER.lastIndex = at
    return NUMBER.test(d) ? NUMBER.lastIndex - at : 0
  }
  const number = (): number => {
    space()
    const length = numberLength(i)
    if (length === 0) return fail('expected a number')
    const value = Number(d.slice(i, i + length))
    i += length
    return value
  }
  const flag = (): boolean => {
    space()
    const c = d[i]
    if (c !== '0' && c !== '1') return fail('expected an arc flag')
    i++
    return c === '1'
  }

  space()
  while (i < d.length) {
    const c = d[i]!
    if (/[A-Za-z]/.test(c)) {
      if (!(c.toLowerCase() in ARITY)) return fail(`unknown command ${c}`)
      command = c
      i++
    } else if (command === '' || ARITY[command.toLowerCase()] === 0) {
      return fail('expected a command')
    }
    if (first && command !== 'M' && command !== 'm')
      return fail('a path starts with a move')
    first = false
    const rel = command === command.toLowerCase()
    const kind = command.toLowerCase()
    const at = (x: number, y: number): Point =>
      rel ? { x: cur.x + x, y: cur.y + y } : { x, y }

    if (kind === 'z') {
      out.push({ op: 'Z' })
      cur = start
      control = undefined
      space()
      // A number after Z has no command to belong to.
      if (i < d.length && !/[A-Za-z]/.test(d[i]!)) fail('expected a command')
      continue
    }

    switch (kind) {
      case 'm':
      case 'l': {
        const to = at(number(), number())
        out.push({ op: kind === 'm' ? 'M' : 'L', to })
        cur = to
        if (kind === 'm') start = to
        // Further pairs after a move are lines.
        command = rel ? 'l' : 'L'
        control = undefined
        break
      }
      case 'h': {
        const x = number()
        cur = { x: rel ? cur.x + x : x, y: cur.y }
        out.push({ op: 'L', to: cur })
        control = undefined
        break
      }
      case 'v': {
        const y = number()
        cur = { x: cur.x, y: rel ? cur.y + y : y }
        out.push({ op: 'L', to: cur })
        control = undefined
        break
      }
      case 'c': {
        const c1 = at(number(), number())
        const c2 = at(number(), number())
        const to = at(number(), number())
        out.push({ op: 'C', c1, c2, to })
        cur = to
        control = { p: c2, cubic: true }
        break
      }
      case 's': {
        const c1 = control?.cubic
          ? { x: 2 * cur.x - control.p.x, y: 2 * cur.y - control.p.y }
          : cur
        const c2 = at(number(), number())
        const to = at(number(), number())
        out.push({ op: 'C', c1, c2, to })
        cur = to
        control = { p: c2, cubic: true }
        break
      }
      case 'q':
      case 't': {
        const q =
          kind === 'q'
            ? at(number(), number())
            : control && !control.cubic
              ? { x: 2 * cur.x - control.p.x, y: 2 * cur.y - control.p.y }
              : cur
        const to = at(number(), number())
        out.push({
          op: 'C',
          c1: { x: cur.x + (2 / 3) * (q.x - cur.x), y: cur.y + (2 / 3) * (q.y - cur.y) },
          c2: { x: to.x + (2 / 3) * (q.x - to.x), y: to.y + (2 / 3) * (q.y - to.y) },
          to,
        })
        cur = to
        control = { p: q, cubic: false }
        break
      }
      case 'a': {
        const rx = number()
        const ry = number()
        if (number() !== 0) return fail('a rotated arc is not supported')
        const largeArc = flag()
        const sweep = flag()
        const to = at(number(), number())
        out.push({ op: 'A', rx: Math.abs(rx), ry: Math.abs(ry), largeArc, sweep, to })
        cur = to
        control = undefined
        break
      }
    }
    space()
    // The next thing is a command letter, or more numbers for the same command.
    if (i < d.length && !/[A-Za-z]/.test(d[i]!) && numberLength(i) === 0)
      fail('expected a number')
  }
  return out
}
