import { quadFromRect, type Quad, type Rect } from './geometry'

/**
 * Merges glyph boxes that share a line into one quad per line, ordered top to bottom then
 * left to right. Boxes whose vertical centres are within `tolerance` points count as the same
 * line; boxes with no area are dropped. Pure user-space maths: no DOM.
 */
export function mergeLineRects(rects: readonly Rect[], tolerance = 2): Quad[] {
  const lines: Rect[] = []
  for (const r of rects) {
    if (!(r.width > 0 && r.height > 0)) continue
    const cy = r.y + r.height / 2
    const line = lines.find((l) => Math.abs(l.y + l.height / 2 - cy) <= tolerance)
    if (!line) {
      lines.push({ ...r })
      continue
    }
    const x1 = Math.min(line.x, r.x)
    const y1 = Math.min(line.y, r.y)
    const x2 = Math.max(line.x + line.width, r.x + r.width)
    const y2 = Math.max(line.y + line.height, r.y + r.height)
    line.x = x1
    line.y = y1
    line.width = x2 - x1
    line.height = y2 - y1
  }
  lines.sort((a, b) => b.y - a.y || a.x - b.x)
  return lines.map(quadFromRect)
}
