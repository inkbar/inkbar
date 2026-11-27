// Writes the data the suite reads from a fixture as JSON that is the same text for the same data:
// keys sorted, numbers rounded to a fixed number of decimals, and laid out so a change shows as a
// change to the lines that hold it.

/**
 * Decimals every number is rounded to. Positions are in points, so this is a ten-thousandth of a
 * point, and a fraction along a run (a character boundary) is a ten-thousandth of the run.
 */
export const DECIMALS = 4

/** Widest line, indent included, that a list or object is written on whole. */
const WIDTH = 100

const SCALE = 10 ** DECIMALS

/**
 * `n` rounded to `DECIMALS`, with -0 written as 0. A number that is not finite, which JSON cannot
 * hold, becomes the string that names it.
 */
function round(n: number): number | string {
  if (!Number.isFinite(n)) return String(n)
  const r = Math.round(n * SCALE) / SCALE
  return Object.is(r, -0) ? 0 : r
}

/**
 * `value` as plain JSON data: numbers rounded, object keys sorted by code point, keys whose value
 * is `undefined` left out (JSON has no `undefined`; in a list it becomes `null`).
 */
export function normalize(value: unknown): unknown {
  if (typeof value === 'number') return round(value)
  if (value === undefined || value === null) return null
  if (Array.isArray(value)) return value.map(normalize)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
      const v = (value as Record<string, unknown>)[key]
      if (v !== undefined) out[key] = normalize(v)
    }
    return out
  }
  if (
    typeof value === 'bigint' ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  )
    throw new Error(`stableJson cannot write a ${typeof value}`)
  return value
}

const isPrimitive = (v: unknown) => v === null || typeof v !== 'object'

function layout(value: unknown, indent: string, lead: number): string {
  const one = spaced(value)
  if (isPrimitive(value) || indent.length + lead + one.length <= WIDTH) return one
  const inner = indent + '  '
  if (Array.isArray(value)) {
    if (value.every(isPrimitive)) {
      // Packed several to a line, each line as full as it fits.
      const lines: string[] = []
      let line = ''
      for (const item of value.map((v) => JSON.stringify(v))) {
        if (line !== '' && inner.length + line.length + item.length + 2 > WIDTH) {
          lines.push(line)
          line = ''
        }
        line += line === '' ? item : ` ${item}`
        line += ','
      }
      lines.push(line)
      lines[lines.length - 1] = lines.at(-1)!.slice(0, -1)
      return `[\n${lines.map((l) => inner + l).join('\n')}\n${indent}]`
    }
    return `[\n${value.map((v) => inner + layout(v, inner, 1)).join(',\n')}\n${indent}]`
  }
  const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => {
    const key = `${JSON.stringify(k)}: `
    return inner + key + layout(v, inner, key.length + 1)
  })
  return `{\n${entries.join(',\n')}\n${indent}}`
}

/** A short list or object on one line: `[1, 2]`, `{ "x": 1, "y": 2 }`. */
function spaced(value: unknown): string {
  if (isPrimitive(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(spaced).join(', ')}]`
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return '{}'
  return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${spaced(v)}`).join(', ')} }`
}

/**
 * `value` as JSON text that is the same for the same data, ending in a newline: see `normalize`.
 * A list or object that fits within `WIDTH` is written on one line; a longer list of plain values
 * is packed several to a line; anything else is written one entry per line.
 */
export function stableJson(value: unknown): string {
  return `${layout(normalize(value), '', 0)}\n`
}
