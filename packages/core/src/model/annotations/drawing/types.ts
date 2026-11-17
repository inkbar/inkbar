import type { Point, Rect } from '../../geometry'

/**
 * What one annotation looks like, in PDF user space: points, origin bottom-left, before
 * `/Rotate`. It does not depend on zoom, view rotation, device pixel ratio or theme.
 */
export interface Drawing {
  /** Where it is painted: with the annotation, or across the whole page beneath every annotation (a mask). */
  layer: 'annotation' | 'page'
  /**
   * The box that contains every point painted, in user space: each item's geometry widened by
   * half its stroke, which is all a stroke adds because a join that can be sharp is round and a
   * cap reaches half the width at most, and a curve or arc counted along its length. A shape whose
   * box is narrower than its stroke is centred in the box, so the bounds then exceed the
   * annotation's `rect`. Everything painted is inside; not all of it need be painted.
   */
  bounds: Rect
  items: readonly DrawItem[]
}

/**
 * One thing painted, in user space.
 *
 * An outline's dashes start where the item's outline does. A `polygon` and a `polyline` start at
 * their first point and a `path` at its first command, in order. A `rect` and an `ellipse` have
 * a start and a direction in user space (x right, y up), whatever the page's `/Rotate` and the
 * view's turn: a `rect` starts at its top-left corner, `(x, y + height)`, and runs along its top
 * edge towards +x, then down its right edge, so that it is clockwise as drawn with y up; with a
 * `radius` it starts at the end of that corner's arc, `(x + radius, y + height)`. An `ellipse`
 * starts at its rightmost point, `(x + width, y + height / 2)`, and runs towards -y, clockwise
 * the same way. A painter that shows the page turned keeps that corner and direction on the
 * item, so it draws the outline as a path when its own rect or ellipse would start elsewhere.
 * A `radius` is never more than half the shorter side.
 */
export type DrawItem = { role?: DrawRole } & (
  | { kind: 'polygon' | 'polyline'; points: readonly Point[]; paint: Paint }
  | { kind: 'rect'; rect: Rect; radius?: number; paint: Paint }
  | { kind: 'ellipse'; rect: Rect; paint: Paint }
  | {
      kind: 'path'
      commands: readonly PathCommand[]
      /** How an overlap fills: `nonzero` when absent. */
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
  /** `data` (a data URL) is stretched to fill `rect`, whatever its aspect, upright for `angle`. */
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

/**
 * How an item is painted. A stroke is centred on the outline and absent when it has no width.
 * Where a field is missing the PDF default applies: a fill of no `opacity` is opaque, a missing
 * `join` is `miter` (with the PDF's miter limit of 10 and SVG's of 4: a describer sets `round`
 * wherever a corner can be sharp, so neither limit is reached), a missing `cap` is `butt`,
 * and `dashes` start at phase 0 of the pattern, with no `dashes` a solid line.
 */
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
  /**
   * An axis-aligned elliptical arc to `to`. `sweep` is in user-space terms, y up: true runs
   * anticlockwise as the page is displayed unturned, false clockwise (SVG's `sweep-flag` is the
   * other way round because its y axis points down).
   */
  | { op: 'A'; rx: number; ry: number; largeArc: boolean; sweep: boolean; to: Point }
  | { op: 'Z' }

export interface TextLine {
  text: string
  /** The start of the line on its baseline, in user space: its left end for text that runs left to right as displayed. */
  origin: Point
  width: number
  /**
   * Whether the line has a character outside the standard fonts. Its `width` is then an estimate
   * of what the browser's font gives, so a painter must not force the line to it, and a file
   * writer needs a font for it.
   */
  outside: boolean
  /**
   * Extra space added to each U+0020 in `text`, in points. U+00A0 gets none. Each tab on the line
   * grows by the same amount; the segments' origins already include it.
   */
  wordSpacing?: number
  /**
   * Only on a line that holds a tab: the pieces between the tabs, each with the point it starts at,
   * its width in points (without word spacing) and whether it has a character outside the
   * standard fonts, so a painter need not reproduce tab stops. `text` is then the line as a whole.
   */
  segments?: readonly {
    text: string
    origin: Point
    width: number
    outside: boolean
  }[]
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
