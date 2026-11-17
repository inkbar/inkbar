import { fixedWidth } from '../model/annotations/drawing/text/measure'

import type { TextFont } from '../model/annotations/drawing/types'

/**
 * The CSS font stacks the text of a text box is drawn and measured in, per standard family. The
 * fonts built to the standard widths come first: macOS's own Helvetica, Times and Courier have
 * other line metrics, so they only serve where none of those exist.
 */
export const FONT_STACKS: Record<TextFont['family'], string> = {
  Helvetica: 'Arial, "Liberation Sans", Arimo, Helvetica, sans-serif',
  Times: '"Times New Roman", "Liberation Serif", Tinos, Times, serif',
  Courier: '"Courier New", "Liberation Mono", Cousine, Courier, monospace',
}

/**
 * The CSS `font` shorthand for `font` at `size` CSS px. The layout works in points and asks for
 * widths at a size in points, so it passes its point size here as a pixel size: one point is one
 * CSS px in the measuring, whatever scale the page is later shown at. A caller that measures what
 * is on screen passes the size at its own scale.
 */
export function cssFont(font: TextFont, size: number): string {
  return `${font.italic ? 'italic' : 'normal'} ${font.bold ? 'bold' : 'normal'} ${size}px ${FONT_STACKS[font.family]}`
}

/** How many measured runs are kept. A text box rarely uses more than a few hundred. */
const CACHE_SIZE = 4000
/** A run longer than this is measured but not kept, so no entry's key is large. */
const KEEP_RUN = 200

let context:
  CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined
const widths = new Map<string, number>()
let canvasCalls = 0

/** What the width cache holds and how often the canvas was asked, so a test can see the bound hold. */
export const widthCache = {
  limit: CACHE_SIZE,
  keepRun: KEEP_RUN,
  get size(): number {
    return widths.size
  },
  /** How many times a run has been measured on the canvas. */
  get measured(): number {
    return canvasCalls
  },
}

/**
 * The width of a run of characters outside the tables (a cluster, or consecutive clusters: see
 * `measureWith`) in the browser's own font for `font`, measured as one string at `size` CSS px,
 * the same number the layout calls its size in points (see `cssFont`),
 * since rounding in the font's advances differs from size to size and a script that joins its
 * letters is shaped as a whole. Kerning is off, as the drawn text has it. The results are kept per
 * font, size and run, oldest dropped first.
 */
export function browserWidth(run: string, font: TextFont, size: number): number {
  const css = cssFont(font, size)
  const key = `${css}|${run}`
  let width = widths.get(key)
  if (width === undefined) {
    if (context === undefined) {
      context =
        typeof document === 'undefined'
          ? null
          : (document.createElement('canvas').getContext('2d') ?? null)
    }
    if (!context) return fixedWidth(run, font, size)
    context.font = css
    context.fontKerning = 'none'
    width = context.measureText(run).width
    canvasCalls++
    if (run.length <= KEEP_RUN) {
      if (widths.size >= CACHE_SIZE) widths.delete(widths.keys().next().value!)
      widths.set(key, width)
    }
  }
  return width
}
