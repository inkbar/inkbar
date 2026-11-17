import { clusters } from './clusters'
import { isWide, outsideTables } from './measure'

import type { TextFont, TextMeasure } from '../types'

export interface TextBlock {
  text: string
  font: TextFont
  size: number
  width: number
  align: 'left' | 'center' | 'right' | 'justify'
}

export interface LaidLine {
  text: string
  x: number
  baseline: number
  width: number
  /**
   * Whether `text` has a character outside the standard tables, so its width is the fallback's
   * estimate and not the font's own: a painter must not force the line to `width`.
   */
  outside: boolean
  /**
   * Extra space to add to each U+0020 in `text`, for a justified line. It applies to U+0020 only.
   * PDF's `Tw` operator does the same, and the SVG `word-spacing` property widens U+0020 and also
   * U+00A0, so a painter that uses it must keep the spacing off no-break spaces (or measure them
   * the same way) for the line to end at the box's edge. Chrome's own justification leaves no-break
   * spaces alone (measured), as this does.
   *
   * Each tab on the line also grows by this much, as it does in Chrome (measured): the tab stops
   * are found on the unjustified line, and every space and tab before a piece moves it right by
   * one `wordSpacing`. The segments' `x` already include that.
   */
  wordSpacing?: number
  /**
   * Only on a line that holds a tab: the pieces between the tabs, each with the `x` it starts at
   * (box-local, like `x`), its width (without any word spacing) and whether it has a character
   * outside the standard tables, so a painter need not reproduce tab stops. The tabs themselves are
   * not in the segments.
   */
  segments?: { text: string; x: number; width: number; outside: boolean }[]
}

interface Row {
  text: string
  /** Width of `text`. */
  width: number
  /** Width of the spaces that hang after `text`. */
  hang: number
  /** Whether the line ended by wrapping, not at a newline or the end of the text. */
  wrapped: boolean
}

/** The line height the text box has always had: `line-height: 1.2`. */
const LINE_HEIGHT = 1.2
/** CSS `tab-size` default, in space widths. */
const TAB_SIZE = 8
/**
 * A line may run this far past the box and still fit. A heuristic tolerance fitted to one measured
 * case, not a unit conversion: Chrome kept a line of 80.015625 px in an 80 px box, which is one
 * 1/64 px layout unit over. Table widths are rounded to a thousandth of the size, so lines this
 * close to the edge can still fall either way.
 */
const EPSILON = 1 / 64 + 1e-6

/** A run of characters up to a break opportunity, then the spaces after it, which hang at a wrap. */
interface Unit {
  word: string[]
  spaces: string
}

const CLOSING =
  /^[\u3001\u3002\uff0c\uff0e\uff1a\uff1b\uff01\uff1f\uff09\uff3d\uff5d\u300d\u300f\u3011\u3015\u3009\u300b\u3017\u3019\u301b\u3005\u301c\u2026\u2025,.!?:;)\]}%\u00bb\u201d\u2019]/u
