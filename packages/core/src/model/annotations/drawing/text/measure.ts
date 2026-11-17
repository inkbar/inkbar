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

/**
 * Whether `cluster` is a character of the tables: its base is one, and the rest only marks that
 * add nothing (an accent NFC could not fold in, a joiner). U+FE0F (emoji presentation) and U+20E3
 * (the enclosing keycap) change what is drawn, so "1" followed by either is an emoji, not the
 * digit.
 */
function inTables(cluster: string): boolean {
  const [base, ...rest] = cluster
  return (
    indexOf(base!) !== undefined &&
    rest.every((c) => isZeroWidth(c) && c !== '\ufe0f' && c !== '\u20e3')
  )
}

/** Format characters that draw: the prepended marks that number signs and the like are made of. */
const PREPENDED = /^[\u0600-\u0605\u06dd\u070f\u0890\u0891\u08e2\u{110bd}\u{110cd}]$/u

/** Ranges of East Asian Wide and Fullwidth characters (the emoji are told by their properties), in order of code point. */
const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f], // Hangul Jamo
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
  [0x1f200, 0x1f2ff], // Enclosed ideographic supplement
  [0x20000, 0x3fffd], // CJK extensions B and later
]

/** An emoji drawn as one by default (a pictograph, a flag half, a skin tone). */
const EMOJI_PRESENTATION = /^\p{Emoji_Presentation}/u
/** A pictograph that is a symbol until U+FE0F asks for the emoji: a heart, a sun, a warning sign. */
const PICTOGRAPHIC = /^\p{Extended_Pictographic}/u

/** East Asian Wide or Fullwidth, or an emoji. */
export function isWide(char: string): boolean {
  const c = char.codePointAt(0)!
  if (char.includes('\u20e3')) return true
  if (char.includes('\ufe0f') && PICTOGRAPHIC.test(char)) return true
  if (c < 0x1100) return false
  if (EMOJI_PRESENTATION.test(char)) return true
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
        if (inTables(cluster)) {
          flush()
          const i = indexOf(base!)!
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
    if (inTables(cluster)) continue
    if (isZeroWidth(base!) && rest.every(isZeroWidth)) continue
    // A tab is the layout's own business, advancing to a tab stop: not a character to measure.
    if (base === '\t' && rest.length === 0) continue
    return true
  }
  return false
}

/**
 * What a run costs with no browser: one size for a wide character, and for any other half a size,
 * or the Courier advance in Courier, summed over the run.
 */
export function fixedWidth(run: string, font: TextFont, size: number): number {
  const narrow = font.family === 'Courier' ? COURIER_ADVANCE * size : size / 2
  let width = 0
  for (const cluster of clusters(run)) {
    const [base, ...rest] = cluster
    // Zero-width characters (joiners, marks) take no room.
    if (isZeroWidth(base!) && rest.every(isZeroWidth)) continue
    width += isWide(cluster) ? size : narrow
  }
  return width
}

/** The measure with no browser: a fixed rule for what the tables lack. */
export const standardMeasure: TextMeasure = measureWith(fixedWidth)
