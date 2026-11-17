import { clusters } from './clusters'
import { CHARS, WIDTHS } from './metrics-data'

import type { TextFont, TextMeasure } from '../types'

/** What a font name says about its family. Order matters: Times first, so "Noto Serif" is serif. */
const TIMES = /times|serif|roman|georgia|garamond|minion|cambria|palatino/i
const COURIER = /courier|mono|consol|menlo|typewriter|code/i
const SANS = /sans/i

/** The nearest of the three standard families to a font name, keeping bold and italic. */
export function resolveFont(
  fontFamily: string,
  bold: boolean,
  italic: boolean
): TextFont {
  const family =
    TIMES.test(fontFamily) && !SANS.test(fontFamily)
      ? 'Times'
      : COURIER.test(fontFamily)
        ? 'Courier'
        : 'Helvetica'
  return { family, bold, italic }
}

/**
 * What a Courier character measures, in ems. Adobe's table says 0.6, and a PDF viewer using
 * Courier advances 0.6. The fonts a browser puts on screen for Courier, Courier New and Liberation
 * Mono, advance 1229/2048 = 0.60010 em, which is 0.017% wider; a line that fills a box at exactly
 * 0.6 em per character then wraps one character early on screen. The layout follows the screen
 * fonts. The generated table keeps Adobe's 600, so it stays a faithful copy of its source, and
 * the Courier width in it is not read.
 */
export const COURIER_ADVANCE = 1229 / 2048

/** Line metrics of the fonts browsers substitute, as fractions of the size. */
const VERTICAL = {
  Helvetica: { ascent: 0.905, descent: 0.212 },
  Times: { ascent: 0.891, descent: 0.216 },
  Courier: { ascent: 0.833, descent: 0.3 },
} as const

let index: Map<string, number> | undefined
const indexOf = (char: string): number | undefined => {
  if (!index) {
    index = new Map()
    let i = 0
    for (const c of CHARS) index.set(c, i++)
  }
  return index.get(char)
}

/** Characters that take no room and draw nothing: marks, zero-width spaces and joiners, soft hyphen, variation selectors. */
export function isZeroWidth(char: string): boolean {
  return /^[\p{Mn}\p{Me}\p{Cf}]$/u.test(char) && !PREPENDED.test(char)
}

/** Format characters that draw: the prepended marks that number signs and the like are made of. */
const PREPENDED = /^[\u0600-\u0605\u06dd\u070f\u0890\u0891\u08e2\u{110bd}\u{110cd}]$/u

/** Ranges of East Asian Wide and Fullwidth characters, and of emoji, in order of code point. */
const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x231a, 0x231b],
  [0x23e9, 0x23f3],
  [0x25fd, 0x25fe],
  [0x2614, 0x2615],
  [0x2648, 0x2653],
  [0x267f, 0x267f],
  [0x2693, 0x2693],
  [0x26a1, 0x26a1],
  [0x26aa, 0x26ab],
  [0x26bd, 0x26be],
  [0x26c4, 0x26c5],
  [0x26ce, 0x26ce],
  [0x26d4, 0x26d4],
  [0x26ea, 0x26ea],
  [0x26f2, 0x26f3],
  [0x26f5, 0x26f5],
  [0x26fa, 0x26fa],
  [0x26fd, 0x26fd],
  [0x2705, 0x2705],
  [0x270a, 0x270b],
  [0x2728, 0x2728],
  [0x274c, 0x274c],
  [0x274e, 0x274e],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27b0, 0x27b0],
  [0x27bf, 0x27bf],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x2e80, 0x303e], // CJK radicals, Kangxi, ideographic space and punctuation
  [0x3041, 0x33ff], // Hiragana, Katakana, Bopomofo, Hangul compatibility, CJK compatibility
  [0x3400, 0x4dbf], // CJK extension A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xa000, 0xa4cf], // Yi
  [0xa960, 0xa97f], // Hangul Jamo extended A
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe30, 0xfe6f], // CJK compatibility forms, small forms
  [0xff00, 0xff60], // Fullwidth forms
  [0xffe0, 0xffe6], // Fullwidth signs
  [0x1f004, 0x1f004],
  [0x1f0cf, 0x1f0cf],
  [0x1f18e, 0x1f18e],
  [0x1f191, 0x1f19a],
  [0x1f1e6, 0x1f1ff], // Regional indicators (flags)
  [0x1f200, 0x1f2ff], // Enclosed ideographic supplement
  [0x1f300, 0x1f64f], // Pictographs and emoticons
  [0x1f680, 0x1f6ff], // Transport and map symbols
  [0x1f7e0, 0x1f7eb],
  [0x1f90c, 0x1f9ff], // Supplemental symbols and pictographs
  [0x1fa70, 0x1faff], // Symbols and pictographs extended A
  [0x20000, 0x3fffd], // CJK extensions B and later
]