const OPENING =
  /^[\u3008\u300a\u300c\u300e\u3010\u3014\u3016\u3018\u301a\uff08\uff3b\uff5b([{\u00ab\u201c\u2018]/u
const ALNUM = /^[\p{L}\p{N}]/u
const LETTER = /^\p{L}/u

/**
 * Whether a line may break between the characters `a` and `b`, neither a space. `before` is the
 * character ahead of `a`, if any. These are the opportunities Chrome takes in a `pre-wrap` text
 * box besides spaces: after a zero-width space; after a hyphen-minus between letters or digits;
 * after an en dash or an ellipsis, and around an em dash; after a question mark before a letter; and around a
 * wide (CJK or emoji) character, except before closing punctuation and after opening
 * punctuation. Measured in Chrome: a slash or an exclamation mark is not an opportunity. A no-break
 * space is not a space here, and a soft hyphen is not an opportunity.
 */
function mayBreak(before: string | undefined, a: string, b: string): boolean {
  if (a === '\u200b') return true
  if (CLOSING.test(b)) return false
  if (a === '-') return ALNUM.test(b) && before !== undefined && ALNUM.test(before)
  if (a === '\u2013' || a === '\u2014' || a === '\u2026') return true
  if (b === '\u2014') return !OPENING.test(a)
  if (a === '?') return LETTER.test(b)
  if (isWide(a) || isWide(b)) return !OPENING.test(a)
  return false
}

const isSpace = (c: string) => c === ' ' || c === '\t'

function units(paragraph: string): Unit[] {
  const chars = clusters(paragraph)
  const out: Unit[] = []
  let word: string[] = []
  let i = 0
  while (i < chars.length) {
    const c = chars[i]!
    if (isSpace(c)) {
      let spaces = ''
      while (i < chars.length && isSpace(chars[i]!)) spaces += chars[i++]
      out.push({ word, spaces })
      word = []
      continue
    }
    word.push(c)
    i++
    const next = chars[i]
    if (next === undefined || isSpace(next)) continue
    if (mayBreak(chars[i - 2], c, next)) {
      out.push({ word, spaces: '' })
      word = []
    }
  }
  if (word.length) out.push({ word, spaces: '' })
  return out
}

/**
 * Lays `block.text` out the way a browser lays out a box with `white-space: pre-wrap`,
 * `overflow-wrap: break-word` and `line-height: 1.2`, using `measure` for widths.
 *
 * Lines are in box-local points: `x` from the left edge, `baseline` down from the top edge. A
 * line's `text` and `width` leave out the spaces that hang at its end. Spaces at the start of a
 * line are kept. A tab advances to the next multiple of eight space widths from the line's start
 * and stays a tab in `text`; `segments` gives the pieces between tabs with their own `x`. A word
 * wider than the box starts on its own line, then breaks between characters. Text is laid out in
 * its NFC form.
 */
export function layoutText(
  block: TextBlock,
  measure: TextMeasure
): { lines: LaidLine[]; height: number; outside: boolean } {
  const { font, size, width: boxWidth, align } = block
  const { ascent, descent } = measure.vertical(font)
  const lineHeight = LINE_HEIGHT * size
  const firstBaseline = (lineHeight - (ascent + descent) * size) / 2 + ascent * size
  let outside = false

  const widthOf = (text: string): number => {
    const m = measure.width(text, font, size)
    if (m.outside) outside = true
    return m.width
  }
  const spaceWidth = widthOf(' ')
  const tabWidth = TAB_SIZE * spaceWidth
  /** Where the line is after `spaces`, placed with it already `x` wide. */
  const advance = (x: number, spaces: string): number => {
    for (const c of spaces) {
      if (c === '\t')
        x = tabWidth > 0 ? (Math.floor(x / tabWidth + 1e-9) + 1) * tabWidth : x
      else x += spaceWidth
    }
    return x
  }

  const rows: Row[] = []
  const text = block.text.normalize('NFC').replace(/\r\n?/g, '\n')

  for (const paragraph of text.split('\n')) {
    let line = ''
    let visible = 0 // width of `line`, which has no hanging spaces
    let x = 0 // where the next character goes, hanging spaces included
    let started = false // anything on this line, spaces too
    let hang = '' // spaces after `line`, still hanging
    const wrap = () => {
      rows.push({ text: line, width: visible, hang: x - visible, wrapped: true })
      line = ''
      visible = 0
      x = 0
      started = false
      hang = ''
    }

    for (const unit of units(paragraph)) {
      if (unit.word.length) {
        // The spaces before this word are part of the line now, unless the word wraps.
        let from = 0
        let wordWidth = widthOf(unit.word.join(''))
        if (x + wordWidth > boxWidth + EPSILON && started) wrap()
        line += hang
        hang = ''
        if (x + wordWidth > boxWidth + EPSILON) {
          // Too wide for an empty line: take as many characters as fit, at least one. Each
          // character is measured once, so a long word costs a single pass.
          const cw = unit.word.map(widthOf)
          let rest = cw.reduce((a, b) => a + b, 0)
          while (rest > boxWidth + EPSILON) {
            let take = from
            let taken = 0
            while (
              take < cw.length &&
              (take === from || taken + cw[take]! <= boxWidth + EPSILON)
            )
              taken += cw[take++]!
            if (take >= cw.length) break
            line += unit.word.slice(from, take).join('')
            visible = taken
            x = taken
            wrap()
            from = take
            rest -= taken
          }
          wordWidth = rest
        }
        line += unit.word.slice(from).join('')
        visible = x + wordWidth
        x = visible
        started = true
      }
      if (unit.spaces) {
        // Spaces never wrap: they hang, and join the line if a word follows on it.
        hang += unit.spaces
        x = advance(x, unit.spaces)
        started = true
      }
    }
    rows.push({ text: line, width: visible, hang: x - visible, wrapped: false })
  }
  // A newline at the very end of the text ends its line; it does not start another.
  if (rows.length > 1 && text.endsWith('\n')) rows.pop()

  const lines: LaidLine[] = rows.map((row, i) => {
    // Spaces before a newline or the end of the text count when they fit; spaces at a wrap hang.
    const aligned = row.wrapped ? row.width : Math.min(row.width + row.hang, boxWidth)
    const free = Math.max(0, boxWidth - aligned)
    const laid: LaidLine = {
      text: row.text,
      x: 0,
      baseline: i * lineHeight + firstBaseline,
      width: row.width,
      outside: outsideTables(row.text),
    }
    if (align === 'center') laid.x = free / 2
    else if (align === 'right') laid.x = free
    else if (align === 'justify' && row.wrapped) {
      // A tab is an opportunity as a space is: Chrome widens both by the same amount.
      const gaps = [...row.text].filter((c) => c === ' ' || c === '\t').length
      if (gaps > 0 && free > 0) laid.wordSpacing = free / gaps
    }
    if (row.text.includes('\t'))
      laid.segments = segmentsOf(
        row.text,
        laid.x,
        laid.wordSpacing ?? 0,
        advance,
        widthOf
      )
    return laid
  })
  return { lines, height: rows.length * lineHeight, outside }
}

/**
 * The pieces of `text` between its tabs, each placed where the tab stops put it. A piece is
 * measured as the layout measures a line, with `widthOf` on the whole piece (so a run of a joined
 * script is one measure). Tab stops are found on the line as it is without justification, and
 * every space and tab before a piece then moves it right by `wordSpacing`, as Chrome does.
 */
function segmentsOf(
  text: string,
  origin: number,
  wordSpacing: number,
  advance: (x: number, spaces: string) => number,
  widthOf: (text: string) => number
): NonNullable<LaidLine['segments']> {
  const out: NonNullable<LaidLine['segments']> = []
  let x = 0
  let gaps = 0
  for (const [i, piece] of text.split('\t').entries()) {
    if (i > 0) {
      x = advance(x, '\t')
      gaps++
    }
    if (piece === '') continue
    const width = widthOf(piece)
    out.push({
      text: piece,
      x: origin + x + wordSpacing * gaps,
      width,
      outside: outsideTables(piece),
    })
    x += width
    gaps += [...piece].filter((c) => c === ' ').length
  }
  return out
}
