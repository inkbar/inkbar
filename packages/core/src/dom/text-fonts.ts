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

/** The CSS `font` shorthand for `font` at `size` points. */
export function cssFont(font: TextFont, size: number): string {
  return `${font.italic ? 'italic' : 'normal'} ${font.bold ? 'bold' : 'normal'} ${size}px ${FONT_STACKS[font.family]}`
}

/** Large enough that rounding in `measureText` does not show once the width is scaled down. */
const REFERENCE_SIZE = 100

let context:
  CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined
const widths = new Map<string, number>()

/** The width of one character in the browser's own font for `font`, at `size`. Cached per character and face. */
export function browserWidth(char: string, font: TextFont, size: number): number {
  const key = `${font.family}${font.bold ? 'b' : ''}${font.italic ? 'i' : ''}${char}`
  let unit = widths.get(key)
  if (unit === undefined) {
    if (context === undefined) {
      context =
        typeof document === 'undefined'
          ? null
          : (document.createElement('canvas').getContext('2d') ?? null)
    }
    if (!context) return size / 2
    context.font = cssFont(font, REFERENCE_SIZE)
    unit = context.measureText(char).width / REFERENCE_SIZE
    widths.set(key, unit)
  }
  return unit * size
}
