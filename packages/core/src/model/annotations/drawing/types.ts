import type { Point, Rect } from '../../geometry'

/**
 * What one annotation looks like, in PDF user space: points, origin bottom-left, before
 * `/Rotate`. It does not depend on zoom, view rotation, device pixel ratio or theme.
 */
export interface Drawing {
  /** Where it is painted: with the annotation, or across the whole page beneath every annotation (a mask). */
  layer: 'annotation' | 'page'
  /** The box that contains everything drawn, in user space. */
  bounds: Rect
  items: readonly DrawItem[]
}

export type DrawItem = { role?: DrawRole } & (
  | { kind: 'polygon' | 'polyline'; points: readonly Point[]; paint: Paint }
  | { kind: 'rect'; rect: Rect; radius?: number; paint: Paint }
  | { kind: 'ellipse'; rect: Rect; paint: Paint }
  | {
      kind: 'path'
      commands: readonly PathCommand[]
      fillRule?: 'nonzero' | 'evenodd'
      paint: Paint
    }
  | {
      kind: 'text'
      lines: readonly TextLine[]
      font: TextFont
      size: number
      color: string
      clip?: { rect: Rect; radius?: number }
      angle: 0 | 90 | 180 | 270
      outsideStandardFonts: boolean
    }
  | { kind: 'image'; data: string; rect: Rect; angle: 0 | 90 | 180 | 270 }
  | {
      kind: 'page'
      source: Rect
      target: Rect
      clip: { center: Point; radius: number }
    }
  | { kind: 'group'; opacity: number; items: readonly DrawItem[] }
)

/** What an item is, so a painter can label it: the overlay's class names and data attributes come from this. */
export type DrawRole =
  | 'stroke'
  | 'ending-head'
  | 'ending-tail'
  | 'callout-line'
  | 'bubble'
  | 'loupe-rim'
  | 'note'
  | 'note-glyph'
  | 'box'
  | 'border'
  | 'text'
  | 'stamp'
  | 'mask'

export interface Paint {
  fill?: { color: string; opacity?: number }
  stroke?: {
    color: string
    width: number
    dashes?: readonly number[]
    join?: 'miter' | 'round'
    cap?: 'butt' | 'round'
  }
}

export type PathCommand =
  | { op: 'M' | 'L'; to: Point }
  | { op: 'C'; c1: Point; c2: Point; to: Point }
  | { op: 'A'; rx: number; ry: number; largeArc: boolean; sweep: boolean; to: Point }
  | { op: 'Z' }

export interface TextLine {
  text: string
  origin: Point
  width: number
  /**
   * Whether the line has a character outside the standard fonts. Its `width` is then an estimate
   * of what the browser's font gives, so a painter must not force the line to it, and a file
   * writer needs a font for it.
   */
  outside: boolean
  /** Extra space added to each U+0020 in `text`, in points. U+00A0 gets none. */
  wordSpacing?: number
  /**
   * Only on a line that holds a tab: the pieces between the tabs, each with the point it starts at,
   * so a painter need not reproduce tab stops. `text` is then the line as a whole.
   */
  segments?: readonly { text: string; origin: Point }[]
  /**
   * The line's underline as a rule: its start and end (the line's origin and its advance, word
   * spacing included, 0.1 of the size below the baseline) and its thickness, in user space.
   */
  underline?: { from: Point; to: Point; thickness: number }
}

export interface TextFont {
  family: 'Helvetica' | 'Times' | 'Courier'
  bold: boolean
  italic: boolean
}

export interface DrawContext {
  /** The page's box in user space (its origin is not always 0,0), its rotation and its unit. */
  page: { box: Rect; rotate: 0 | 90 | 180 | 270; userUnit: number }
  measure: TextMeasure
}

export interface TextMeasure {
  /** Width of `text` in `font` at `size`, in points. `outside` is true when any character was not in the standard tables. */
  width(text: string, font: TextFont, size: number): { width: number; outside: boolean }
  /** Distance from the top of the line's content area to the baseline, and from the baseline to its bottom, as fractions of the size. */
  vertical(font: TextFont): { ascent: number; descent: number }
}
