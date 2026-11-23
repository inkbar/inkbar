// A page's text as the engine reads it, one character at a time, grouped into the runs a
// `TextItem` describes. All in user space: points, origin bottom-left, before /Rotate.
import { rectFromQuad, type Point, type Quad } from '../model/geometry'
import { GAP_SPACE } from '../model/search-text'

import type { TextContent, TextItem } from '../model/text'

/** How far off the run's baseline, as a fraction of the font size, a character may sit. */
const BASELINE_TOLERANCE = 0.25
/** How far, in degrees, a character's baseline may turn from the run's. */
const ANGLE_TOLERANCE = 1
/** The gap along the baseline, as a fraction of the font size, that ends a run. */
const RUN_GAP = 2 * GAP_SPACE
/**
 * How far back, as a fraction of the font size, a character may start from the one before it
 * and stay in its run. Only rounding: a kerned pair moves the next glyph back over the end of
 * the one before, never behind its start.
 */
const JUMP_BACK = 0.01

/** Fractions of the font size used when a run's boxes give it no height. */
const FALLBACK_ASCENT = 0.75
const FALLBACK_DESCENT = 0.25

/** Numbers per character in `geometry`. */
const STRIDE = 15

/** `flags` bits, as @inkbar/engine documents them. */
const GENERATED = 1
const HYPHEN = 2
const UNMAPPED = 4

/** @internal The engine's characters for one page, by shape. */
export interface PageChars {
  count: number
  codes: Uint32Array
  /** 15 per character, as @inkbar/engine documents. */
  geometry: Float32Array
  flags: Uint8Array
  fonts: Uint16Array
  fontTable: readonly {
    name: string
    fixedPitch: boolean
    serif: boolean
    vertical: boolean
  }[]
}

/** @internal The CSS generic family the text layer uses for a font. */
export type GenericFamily = 'monospace' | 'serif' | 'sans-serif'

type Dir = TextItem['dir']

/** Scripts written right to left. JavaScript has no bidi-class property to ask instead. */
const RTL_LETTER =
  /^(?:\p{Script=Hebrew}|\p{Script=Arabic}|\p{Script=Syriac}|\p{Script=Thaana}|\p{Script=Nko}|\p{Script=Samaritan}|\p{Script=Mandaic}|\p{Script=Adlam})$/u
const LETTER = /^\p{L}$/u

/** The direction a strong character sets, or undefined for one that sets none. */
function strongDir(text: string, code: number): 'ltr' | 'rtl' | undefined {
  // Latin and the other scripts below Hebrew are left to right: no expression is needed.
  if (code < 0x0590) return LETTER.test(text) ? 'ltr' : undefined
  if (!LETTER.test(text)) return undefined
  return RTL_LETTER.test(text) ? 'rtl' : 'ltr'
}

const finite = (n: number): number => (Number.isFinite(n) ? n : 0)

/** What one character contributes to its run's string, or '' for one left out. */
function textOf(code: number, flag: number): string {
  if (flag & UNMAPPED) return ''
  // The engine reports a hyphen at a line end by its flag, with a control code for the character.
  if (flag & HYPHEN && code < 0x20) return '-'
  if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return ''
  return String.fromCodePoint(code)
}

/** A character read from the engine's arrays. */
interface Char {
  index: number
  text: string
  flag: number
  font: number
  size: number
  origin: Point
  /** Unit vector along the baseline, from the text matrix. */
  along: Point
  /** Unit vector the glyphs stand up along. */
  up: Point
  /** Loose box: left, bottom, right, top. */
  box: readonly [number, number, number, number]
}

function readChar(chars: PageChars, index: number): Char {
  const g = chars.geometry
  const at = index * STRIDE
  const n = (k: number) => finite(g[at + k]!)
  const a = n(11)
  const b = n(12)
  const c = n(13)
  const d = n(14)
  const lenAlong = Math.hypot(a, b)
  const along = lenAlong > 0 ? { x: a / lenAlong, y: b / lenAlong } : { x: 1, y: 0 }
  // A mirrored matrix stands its glyphs on the other side of the baseline.
  const up = a * d - b * c < 0 ? { x: along.y, y: -along.x } : { x: -along.y, y: along.x }
  const code = chars.codes[index] ?? 0
  const flag = chars.flags[index] ?? 0
  const size = n(10)
  return {
    index,
    text: textOf(code, flag),
    flag,
    font: chars.fonts[index] ?? 0,
    size: size > 0 ? size : 0,
    origin: { x: n(8), y: n(9) },
    along,
    up,
    box: [n(4), n(5), n(6), n(7)],
  }
}

const isLineBreak = (c: Char): boolean =>
  (c.flag & GENERATED) !== 0 && (c.text === '\r' || c.text === '\n')

