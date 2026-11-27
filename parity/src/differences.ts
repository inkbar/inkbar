// How what the engine gives now differs from a committed baseline: data compared value by value,
// named by its place, and pixels compared exactly.

/** Characters of a long string shown from where two differ. */
const WINDOW = 40
/** Lines a data difference names before it says how many more there are. */
const MAX_LINES = 20

type Obj = Record<string, unknown>

const isObject = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const show = (v: unknown) => (v === undefined ? 'none' : JSON.stringify(v))

const at = (path: string, line: string) => (path === '' ? line : `${path}: ${line}`)

function walk(was: unknown, now: unknown, path: string, out: string[]): void {
  if (Array.isArray(was) && Array.isArray(now)) {
    const common = Math.min(was.length, now.length)
    for (let i = 0; i < common; i++) walk(was[i], now[i], `${path}[${i}]`, out)
    if (was.length !== now.length) {
      const extra =
        now.length > was.length
          ? `now also ${now.slice(common).map(show).join(', ')}`
          : `no longer ${was.slice(common).map(show).join(', ')}`
      out.push(at(path, `${was.length} entries, now ${now.length}: ${extra}`))
    }
    return
  }
  if (isObject(was) && isObject(now)) {
    for (const key of [...new Set([...Object.keys(was), ...Object.keys(now)])].sort())
      walk(was[key], now[key], path === '' ? key : `${path}.${key}`, out)
    return
  }
  if (Object.is(was, now)) return
  if (
    typeof was === 'string' &&
    typeof now === 'string' &&
    Math.max(was.length, now.length) > 2 * WINDOW
  ) {
    let i = 0
    while (was[i] === now[i]) i++
    out.push(
      `${path} from character ${i}: was ${show(was.slice(i, i + WINDOW))}, now ${show(now.slice(i, i + WINDOW))}`
    )
    return
  }
  out.push(at(path, `was ${show(was)}, now ${show(now)}`))
}

/**
 * How `now` differs from `was`, both plain JSON data: one line per value that differs, named by
 * its path (`[0].links[2].rect.x: was 72, now 73`). Lists are compared place by place, and a
 * list that grew or shrank names what it gained or lost. At most `MAX_LINES` lines, then a line
 * saying how many more. Empty when they are equal.
 */
export function dataDifferences(was: unknown, now: unknown): string[] {
  const out: string[] = []
  walk(was, now, '', out)
  return out.length <= MAX_LINES
    ? out
    : [...out.slice(0, MAX_LINES), `and ${out.length - MAX_LINES} more`]
}

/** How a drawing differs from its baseline, pixel for pixel. */
export interface PixelDifference {
  /** Pixels whose red, green, blue or alpha differs. */
  count: number
  /** The smallest rectangle holding every differing pixel, in pixels; absent when none differ. */
  box?: { x: number; y: number; width: number; height: number }
}

function checkSizes(a: ImageData, b: ImageData): void {
  if (a.width !== b.width || a.height !== b.height)
    throw new Error(
      `the images differ in size: ${a.width} × ${a.height} against ${b.width} × ${b.height}`
    )
}

const differs = (a: ImageData, b: ImageData, i: number) =>
  a.data[i] !== b.data[i] ||
  a.data[i + 1] !== b.data[i + 1] ||
  a.data[i + 2] !== b.data[i + 2] ||
  a.data[i + 3] !== b.data[i + 3]

/** Which pixels of `b` differ from `a`, which must be the same size. */
export function pixelDifference(a: ImageData, b: ImageData): PixelDifference {
  checkSizes(a, b)
  let count = 0
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      if (!differs(a, b, (y * a.width + x) * 4)) continue
      count++
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
  }
  return count === 0
    ? { count }
    : { count, box: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } }
}

/** `d` in words: `12 pixels differ, within 4 × 3 px at (100, 200)`. */
export function describePixels(d: PixelDifference): string {
  if (d.box === undefined) return 'no pixel differs'
  const { x, y, width, height } = d.box
  return `${d.count} ${d.count === 1 ? 'pixel differs' : 'pixels differ'}, within ${width} × ${height} px at (${x}, ${y})`
}

/**
 * Red where `b` differs from `a`, over a faded copy of `a`, for the report. The two must be the
 * same size.
 */
export function differenceImage(a: ImageData, b: ImageData): ImageData {
  checkSizes(a, b)
  const data = new Uint8ClampedArray(a.width * a.height * 4)
  for (let i = 0; i < data.length; i += 4) {
    if (differs(a, b, i)) {
      data[i] = 255
      data[i + 1] = 0
      data[i + 2] = 0
    } else {
      // Faded towards white, so the page shows faintly under the marks.
      const grey =
        (a.data[i]! * 0.299 + a.data[i + 1]! * 0.587 + a.data[i + 2]! * 0.114) / 4
      data[i] = data[i + 1] = data[i + 2] = 191 + grey
    }
    data[i + 3] = 255
  }
  return typeof ImageData === 'function'
    ? new ImageData(data, a.width, a.height)
    : { width: a.width, height: a.height, data, colorSpace: 'srgb' }
}
