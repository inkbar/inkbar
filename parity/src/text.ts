// Compares two readers' text for a page: the string search matches against, and where each of its
// characters sits.

// Core's own joining, so the check compares what search matches against. It is not part of
// core's public exports; the module is pure, with type imports only.
import { searchableText } from '../../packages/core/src/model/search-text'

import type { TextContent, TextItem } from '@inkbar/core'

/**
 * How far apart, as a fraction of the font size, the two readers may place a character's centre,
 * or an item boundary in a stretch.
 * Set from the measured noise: see the README.
 */
export const TEXT_TOLERANCE = 0.25

const WHITESPACE = /\s+/gu
const IS_WHITESPACE = /^\s+$/u

/** A page's text as search joins it, whitespace runs collapsed to one space, trimmed. */
export function joinedText(content: TextContent): string {
  return searchableText(content).raw.replace(WHITESPACE, ' ').trim()
}

/**
 * Where along `it`'s quad character boundary `k` lies, as a fraction from the `p3` end. From the
 * item's own `advances`, rising or falling; without them each character takes an equal share,
 * counted from the end the text reads from: `p3` for left-to-right and vertical text, `p4` for
 * right-to-left.
 */
function boundary(it: TextItem, k: number): number {
  if (it.advances) return it.advances[k]!
  const share = it.str.length === 0 ? 0 : k / it.str.length
  return it.dir === 'rtl' ? 1 - share : share
}

/**
 * One character that is not whitespace: its centre, where it starts and ends along its item in
 * reading order, its font size and the item it is in.
 */
interface Place {
  char: string
  x: number
  y: number
  start: Point
  end: Point
  fontSize: number
  item: number
}

interface Point {
  x: number
  y: number
}

/**
 * The middle of `it`'s box across its baseline at `t` along it: halfway between top and
 * baseline.
 */
function across(it: TextItem, t: number): Point {
  const { p1, p2, p3, p4 } = it.quad
  return {
    x: (p3.x + (p4.x - p3.x) * t + p1.x + (p2.x - p1.x) * t) / 2,
    y: (p3.y + (p4.y - p3.y) * t + p1.y + (p2.y - p1.y) * t) / 2,
  }
}

function places(content: TextContent): Place[] {
  const st = searchableText(content)
  const out: Place[] = []
  for (let r = 0; r < st.raw.length;) {
    const char = String.fromCodePoint(st.raw.codePointAt(r)!)
    const i = st.rawToItem[r]!
    const k = st.rawToOffset[r]!
    r += char.length
    if (i < 0 || IS_WHITESPACE.test(char)) continue
    const it = content.items[i]!
    const t0 = boundary(it, k)
    const t1 = boundary(it, k + char.length)
    out.push({
      char,
      ...across(it, (t0 + t1) / 2),
      start: across(it, t0),
      end: across(it, t1),
      fontSize: it.fontSize,
      item: i,
    })
  }
  return out
}

/**
 * One entry per character of `joinedText` that is not whitespace: the centre of its box, in user
 * space.
 */
export function charCentres(
  content: TextContent
): { char: string; x: number; y: number; fontSize: number }[] {
  return places(content).map(({ char, x, y, fontSize }) => ({ char, x, y, fontSize }))
}

export interface TextComparison {
  /** Whether the joined strings are equal and every character lies within `TEXT_TOLERANCE`. */
  same: boolean
  /** The first index into `joinedText` where the strings differ; absent when they are equal. */
  firstDifference?: number
  /**
   * The largest offset found, as a fraction of the font size (the larger of the two readers'):
   * the larger of `charOffset` and `itemOffset`. 0 for pages with no text, NaN when the strings
   * differ, since their characters cannot then be paired, and Infinity when a box or boundary
   * holds something that is not a finite number.
   */
  worstOffset: number
  /** The index into `joinedText` of the character at `worstOffset`; absent with no characters. */
  worstAt?: number
  /** The largest distance between the centres of characters both readers give boundaries for. */
  charOffset: number
  /**
   * The largest offset between stretches of characters compared at their item boundaries,
   * because one reader gives no boundaries for each character: the largest distance between the
   * two sides' starts or ends of a character at an item boundary on either side.
   */
  itemOffset: number
  /**
   * The lowest and highest ratio of the engine's box height to PDF.js's, over the items holding
   * paired characters. Absent when no characters were paired.
   */
  heightRatio?: [number, number]
}

const height = (it: TextItem) =>
  Math.hypot(it.quad.p1.x - it.quad.p3.x, it.quad.p1.y - it.quad.p3.y)

const distance = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y)