/** The size thresholds scale by: the font size, or 1 point for a font of no size. */
const scaleOf = (size: number): number => (size > 0 ? size : 1)

const dot = (p: Point, q: Point): number => p.x * q.x + p.y * q.y

/**
 * Where the line through `c`'s origin along `dir` enters and leaves its loose box, as distances
 * from the origin. A box the line misses, or one with no size, gives [0, 0].
 */
function slab(c: Char, dir: Point): [number, number] {
  const [left, bottom, right, top] = c.box
  const eps = 1e-3 * scaleOf(c.size)
  let lo = -Infinity
  let hi = Infinity
  const axis = (o: number, v: number, min: number, max: number): boolean => {
    if (Math.abs(v) < 1e-9) return o >= min - eps && o <= max + eps
    const t0 = (min - o) / v
    const t1 = (max - o) / v
    lo = Math.max(lo, Math.min(t0, t1))
    hi = Math.min(hi, Math.max(t0, t1))
    return true
  }
  if (!axis(c.origin.x, dir.x, left, right) || !axis(c.origin.y, dir.y, bottom, top))
    return [0, 0]
  if (!(lo <= hi) || !Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 0]
  return [lo, hi]
}

/** The run's frame: the unit vector a reader's eye moves along, for a run of `dir`. */
function readingDir(c: Char, dir: Dir): Point {
  if (dir === 'rtl') return { x: -c.along.x, y: -c.along.y }
  if (dir === 'ttb') return { x: -c.up.x, y: -c.up.y }
  return c.along
}

/**
 * Where `c` starts and ends along `read`, measured from `from`. A glyph is drawn from its origin
 * along its baseline, so left to right it starts at the origin and right to left it ends there;
 * a vertical glyph's origin sits inside its cell, so its box gives both ends.
 */
function extent(c: Char, dir: Dir, read: Point, from: Point): [number, number] {
  const o = dot({ x: c.origin.x - from.x, y: c.origin.y - from.y }, read)
  const [lo, hi] = slab(c, read)
  if (dir === 'ltr') return [o, o + Math.max(hi, 0)]
  if (dir === 'rtl') return [o + Math.min(lo, 0), o]
  return [o + lo, o + Math.max(hi, lo)]
}

function angleOf(p: Point): number {
  return (Math.atan2(p.y, p.x) * 180) / Math.PI
}

function sameAngle(a: Point, b: Point): boolean {
  let diff = Math.abs(angleOf(a) - angleOf(b)) % 360
  if (diff > 180) diff = 360 - diff
  return diff <= ANGLE_TOLERANCE
}

function familyOf(font: PageChars['fontTable'][number] | undefined): GenericFamily {
  if (font?.fixedPitch) return 'monospace'
  if (font?.serif) return 'serif'
  return 'sans-serif'
}

/** How a built item lies: its direction, the directions of its quad, and its height about its baseline. */
interface Frame {
  dir: Dir
  /** Unit vector from `p3` to `p4`. */
  base: Point
  /** Unit vector from `p3` to `p1`. */
  up: Point
  below: number
  above: number
}

/** A run being built: its characters, in the engine's order, and what they share. */
interface Run {
  chars: Char[]
  font: number
  size: number
  /** Set by the first strong character, or by the font for vertical text. */
  dir: Dir | undefined
  /** The last character that is not a pending generated one. */
  last: Char
}

/**
 * @internal `TextItem`s for the page, and each item's generic family (same length as `items`).
 *
 * A run ends where the font or its size changes, where the baseline turns or moves off by more
 * than `BASELINE_TOLERANCE` of the size, where the next character starts more than `RUN_GAP` of
 * the size past the last one's end or jumps back behind its start, where a strong character
 * reads the other way, and at a line break the engine reports. A space the engine generated is
 * kept inside a run, where it spans the gap between its neighbours; between two runs it is an
 * item of its own; before a line break it is dropped. A right-to-left run's string is in reading order
 * and its quad runs along the baseline, as a PDF.js item's does, so its `advances` fall from 1 at
 * the quad's right end to 0 at its left.
 */
