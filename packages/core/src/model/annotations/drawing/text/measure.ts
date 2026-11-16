import { CHARS, COURIER_WIDTH, WIDTHS } from './metrics-data'

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

/** Characters that take no room and draw nothing: zero-width spaces and joiners, soft hyphen, variation selectors. */
export function isZeroWidth(char: string): boolean {
  const c = char.codePointAt(0)!
  return (
    (c >= 0x200b && c <= 0x200d) ||
    c === 0x2060 ||
    c === 0xfeff ||
    c === 0xad ||
    (c >= 0xfe00 && c <= 0xfe0f)
  )
}

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

/** A measure that uses the tables and asks `fallback` for each character that is not in them. */
export function measureWith(
  fallback: (char: string, font: TextFont, size: number) => number
): TextMeasure {
  return {
    width(text, font, size) {
      let total = 0
      let outside = false
      const table =
        font.family === 'Courier' ? undefined : WIDTHS[font.family][FACE(font)]
      for (const char of text) {
        const i = indexOf(char)
        if (i !== undefined) {
          total += ((table ? table[i]! : COURIER_WIDTH) / 1000) * size
        } else if (!isZeroWidth(char)) {
          total += fallback(char, font, size)
          outside = true
        }
      }
      return { width: total, outside }
    },
    vertical: (font) => VERTICAL[font.family],
  }
}

/** One size for a wide character, half a size for any other. */
export const standardMeasure: TextMeasure = measureWith((char, _font, size) =>
  isWide(char) ? size : size / 2
)
