// Turns the sampled points of an ink stroke into a smoothed, filled outline. Overlay rendering
// and the draw tool's live preview share it, so a stroke looks the same while drawn and after.
import { getStroke } from 'perfect-freehand'

import type { Point } from '../model/geometry'

/** Strokes started within this long of the last one join its annotation. */
export const JOIN_GAP_MS = 1000

/**
 * The polygon around a stroke. `width` is the stroke width in the points' own unit; without
 * `pressure` the line keeps an even width.
 */
export function strokeOutline(
  points: readonly Point[],
  pressure: readonly number[] | undefined,
  width: number
): Point[] {
  const withPressure = pressure !== undefined
  const input = points.map(
    (p, i) => [p.x, p.y, pressure?.[i] ?? 0.5] as [number, number, number]
  )
  return getStroke(input, {
    size: width * 2,
    thinning: withPressure ? 0.5 : 0,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: false,
  }).map(([x, y]) => ({ x, y }))
}

/** A closed SVG path `d` through `outline`; empty for an empty outline. */
export function outlinePath(outline: readonly Point[]): string {
  if (outline.length === 0) return ''
  const r = (n: number): string => String(Math.round(n * 100) / 100)
  return `M${outline.map((p) => `${r(p.x)},${r(p.y)}`).join('L')}Z`
}
