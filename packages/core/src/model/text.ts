import type { Quad, Rect } from './geometry'

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
