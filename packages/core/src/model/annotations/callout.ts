// Free-text callouts as PDF and XFDF store them: `rect` holds box and leader line together,
// `fringe` insets it to the text box, `callout` runs from the tip to the box and `head` is the
// ending at the tip.
import { z } from 'zod'

import { isKnown, LINE_ENDINGS } from './pdf-names'

import type { Annotation, FreeTextAnnotation, LineEnding } from './types'
import type { Point, Rect } from '../geometry'

/**
 * The insets from a free text's `rect` to its text box, in points (PDF `/RD`, XFDF `fringe`,
 * both in this order).
 */
export const FringeSchema = z.object({
  left: z.number().nonnegative(),
  top: z.number().nonnegative(),
  right: z.number().nonnegative(),
  bottom: z.number().nonnegative(),
})

export type Fringe = z.infer<typeof FringeSchema>

/** An ending's length, and its full width, as a multiple of the stroke width. */
const ENDING_SCALE = 3

/**
 * A free text's text box: `rect` inset by `fringe`, or `rect` itself without one. Insets wider
 * or taller than `rect` leave a box of width or height 0 at the inset origin.
 */
export function freeTextBox(a: Pick<FreeTextAnnotation, 'rect' | 'fringe'>): Rect {
  const { rect, fringe } = a
  if (!fringe) return rect
  return {
    x: rect.x + fringe.left,
    y: rect.y + fringe.bottom,
    width: Math.max(0, rect.width - fringe.left - fringe.right),
    height: Math.max(0, rect.height - fringe.top - fringe.bottom),
  }
}

/**
 * True for a free-text callout drawn the standard way: a box with a leader line through
 * `callout`. A callout with `cornerRadius` is Inkbar's speech bubble instead.
 */
export function isStandardCallout(
  a: Annotation
): a is FreeTextAnnotation & { callout: Point[] } {
  return (
    a.type === 'freetext' &&
    a.intent === 'FreeTextCallout' &&
    a.callout !== undefined &&
    a.callout.length >= 2 &&
    a.cornerRadius === undefined
  )
}

/**
 * The leader line's stroke: the border colour, else the text colour, and the border width, with
 * 1 pt when the box has no border.
 */
export function calloutStroke(a: FreeTextAnnotation): { color: string; width: number } {
  return {
    color: a.borderColor ?? a.defaultStyle.color,
    width: a.width > 0 ? a.width : 1,
  }
}

/**
 * The `rect` and `fringe` that hold the text box `box` and a leader line through `callout`
 * stroked `width` points wide: every point is padded by half the stroke, and by the ending's
 * size as well when `head` is one Inkbar draws.
 */
export function withCalloutBounds(
  box: Rect,
  callout: readonly Point[],
  width: number,
  head: LineEnding | undefined
): { rect: Rect; fringe: Fringe } {
  const drawn = head !== undefined && head !== 'None' && isKnown(LINE_ENDINGS, head)
  const pad = width / 2 + (drawn ? ENDING_SCALE * Math.max(width, 1) : 0)
  const xs = [box.x, box.x + box.width, ...callout.map((p) => p.x)]
  const ys = [box.y, box.y + box.height, ...callout.map((p) => p.y)]
  const left = Math.min(...xs) - pad
  const bottom = Math.min(...ys) - pad
  const right = Math.max(...xs) + pad
  const top = Math.max(...ys) + pad
  return {
    rect: { x: left, y: bottom, width: right - left, height: top - bottom },
    fringe: {
      left: box.x - left,
      top: top - (box.y + box.height),
      right: right - (box.x + box.width),
      bottom: box.y - bottom,
    },
  }
}
