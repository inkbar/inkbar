import { rectFromQuad, type Point, type Quad, type Rect } from './geometry'
import { glyphAdvances, type PageGlyph, type TextRun } from './glyph-advances'

import type { PdfjsTextContent, PdfjsTextItem } from '../pdfjs/types'

export interface TextItem {
  str: string
  dir: 'ltr' | 'rtl' | 'ttb'
  fontName: string
  fontSize: number
  hasEOL: boolean
  /** Glyph-run box in user space, following the run's rotation. */
  quad: Quad
  /** Axis-aligned bounds of `quad`. */
  rect: Rect
  /**
   * How far along the run each character boundary lies, as a fraction of its width: `str.length + 1`
   * entries, from 0 to 1 or a little past it. Taken from where the page draws each glyph when the
   * glyphs can be matched to the run, else measured in the run's fallback font. Absent when neither
   * works, in which case every character takes an equal share.
   */
  advances?: readonly number[]
  /**
   * Where each character's glyph ends, as a fraction of the run's width: `str.length` entries, set
   * with `advances` when they come from the page's glyphs. Kerning can pull the next character
   * back over the end of a glyph, so a glyph may end past the next boundary.
   */
  glyphEnds?: readonly number[]
}

/** How far `char` advances in `fontFamily`, in any unit; only ratios within a run are used. */
export type MeasureChar = (char: string, fontFamily: string) => number

export interface TextContent {
  page: number
  items: TextItem[]
}

/** Fractions of the font size used when PDF.js has no usable metrics for the font. */
const FALLBACK_ASCENT = 0.75
const FALLBACK_DESCENT = 0.25

/**
 * Converts `getTextContent()` output to user-space boxes.
 *
 * For an item with transform [a, b, c, d, e, f] (already in user space):
 * - (e, f) is the start of the run on the baseline;
 * - u = (a, b) / |(a, b)| is the baseline direction, along which the run advances `width`;
 * - v = (c, d) / |(c, d)| is the glyph-up direction, and `fontSize` = |(c, d)|;
 * - the box spans from `descent * fontSize` below the baseline to `ascent * fontSize` above it,
 *   using the font's ascent/descent from `styles` when PDF.js provides them, else 0.75 / 0.25.
 *
 * So p3 = (e, f) - v * descent * fontSize, p4 = p3 + u * width, p1 = p3 + v * (ascent + descent) * fontSize,
 * p2 = p4 + (p1 - p3). `rect` is the axis-aligned bounding box of the quad.
 */
export function textContentFromPdfjs(
  page: number,
  tc: PdfjsTextContent,
  measure?: MeasureChar,
  glyphs?: readonly PageGlyph[]
): TextContent {
  const items: TextItem[] = []
  const runs: TextRun[] = []
  const families: string[] = []
  for (const raw of tc.items) {
    if (!('str' in raw)) continue
    const item: PdfjsTextItem = raw
    const [a, b, c, d, e, f] = item.transform as [
      number,
      number,
      number,
      number,
      number,
      number,
    ]
    const baseLen = Math.hypot(a, b)
    const fontSize = Math.hypot(c, d)
    const u: Point = baseLen === 0 ? { x: 1, y: 0 } : { x: a / baseLen, y: b / baseLen }
    const v: Point =
      fontSize === 0 ? { x: -u.y, y: u.x } : { x: c / fontSize, y: d / fontSize }
    const { ascent, descent } = metrics(tc.styles[item.fontName])
    const below = descent * fontSize
    const total = (ascent + descent) * fontSize
    const w = item.width
    const p3 = { x: e - v.x * below, y: f - v.y * below }
    const p4 = { x: p3.x + u.x * w, y: p3.y + u.y * w }
    const p1 = { x: p3.x + v.x * total, y: p3.y + v.y * total }
    const p2 = { x: p4.x + v.x * total, y: p4.y + v.y * total }
    const quad: Quad = { p1, p2, p3, p4 }
    const dir = isDir(item.dir) ? item.dir : 'ltr'
    items.push({
      str: item.str,
      dir,
      fontName: item.fontName,
      fontSize,
      hasEOL: item.hasEOL,
      quad,
      rect: rectFromQuad(quad),
    })
    runs.push({
      str: item.str,
      dir,
      fontSize,
      origin: { x: e, y: f },
      along: u,
      width: w,
    })
    families.push(tc.styles[item.fontName]?.fontFamily ?? 'sans-serif')
  }
  // The glyphs the page draws give exact boundaries; measuring is the fallback for the rest.
  const exact = glyphs ? glyphAdvances(runs, glyphs) : []
  items.forEach((it, i) => {
    const bounds = exact[i]
    if (bounds) {
      it.advances = bounds.advances
      it.glyphEnds = bounds.ends
    } else if (measure && it.dir === 'ltr') {
      const advances = advancesOf(it.str, families[i]!, measure)
      if (advances) it.advances = advances
    }
  })
  return { page, items }
}

/** Each character boundary of `str` as a fraction of its measured width, or undefined if it measures 0. */
function advancesOf(
  str: string,
  family: string,
  measure: MeasureChar
): number[] | undefined {
  const ends = [0]
  let sum = 0
  for (let i = 0; i < str.length; i++) {
    const cp = str.codePointAt(i)!
    // A surrogate pair is measured whole on its first unit; the second unit adds nothing.
    if (cp > 0xffff) {
      sum += measure(String.fromCodePoint(cp), family)
      ends.push(sum)
      i++
    } else sum += measure(str[i]!, family)
    ends.push(sum)
  }
  if (!(sum > 0)) return undefined
  return ends.map((e) => e / sum)
}

function metrics(style: PdfjsTextContent['styles'][string] | undefined): {
  ascent: number
  descent: number
} {
  // Vertical fonts report metrics for horizontal layout, so they get the fallback box too.
  if (!style || style.vertical)
    return { ascent: FALLBACK_ASCENT, descent: FALLBACK_DESCENT }
  const ascent = style.ascent
  const descent = Math.abs(style.descent)
  if (!(ascent > 0) || !Number.isFinite(descent) || ascent + descent <= 0) {
    return { ascent: FALLBACK_ASCENT, descent: FALLBACK_DESCENT }
  }
  return { ascent, descent }
}

function isDir(dir: string): dir is TextItem['dir'] {
  return dir === 'ltr' || dir === 'rtl' || dir === 'ttb'
}