/** East Asian Wide or Fullwidth, or an emoji. */
export function isWide(char: string): boolean {
  const c = char.codePointAt(0)!
  if (c < 0x1100) return false
  let lo = 0
  let hi = WIDE.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const [from, to] = WIDE[mid]!
    if (c < from) hi = mid - 1
    else if (c > to) lo = mid + 1
    else return true
  }
  return false
}

const FACE = (font: TextFont): number => (font.bold ? 1 : 0) + (font.italic ? 2 : 0)

/**
 * A measure that uses the tables and asks `fallback` for the characters outside them. A character
 * is a cluster (see `clusters`): a family emoji is one character, and a base letter with a mark
 * the tables lack counts as the letter. Text is measured as its NFC form, so a decomposed "e" and
 * an acute accent use the width of "é".
 *
 * Each maximal run of consecutive clusters outside the tables is one call, with the run as a
 * string, so a script that joins its letters (Arabic) is measured as the browser shapes it and not
 * as isolated forms. A space or any character in the tables ends a run; a zero-width character
 * inside a run stays in it (a joiner changes how its neighbours join).
 */
export function measureWith(
  fallback: (run: string, font: TextFont, size: number) => number
): TextMeasure {
  return {
    width(text, font, size) {
      let total = 0
      let outside = false
      const table =
        font.family === 'Courier' ? undefined : WIDTHS[font.family][FACE(font)]
      let run = ''
      const flush = () => {
        if (run === '') return
        total += fallback(run, font, size)
        outside = true
        run = ''
      }
      for (const cluster of clusters(text.normalize('NFC'))) {
        const [base, ...rest] = cluster
        const i = indexOf(base!)
        if (i !== undefined && rest.every(isZeroWidth)) {
          flush()
          total += table ? (table[i]! / 1000) * size : COURIER_ADVANCE * size
        } else if (!isZeroWidth(base!) || !rest.every(isZeroWidth)) {
          run += cluster
        } else if (run !== '') {
          run += cluster
        }
      }
      flush()
      return { width: total, outside }
    },
    vertical: (font) => VERTICAL[font.family],
  }
}

/** Whether `text` has a character outside the tables, so its width came from the fallback. */
export function outsideTables(text: string): boolean {
  for (const cluster of clusters(text.normalize('NFC'))) {
    const [base, ...rest] = cluster
    if (indexOf(base!) !== undefined && rest.every(isZeroWidth)) continue
    if (isZeroWidth(base!) && rest.every(isZeroWidth)) continue
    // A tab is the layout's own business, advancing to a tab stop: not a character to measure.
    if (base === '\t' && rest.length === 0) continue
    return true
  }
  return false
}

/** One size for a wide character, half a size for any other, summed over the run. */
export function fixedWidth(run: string, size: number): number {
  let width = 0
  for (const cluster of clusters(run)) {
    const [base, ...rest] = cluster
    // Zero-width characters (joiners, marks) take no room.
    if (isZeroWidth(base!) && rest.every(isZeroWidth)) continue
    width += isWide(cluster) ? size : size / 2
  }
  return width
}

/** The measure with no browser: a fixed rule for what the tables lack. */
export const standardMeasure: TextMeasure = measureWith((run, _font, size) =>
  fixedWidth(run, size)
)
