import type { Point } from './geometry'
import type { TextItem } from './text'

/**
 * One glyph as the page draws it, in content order: its text, where the pen starts it and where
 * its own width ends, before any character or word spacing. Both points are in user space.
 */
export interface PageGlyph {
  text: string
  start: Point
  end: Point
}

/** A text item's baseline: where it starts, its unit direction and its width, in user space. */
export interface TextRun extends Pick<TextItem, 'str' | 'dir' | 'fontSize'> {
  origin: Point
  along: Point
  width: number
}

/** Where each character of a run starts and where its glyph ends, as fractions of the run's width. */
export interface GlyphBounds {
  /** `str.length + 1` boundaries: see `TextItem.advances`. */
  advances: number[]
  /** `str.length` glyph ends: see `TextItem.glyphEnds`. */
  ends: number[]
}

/** How many glyphs past the last match to look for the start of the next item first. */
const LOOKAHEAD = 256
/** How far, as a fraction of the font size, a glyph may start from the item origin and still match. */
const START_SLACK = 0.05
/** How far off the baseline, as a fraction of the font size, a glyph may sit (text rise). */
const RISE_SLACK = 1

/**
 * Each item's character boundaries as fractions of its width (see `TextItem.advances`), from the
 * glyphs that drew it. PDF.js builds text items from the same glyphs in the same order. An item
 * matches a glyph sequence that spells its text and whose first glyph starts at the item's origin.
 * Boundaries are where the pen put each glyph, projected onto the item's baseline, so they hold
 * through moves, scaling and spacing inside an item, and may run past 1 when PDF.js reports a
 * width shorter than the glyphs it drew. An item that cannot be matched, or that runs right to
 * left or top to bottom, gets undefined.
 */
export function glyphAdvances(
  runs: readonly TextRun[],
  glyphs: readonly PageGlyph[]
): (GlyphBounds | undefined)[] {
  let next = 0
  return runs.map((run) => {
    if (run.dir !== 'ltr' || run.str.trim() === '' || !(run.width > 0)) return undefined
    const tryFrom = (from: number, to: number) => {
      for (let start = from; start < to; start++) {
        const m = matchRun(run, glyphs, start)
        if (m) return m
      }
      return undefined
    }
    // Look just past the last match first; items PDF.js reorders or drops are found by a full pass.
    const m =
      tryFrom(next, Math.min(glyphs.length, next + LOOKAHEAD)) ??
      tryFrom(0, glyphs.length)
    if (!m) return undefined
    next = m.next
    return m.bounds
  })
}

/** The text a glyph's text stands for in PDF.js text content, which expands ligatures. */
function variants(text: string): string[] {
  const n = text.normalize('NFKC')
  return n === text ? [text] : [text, n]
}

/** A glyph the item may leave out: a space, or a character that draws nothing. */
const skippable = (text: string) => /^[\s\p{Cf}]*$/u.test(text)

function matchRun(
  run: TextRun,
  glyphs: readonly PageGlyph[],
  start: number
): { bounds: GlyphBounds; next: number } | undefined {
  const { str, origin, along, width, fontSize } = run
  const t = (p: Point) =>
    ((p.x - origin.x) * along.x + (p.y - origin.y) * along.y) / width
  const off = (p: Point) =>
    Math.abs((p.x - origin.x) * along.y - (p.y - origin.y) * along.x)
  const first = glyphs[start]
  if (
    !first ||
    Math.abs(t(first.start) * width) > START_SLACK * fontSize ||
    off(first.start) > RISE_SLACK * fontSize
  )
    return undefined
  const bounds: number[] = []
  const ends: number[] = []
  let end = 0
  let g = start
  while (bounds.length < str.length) {
    const glyph = glyphs[g]
    const at = bounds.length
    const text =
      glyph && variants(glyph.text).find((v) => v !== '' && str.startsWith(v, at))
    if (glyph && text) {
      const t0 = t(glyph.start)
      end = t(glyph.end)
      for (let k = 0; k < text.length; k++) {
        bounds.push(t0 + ((end - t0) * k) / text.length)
        ends.push(t0 + ((end - t0) * (k + 1)) / text.length)
      }
      g++
    } else if (at > 0 && /\s/u.test(str[at]!)) {
      // A space PDF.js inserted for a gap: it runs from the last glyph to the next one.
      bounds.push(end)
      ends.push(end)
    } else if (at > 0 && glyph && skippable(glyph.text)) g++
    else return undefined
  }
  return { bounds: { advances: [...bounds, end], ends }, next: g }
}
