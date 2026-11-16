import { isWide } from './measure'

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
  wordSpacing?: number
}

/** The line height the text box has always had: `line-height: 1.2`. */
const LINE_HEIGHT = 1.2
/** CSS `tab-size` default, in space widths. */
const TAB_SIZE = 8
/**
 * A line may run this far past the box and still fit: Chrome lays out in 1/64 px units, so a line
 * that ends within one unit of the edge stays (measured: 80.015625 in an 80 px box).
 */
const EPSILON = 1 / 64 + 1e-6

const isSpace = (c: string) => c === ' ' || c === '\t'

/** A run of text up to a break opportunity, then the spaces after it, which hang at a wrap. */
interface Unit {
  word: string
  spaces: string
}

/**
 * Break opportunities of CSS `pre-wrap` with `overflow-wrap: break-word`, as Chrome applies them to
 * a text box: after a run of spaces or tabs, after a zero-width space, after a hyphen-minus that
 * is followed by a letter, and between two wide (CJK or emoji) characters. A no-break space is
 * not a space here. A soft hyphen is not an opportunity and has no width.
 */
function units(paragraph: string): Unit[] {
  const chars = [...paragraph]
  const out: Unit[] = []
  let word = ''
  let i = 0
  while (i < chars.length) {
    const c = chars[i]!
    if (isSpace(c)) {
      let spaces = ''
      while (i < chars.length && isSpace(chars[i]!)) spaces += chars[i++]
      out.push({ word, spaces })
      word = ''
      continue
    }
    word += c
    i++
    const next = chars[i]
    if (next === undefined || isSpace(next)) continue
    const wide = isWide(c) && isWide(next)
    const afterHyphen =
      c === '-' && /[\p{L}\p{N}]/u.test(next) && /[\p{L}\p{N}]/u.test(chars[i - 2] ?? '')
    if (c === '​' || afterHyphen || wide) {
      out.push({ word, spaces: '' })
      word = ''
    }
  }
  if (word) out.push({ word, spaces: '' })
  return out
}

/**
 * Lays `block.text` out the way a browser lays out a box with `white-space: pre-wrap`,
 * `overflow-wrap: break-word` and `line-height: 1.2`, using `measure` for widths.
 *
 * Lines are in box-local points: `x` from the left edge, `baseline` down from the top edge. A
 * line's `text` and `width` leave out the spaces that hang at its end. Spaces at the start of a
 * line are kept. A tab advances to the next multiple of eight space widths from the line's start
 * and stays a tab in `text`. A word wider than the box starts on its own line, then breaks
 * between characters.
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
  /** Width of `spaces` placed with the line already `x` wide. */
  const advance = (x: number, spaces: string): number => {
    for (const c of spaces) {
      if (c === '\t')
        x = tabWidth > 0 ? (Math.floor(x / tabWidth + 1e-9) + 1) * tabWidth : x
      else x += spaceWidth
    }
    return x
  }

  const rows: { text: string; width: number; wrapped: boolean }[] = []
  const text = block.text.replace(/\r\n?/g, '\n')

  for (const paragraph of text.split('\n')) {
    let line = ''
    let visible = 0 // width of `line`, which has no hanging spaces
    let x = 0 // where the next character goes, hanging spaces included
    let started = false // anything on this line, spaces too
    const wrap = () => {
      rows.push({ text: line.replace(/[ \t]+$/, ''), width: visible, wrapped: true })
      line = ''
      visible = 0
      x = 0
      started = false
    }

    for (const unit of units(paragraph)) {
      let word = unit.word
      if (word) {
        let wordWidth = widthOf(word)
        if (x + wordWidth > boxWidth + EPSILON && started) {
          wrap()
        }
        while (x + wordWidth > boxWidth + EPSILON) {
          // Too wide for an empty line: take as many characters as fit, at least one.
          const chars = [...word]
          let take = 0
          let takenWidth = 0
          while (take < chars.length) {
            const cw = widthOf(chars[take]!)
            if (take > 0 && takenWidth + cw > boxWidth + EPSILON) break
            takenWidth += cw
            take++
          }
          if (take >= chars.length) break
          line += chars.slice(0, take).join('')
          visible = takenWidth
          x = takenWidth
          wrap()
          word = chars.slice(take).join('')
          wordWidth = widthOf(word)
        }
        line += word
        visible = x + wordWidth
        x = visible
        started = true
      }
      if (unit.spaces) {
        // Spaces never wrap: they hang. Kept in `line` only while more text follows them.
        line += unit.spaces
        x = advance(x, unit.spaces)
        started = true
      }
    }
    // Hanging spaces leave the line's text and width.
    line = line.replace(/[ \t]+$/, '')
    if (line === '') visible = 0
    rows.push({ text: line, width: visible, wrapped: false })
  }
  // A newline at the very end of the text ends its line; it does not start another.
  if (rows.length > 1 && text.endsWith('\n')) rows.pop()

  const lines: LaidLine[] = rows.map((row, i) => {
    const free = Math.max(0, boxWidth - row.width)
    const baseline = i * lineHeight + firstBaseline
    const laid: LaidLine = { text: row.text, x: 0, baseline, width: row.width }
    if (align === 'center') laid.x = free / 2
    else if (align === 'right') laid.x = free
    else if (align === 'justify' && row.wrapped) {
      const gaps = [...row.text].filter((c) => c === ' ').length
      if (gaps > 0 && free > 0) laid.wordSpacing = free / gaps
    }
    return laid
  })
  return { lines, height: rows.length * lineHeight, outside }
}