export function runsFromChars(
  page: number,
  chars: PageChars
): { content: TextContent; families: GenericFamily[] } {
  const items: TextItem[] = []
  const families: GenericFamily[] = []
  let run: Run | undefined
  /** A generated space waiting to see whether the run goes on past it. */
  let pending: Char | undefined
  /** How the last item built lies, for a space that follows it. */
  let frame: Frame | undefined

  const vertical = (font: number): boolean => chars.fontTable[font]?.vertical === true

  const flush = (eol: boolean): void => {
    pending = undefined
    if (!run) return
    const built = buildItem(run, eol)
    const font = run.font
    run = undefined
    if (!built) return
    items.push(built)
    families.push(familyOf(chars.fontTable[font]))
  }

  /**
   * The generated space `space` between the item just built and the run `next` starts, as an
   * item of its own, as PDF.js gives one: it spans the gap along the item's baseline, at the
   * item's height, so text copied across the two keeps its space.
   */
  const spaceBetween = (space: Char, next: Char): void => {
    if (!frame) return
    const { dir, base, up, below, above } = frame
    const read = dir === 'rtl' ? { x: -base.x, y: -base.y } : base
    const [start] = extent(next, dir, read, space.origin)
    const gap = Math.max(0, start)
    // Right to left, the gap lies against the baseline from the space's origin.
    const low = dir === 'rtl' ? -gap : 0
    const p3 = {
      x: space.origin.x + base.x * low + up.x * below,
      y: space.origin.y + base.y * low + up.y * below,
    }
    const p4 = { x: p3.x + base.x * gap, y: p3.y + base.y * gap }
    const height = above - below
    const p1 = { x: p3.x + up.x * height, y: p3.y + up.y * height }
    const p2 = { x: p4.x + up.x * height, y: p4.y + up.y * height }
    const quad: Quad = { p1, p2, p3, p4 }
    const rtl = dir === 'rtl'
    items.push({
      str: ' ',
      dir,
      fontName: chars.fontTable[space.font]?.name ?? '',
      fontSize: space.size,
      hasEOL: false,
      quad,
      rect: rectFromQuad(quad),
      advances: rtl ? [1, 0] : [0, 1],
      glyphEnds: rtl ? [0] : [1],
    })
    families.push(familyOf(chars.fontTable[space.font]))
  }

  /** Whether `c` carries on `r`, read as `dir`. */
  const continues = (r: Run, c: Char, dir: Dir): boolean => {
    if (c.font !== r.font) return false
    if (Math.abs(c.size - r.size) > 1e-3 * scaleOf(r.size)) return false
    const first = r.chars[0]!
    if (!sameAngle(c.along, first.along)) return false
    const scale = scaleOf(r.size)
    const read = readingDir(first, dir)
    // Off the line through the run's first origin, measured across the reading direction.
    const dx = c.origin.x - first.origin.x
    const dy = c.origin.y - first.origin.y
    if (Math.abs(dx * -read.y + dy * read.x) > BASELINE_TOLERANCE * scale) return false
    const [prevStart, prevEnd] = extent(r.last, dir, read, first.origin)
    const [start] = extent(c, dir, read, first.origin)
    if (start - prevEnd > RUN_GAP * scale) return false
    return start >= prevStart - JUMP_BACK * scale
  }

  // Only as far as every array goes, whatever `count` says.
  const count = Math.max(
    0,
    Math.min(
      chars.count,
      chars.codes.length,
      chars.flags.length,
      chars.fonts.length,
      Math.floor(chars.geometry.length / STRIDE)
    )
  )
  for (let i = 0; i < count; i++) {
    const c = readChar(chars, i)
    if (isLineBreak(c)) {
      flush(true)
      const lastItem = items[items.length - 1]
      if (lastItem) lastItem.hasEOL = true
      continue
    }
    if (c.flag & GENERATED) {
      // Kept in the run if it goes on past it, else made an item of its own between the two.
      if (run) pending = c
      continue
    }
    const strong = vertical(c.font) ? undefined : strongDir(c.text, chars.codes[i] ?? 0)
    if (run) {
      const conflict = strong !== undefined && run.dir !== undefined && strong !== run.dir
      const dir = run.dir ?? strong ?? 'ltr'
      if (!conflict && continues(run, c, dir)) {
        if (pending) run.chars.push(pending)
        pending = undefined
        run.chars.push(c)
        run.last = c
        run.dir ??= strong
        continue
      }
      // The engine leaves out the line break after a hyphen it marks: the run ends its line.
      const hyphenEnds = (run.last.flag & HYPHEN) !== 0
      const space = hyphenEnds ? undefined : pending
      frame = undefined
      flush(hyphenEnds)
      if (space) spaceBetween(space, c)
    }
    run = {
      chars: [c],
      font: c.font,
      size: c.size,
      dir: vertical(c.font) ? 'ttb' : strong,
      last: c,
    }
  }
  flush(true)
  // The page's last run ends its line.
  const lastItem = items[items.length - 1]
  if (lastItem) lastItem.hasEOL = true
  return { content: { page, items }, families }

  function buildItem(r: Run, eol: boolean): TextItem | undefined {
    const dir: Dir = r.dir ?? 'ltr'
    const first = r.chars[0]!
    // The quad runs along the baseline, or down the column for vertical text.
    const base = dir === 'ttb' ? readingDir(first, 'ttb') : first.along
    const up = dir === 'ttb' ? { x: -base.y, y: base.x } : first.up
    const from = first.origin
    let low = Infinity
    let high = -Infinity
    let below = Infinity
    let above = -Infinity
    const spans: [number, number][] = []
    for (const c of r.chars) {
      // A generated space is placed by the engine one advance along page x from the character
      // before it, whatever way the text runs, so it says nothing of the run's extent or height.
      // Its span is set below, from its neighbours.
      if (c.flag & GENERATED) {
        spans.push([0, 0])
        continue
      }
      // Extents along `base`. Right-to-left glyphs are drawn rightwards from their origins too.
      const [s, e] = extent(c, dir === 'ttb' ? 'ttb' : 'ltr', base, from)
      spans.push([s, e])
      low = Math.min(low, s)
      high = Math.max(high, e)
      const [left, bottom, right, top] = c.box
      for (const x of [left, right])
        for (const y of [bottom, top]) {
          const h = (x - from.x) * up.x + (y - from.y) * up.y
          below = Math.min(below, h)
          above = Math.max(above, h)
        }
    }
    // A generated space is only ever kept between two drawn characters. It takes the stretch
    // along the baseline from where the one before it ends to where the one after it starts.
    r.chars.forEach((c, k) => {
      const prev = spans[k - 1]
      const next = spans[k + 1]
      if (!(c.flag & GENERATED) || !prev || !next) return
      const forward = prev[0] + prev[1] <= next[0] + next[1]
      const a = forward ? prev[1] : prev[0]
      const b = forward ? next[0] : next[1]
      spans[k] = [Math.min(a, b), Math.max(a, b)]
    })
    let str = ''
    const advances: number[] = []
    const glyphEnds: number[] = []
    const width = high - low
    const at = (t: number): number => (width > 0 ? (t - low) / width : 0)
    // Characters that share one box, a ligature's, share it out evenly.
    const mapped = r.chars.flatMap((c, k) => (c.text === '' ? [] : [k]))
    for (let m = 0; m < mapped.length;) {
      const [s, e] = spans[mapped[m]!]!
      let n = m + 1
      const eps = 1e-3 * scaleOf(r.size)
      while (n < mapped.length) {
        const [s2, e2] = spans[mapped[n]!]!
        if (e - s <= eps || Math.abs(s2 - s) > eps || Math.abs(e2 - e) > eps) break
        n++
      }
      const share = n - m
      for (let j = 0; j < share; j++) {
        const c = r.chars[mapped[m + j]!]!
        const lo = s + ((e - s) * j) / share
        const hi = s + ((e - s) * (j + 1)) / share
        // Measured from the quad's start: right to left, a character starts at its right end.
        const startAt = dir === 'rtl' ? at(hi) : at(lo)
        const endAt = dir === 'rtl' ? at(lo) : at(hi)
        str += c.text
        advances.push(startAt)
        glyphEnds.push(endAt)
        // A code point above U+FFFF takes two units; the second's boundary is the glyph's end.
        if (c.text.length === 2) {
          advances.push(endAt)
          glyphEnds.push(endAt)
        }
      }
      m = n
    }
    if (str === '') return undefined
    advances.push(dir === 'rtl' ? 0 : 1)
    if (!(width > 0)) {
      // No extent to measure: every character takes an equal share, falling right to left.
      const share = (t: number): number => (dir === 'rtl' ? 1 - t : t)
      for (let k = 0; k < str.length; k++) {
        advances[k] = share(k / str.length)
        glyphEnds[k] = share((k + 1) / str.length)
      }
      advances[str.length] = share(1)
    }
    const scale = scaleOf(r.size)
    if (!(above > below)) {
      below = -FALLBACK_DESCENT * scale
      above = FALLBACK_ASCENT * scale
    }
    const p3 = {
      x: from.x + base.x * low + up.x * below,
      y: from.y + base.y * low + up.y * below,
    }
    const p4 = { x: p3.x + base.x * width, y: p3.y + base.y * width }
    const height = above - below
    const p1 = { x: p3.x + up.x * height, y: p3.y + up.y * height }
    const p2 = { x: p4.x + up.x * height, y: p4.y + up.y * height }
    const quad: Quad = { p1, p2, p3, p4 }
    frame = { dir, base, up, below, above }
    return {
      str,
      dir,
      fontName: chars.fontTable[r.font]?.name ?? '',
      fontSize: r.size,
      hasEOL: eol,
      quad,
      rect: rectFromQuad(quad),
      advances,
      glyphEnds,
    }
  }
}
