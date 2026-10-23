import type { MeasureChar } from './text'

/**
 * Measures characters on an offscreen canvas in the font family PDF.js reports for a run, the
 * same family its text layer measures with. Undefined where there is no canvas (Node), so text
 * items carry no advances there. Widths are cached per family and character.
 */
export function canvasMeasureChar(): MeasureChar | undefined {
  if (typeof OffscreenCanvas === 'undefined') return undefined
  const ctx = new OffscreenCanvas(1, 1).getContext('2d')
  if (!ctx) return undefined
  const cache = new Map<string, Map<string, number>>()
  return (char, family) => {
    let widths = cache.get(family)
    if (!widths) cache.set(family, (widths = new Map<string, number>()))
    let w = widths.get(char)
    if (w === undefined) {
      ctx.font = `100px ${family}`
      w = ctx.measureText(char).width
      widths.set(char, w)
    }
    return w
  }
}