/**
 * Compares page text read by two readers: the joined strings, then where each character sits.
 *
 * A character both readers give boundaries for (`advances`) is compared by its centre. Where
 * either reader's item holds no `advances`, that item lays its characters out at equal shares,
 * which is what `TextItem.advances` documents, so those characters are compared as stretches
 * instead: each stretch is a run of consecutive paired characters in one such item (in one on
 * each side when both lack them). Inside a stretch, the item boundaries of both sides are
 * compared: where a character is the first of the stretch, or the first in its item on either
 * side, the two sides' starts of that character are compared, and where it is the last of the
 * stretch, or the last in its item on either side, their ends. Each side places a character's
 * start and end at the item's `advances`, or at equal shares when the item has none. So every
 * item's place on either side is checked against where the other side puts the same characters,
 * and the readers may split a line into items at different places.
 */
export function compareText(a: TextContent, b: TextContent): TextComparison {
  const ja = joinedText(a)
  const jb = joinedText(b)
  if (ja !== jb) {
    let i = 0
    while (i < ja.length && i < jb.length && ja[i] === jb[i]) i++
    return {
      same: false,
      firstDifference: i,
      worstOffset: NaN,
      charOffset: NaN,
      itemOffset: NaN,
    }
  }
  const pa = places(a)
  const pb = places(b)
  // Each paired character's index into the joined string, which the places skip the spaces of.
  const index: number[] = []
  let at = 0
  for (const p of pa) {
    while (IS_WHITESPACE.test(ja[at]!)) at++
    index.push(at)
    at += p.char.length
  }

  let worstOffset = 0
  let worstAt: number | undefined
  let charOffset = 0
  let itemOffset = 0
  let lowRatio = Infinity
  let highRatio = -Infinity
  const note = (offset: number, where: number) => {
    // Anything not a finite number is a difference, and the worst one.
    const o = Number.isFinite(offset) ? offset : Infinity
    if (worstAt === undefined || o > worstOffset) {
      worstOffset = o
      worstAt = where
    }
    return o
  }
  /**
   * `d` as a fraction of `size`. A zero size leaves the distance in points; a size that is not a
   * finite number gives Infinity, a difference.
   */
  const scale = (d: number, size: number) =>
    !Number.isFinite(size) ? Infinity : size > 0 ? d / size : d

  /** The stretch a character belongs to, by its items without `advances`; undefined when none. */
  const stretchKey = (n: number): string | undefined => {
    const ia = a.items[pa[n]!.item]!
    const ib = b.items[pb[n]!.item]!
    if (ia.advances && ib.advances) return undefined
    return `${ia.advances ? '' : pa[n]!.item}:${ib.advances ? '' : pb[n]!.item}`
  }

  for (let n = 0; n < pa.length;) {
    const p = pa[n]!
    const q = pb[n]!
    const ratio = height(b.items[q.item]!) / height(a.items[p.item]!)
    if (Number.isFinite(ratio)) {
      lowRatio = Math.min(lowRatio, ratio)
      highRatio = Math.max(highRatio, ratio)
    }
    const key = stretchKey(n)
    if (key === undefined) {
      const size = Math.max(p.fontSize, q.fontSize)
      charOffset = Math.max(charOffset, note(scale(distance(p, q), size), index[n]!))
      n++
      continue
    }
    let last = n
    while (last + 1 < pa.length && stretchKey(last + 1) === key) last++
    const size = Math.max(
      ...pa.slice(n, last + 1).map((c) => c.fontSize),
      ...pb.slice(n, last + 1).map((c) => c.fontSize)
    )
    // Every item boundary on either side: where a character is the first of the stretch, or the
    // first in its item on either side, both sides' starts of it; where it is the last of the
    // stretch, or the last in its item on either side, both sides' ends.
    for (let m = n; m <= last; m++) {
      const first =
        m === n || pa[m]!.item !== pa[m - 1]!.item || pb[m]!.item !== pb[m - 1]!.item
      const final =
        m === last || pa[m]!.item !== pa[m + 1]!.item || pb[m]!.item !== pb[m + 1]!.item
      if (first) {
        const d = scale(distance(pa[m]!.start, pb[m]!.start), size)
        itemOffset = Math.max(itemOffset, note(d, index[m]!))
      }
      if (final) {
        const d = scale(distance(pa[m]!.end, pb[m]!.end), size)
        itemOffset = Math.max(itemOffset, note(d, index[m]!))
      }
    }
    // The height ratio of every character in the stretch.
    for (let m = n + 1; m <= last; m++) {
      const r = height(b.items[pb[m]!.item]!) / height(a.items[pa[m]!.item]!)
      if (Number.isFinite(r)) {
        lowRatio = Math.min(lowRatio, r)
        highRatio = Math.max(highRatio, r)
      }
    }
    n = last + 1
  }
  return {
    same: worstOffset <= TEXT_TOLERANCE,
    worstOffset,
    ...(worstAt !== undefined && { worstAt }),
    charOffset,
    itemOffset,
    ...(highRatio >= lowRatio && {
      heightRatio: [lowRatio, highRatio] as [number, number],
    }),
  }
}
