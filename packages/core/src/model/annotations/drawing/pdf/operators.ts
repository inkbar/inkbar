/**
 * A number as a PDF operand: at most four decimals, never an exponent, no trailing zeros, and
 * `0` for `-0`, for anything that rounds to zero and for a value that is not finite.
 */
export function num(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const text = (Math.round(n * 10000) / 10000).toFixed(4)
  const trimmed = text.replace(/\.?0+$/, '')
  return trimmed === '' || trimmed === '-0' || trimmed === '-' ? '0' : trimmed
}

/** `#rrggbb` as red, green and blue from 0 to 1. */
export function rgbOf(color: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  if (!match) throw new Error(`Not a #rrggbb colour: ${color}`)
  return [
    parseInt(match[1]!, 16) / 255,
    parseInt(match[2]!, 16) / 255,
    parseInt(match[3]!, 16) / 255,
  ]
}
