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
  /**
   * Which of the fonts outside the tables give other widths than the lists were recorded with. A
   * forced mode cannot know, so it says both.
   */
  differs: { emoji: boolean; cjk: boolean }
}

const REFERENCE =
  'The quick brown fox jumps over the lazy dog 0123456789 ÀÉ€ — “quoted” (brackets)'
/** How far a font's width of the reference text may be from the table's, as a fraction, at 100 px. */
const LATIN_TOLERANCE = 0.001
/** The same at the sizes the tests use, measured in the DOM, where advances may be rounded. */
const SMALL_SIZES = [10, 12, 18]
const SMALL_TOLERANCE = 0.005

function domWidth(
  text: string,
  size: number,
  font: TextFont = { family: 'Helvetica', bold: false, italic: false }
): number {
  const span = document.createElement('span')
  span.style.cssText = `position:absolute;white-space:pre;font:${cssFont(font, size)};font-kerning:none`
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
    return {
      mode: forced,
      why: `forced by VITE_INKBAR_TEXT_FONTS=${forced}`,
      differs: { emoji: true, cjk: true },
    }

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
        for (const size of SMALL_SIZES) {
          const small =
            Math.abs(
              domWidth(REFERENCE, size, font) -
                standardMeasure.width(REFERENCE, font, size).width
            ) / standardMeasure.width(REFERENCE, font, size).width
          worst.push(
            `${family}${bold ? ' b' : ''}${italic ? ' i' : ''} @${size}px ${(small * 100).toFixed(3)}%`
          )
          if (small > SMALL_TOLERANCE) latinOk = false
        }
      }
  if (!latinOk)
    return {
      mode: 'foreign',
      why: `Latin fonts differ from the tables: ${worst.join(', ')}`,
      differs: { emoji: true, cjk: true },
    }

  // The tests render emoji and CJK through all three stacks, so each stack is probed.
  const probes: string[] = []
  const differs = { emoji: false, cjk: false }
  for (const family of ['Helvetica', 'Times', 'Courier'] as const) {
    const font: TextFont = { family, bold: false, italic: false }
    const emoji = domWidth('👋🏽', 10, font)
    const cjk = domWidth('の次の文。「引用」と（括弧）で', 10, font)
    if (Math.abs(emoji - 12) >= 0.01) {
      differs.emoji = true
      probes.push(`${family} emoji probe ${emoji} (expected 12)`)
    }
    if (Math.abs(cjk - 150) >= 0.01) {
      differs.cjk = true
      probes.push(`${family} CJK probe ${cjk} (expected 150)`)
    }
  }
  if (probes.length > 0) return { mode: 'by-cause', why: probes.join(', '), differs }
  return {
    mode: 'exact',
    why: `Latin fonts within ${LATIN_TOLERANCE * 100}% of the tables at 100 px and ${SMALL_TOLERANCE * 100}% at 10, 12 and 18 px (${worst.join(', ')}); emoji and CJK probes as recorded in all three stacks`,
    differs,
  }
}
