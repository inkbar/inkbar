import { standardMeasure } from '../model/annotations/drawing/text/measure'

import { cssFont } from './text-fonts'

import type { TextFont } from '../model/annotations/drawing/types'

/**
 * What the browser tests that compare text layout with a real `div` may assume about the fonts
 * on the machine:
 * - `exact`: the Latin fonts are metric-compatible with the tables and the colour emoji and CJK
 *   fonts give the widths the exact lists were recorded with.
 * - `by-cause`: the Latin fonts are compatible, the emoji or CJK fonts are not the same.
 * - `foreign`: the Latin fonts do not follow the tables, so a table-measured line can break
 *   anywhere the fonts differ.
 */
export type TextFontMode = 'exact' | 'by-cause' | 'foreign'

export interface TextFontCheck {
  mode: TextFontMode
  /** What decided it, for the test log. */
  why: string
}

const REFERENCE =
  'The quick brown fox jumps over the lazy dog 0123456789 ÀÉ€ — “quoted” (brackets)'
/** How far a font's width of the reference text may be from the table's, as a fraction. */
const LATIN_TOLERANCE = 0.001

function domWidth(text: string, size: number): number {
  const span = document.createElement('span')
  span.style.cssText = `position:absolute;white-space:pre;font:${cssFont({ family: 'Helvetica', bold: false, italic: false }, size)}`
  span.textContent = text
  document.body.append(span)
  const width = span.getBoundingClientRect().width
  span.remove()
  return width
}

/**
 * Decides the mode. `VITE_INKBAR_TEXT_FONTS=by-cause` or `foreign` forces a mode, to check that
 * the tests also hold on a machine with other fonts.
 */
export function checkTextFonts(): TextFontCheck {
  const forced = (import.meta.env as Record<string, string | undefined>)[
    'VITE_INKBAR_TEXT_FONTS'
  ]
  if (forced === 'by-cause' || forced === 'foreign')
    return { mode: forced, why: `forced by VITE_INKBAR_TEXT_FONTS=${forced}` }

  const canvas = document.createElement('canvas').getContext('2d')!
  canvas.fontKerning = 'none'
  const worst: string[] = []
  let latinOk = true
  for (const family of ['Helvetica', 'Times', 'Courier'] as const)
    for (const bold of [false, true])
      for (const italic of [false, true]) {
        const font: TextFont = { family, bold, italic }
        canvas.font = cssFont(font, 100)
        const real = canvas.measureText(REFERENCE).width
        const table = standardMeasure.width(REFERENCE, font, 100).width
        const diff = Math.abs(real - table) / table
        worst.push(
          `${family}${bold ? ' b' : ''}${italic ? ' i' : ''} ${(diff * 100).toFixed(3)}%`
        )
        if (diff > LATIN_TOLERANCE) latinOk = false
      }
  if (!latinOk)
    return {
      mode: 'foreign',
      why: `Latin fonts differ from the tables: ${worst.join(', ')}`,
    }

  const emoji = domWidth('👋🏽', 10)
  const cjk = domWidth('の次の文。「引用」と（括弧）で', 10)
  const sameEmoji = Math.abs(emoji - 12) < 0.01
  const sameCjk = Math.abs(cjk - 150) < 0.01
  if (!sameEmoji || !sameCjk)
    return {
      mode: 'by-cause',
      why: `emoji probe ${emoji} (expected 12), CJK probe ${cjk} (expected 150)`,
    }
  return {
    mode: 'exact',
    why: `Latin fonts within ${LATIN_TOLERANCE * 100}% of the tables (${worst.join(', ')}); emoji and CJK probes as recorded`,
  }
}
