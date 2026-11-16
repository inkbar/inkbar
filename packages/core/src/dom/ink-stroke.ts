// Turns the sampled points of an ink stroke into a smoothed, filled outline. Overlay rendering
// and the draw tool's live preview share it, so a stroke looks the same while drawn and after.
import { strokeOutline } from '../model/annotations/drawing/ink'

import type { Point } from '../model/geometry'

export { strokeOutline }

/** Strokes started within this long of the last one join its annotation. */
export const JOIN_GAP_MS = 1000

/** A closed SVG path `d` through `outline`; empty for an empty outline. */
export function outlinePath(outline: readonly Point[]): string {
  if (outline.length === 0) return ''
  const r = (n: number): string => String(Math.round(n * 100) / 100)
  return `M${outline.map((p) => `${r(p.x)},${r(p.y)}`).join('L')}Z`
}
