import type { TextItem } from './text'

/**
 * One glyph as the page draws it, in content order: its text and how far it moves the pen, in
 * text space. `spacing` is the part of `advance` that character and word spacing add. A kerning
 * gap is a glyph with no text.
 */
export interface PageGlyph {
  text: string
  advance: number
  spacing?: number
}

/** How many glyphs past the last match to look for the start of the next item. */
const LOOKAHEAD = 256

/**
 * Each item's character boundaries as fractions of its width (see `TextItem.advances`), from the
 * glyphs that drew it. PDF.js builds text items from the same glyphs in the same order, so the
 * items are matched against the glyph stream in turn. An item that cannot be matched, or that
 * runs right to left or top to bottom, gets undefined.
 */
export function glyphAdvances(
  items: readonly Pick<TextItem, 'str' | 'dir'>[],
  glyphs: readonly PageGlyph[]
): (number[] | undefined)[] {
  let next = 0
  return items.map((item) => {
    if (item.dir !== 'ltr' || item.str === '') return undefined
    const end = Math.min(glyphs.length, next + LOOKAHEAD)
    for (let start = next; start < end; start++) {
      const m = matchItem(item.str, glyphs, start)
      if (m) {
        next = m.next
        return m.advances
      }
    }
    return undefined
  })
}

/** The text a glyph's text stands for in PDF.js text content, which expands ligatures. */
function variants(text: string): string[] {
  const n = text.normalize('NFKC')
  return n === text ? [text] : [text, n]
}

function matchItem(
  str: string,
  glyphs: readonly PageGlyph[],
  start: number
): { advances: number[] | undefined; next: number } | undefined {
  const widths: number[] = []
  // Gaps and spaces the item leaves out, waiting to widen the character before the next one.
  let pending = 0
  // PDF.js leaves the last glyph's spacing out of an item's width, so the run ends before it.
  let trailing = 0
  let g = start
  while (widths.length < str.length) {
    const glyph = glyphs[g]
    const at = widths.length
    const text =
      glyph && variants(glyph.text).find((t) => t !== '' && str.startsWith(t, at))
    if (glyph && text) {
      if (at > 0) widths[at - 1]! += pending
      pending = 0
      for (let k = 0; k < text.length; k++) widths.push(glyph.advance / text.length)
      trailing = glyph.spacing ?? 0
      g++
    } else if (at > 0 && /\s/u.test(str[at]!)) {
      // A space PDF.js inserted for a gap: it takes the gap's width.
      widths.push(pending)
      pending = 0
      trailing = 0
    } else if (at > 0 && glyph && glyph.text.trim() === '') {
      pending += glyph.advance
      g++
    } else return undefined
  }
  const total = widths.reduce((s, w) => s + w, 0) - trailing
  if (!(total > 0)) return { advances: undefined, next: g }
  let sum = 0
  const advances = [0, ...widths.map((w) => Math.min(1, (sum += w) / total))]
  advances[advances.length - 1] = 1
  return { advances, next: g }
}
