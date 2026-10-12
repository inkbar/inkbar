import { quadFromRect, type Quad, type Rect } from './geometry'

const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

const centreY = (r: Rect): number => r.y + r.height / 2

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Merges glyph boxes that share a line into one quad per run, ordered top to bottom (by
 * vertical centre) then left to right. Boxes whose vertical centres are within `tolerance`
 * points count as the same line; boxes with no area are dropped. Within a line, a horizontal
 * gap wider than `gap` points (default 1.5 × the line's median box height) starts a new run,
 * so text selected across a column gutter yields one quad per column. Pure user-space maths.
 */
export function mergeLineRects(
  rects: readonly Rect[],
  tolerance = 2,
  gap?: number
): Quad[] {
  const lines: { bounds: Rect; boxes: Rect[] }[] = []
  for (const r of rects) {
    if (!(r.width > 0 && r.height > 0)) continue
    const line = lines.find((l) => Math.abs(centreY(l.bounds) - centreY(r)) <= tolerance)
    if (!line) {
      lines.push({ bounds: { ...r }, boxes: [r] })
      continue
    }
    line.bounds = union(line.bounds, r)
    line.boxes.push(r)
  }
  const runs: Rect[] = []
  for (const line of lines) {
    const maxGap = gap ?? 1.5 * median(line.boxes.map((b) => b.height))
    const boxes = [...line.boxes].sort((a, b) => a.x - b.x)
    let run = { ...boxes[0]! }
    for (const b of boxes.slice(1)) {
      if (b.x - (run.x + run.width) > maxGap) {
        runs.push(run)
        run = { ...b }
      } else {
        run = union(run, b)
      }
    }
    runs.push(run)
  }
  runs.sort((a, b) => centreY(b) - centreY(a) || a.x - b.x)
  return runs.map(quadFromRect)
}
