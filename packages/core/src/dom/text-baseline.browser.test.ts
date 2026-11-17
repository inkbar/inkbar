import { describe, expect, it } from 'vitest'

import { layoutText } from '../model/annotations/drawing/text/layout'
import { standardMeasure } from '../model/annotations/drawing/text/measure'

import { checkTextFonts } from './text-font-check'
import { cssFont } from './text-fonts'

import type { TextFont } from '../model/annotations/drawing/types'

const FACES: TextFont[] = []
for (const family of ['Helvetica', 'Times', 'Courier'] as const)
  for (const bold of [false, true])
    for (const italic of [false, true]) FACES.push({ family, bold, italic })

/** Distance from the top of a text box's content to the baseline of its first line, in the browser. */
function browserBaseline(font: TextFont, size: number): number {
  const box = document.createElement('div')
  box.style.cssText = `position:absolute;left:0;top:0;width:5000px;font:${cssFont(font, size)};line-height:1.2;white-space:pre-wrap;overflow-wrap:break-word;margin:0`
  box.append('Hxg ')
  // A zero-size inline-block sits on the baseline, so its bottom edge is the baseline.
  const probe = document.createElement('span')
  probe.style.cssText = 'display:inline-block;width:0;height:0'
  box.append(probe)
  document.body.append(box)
  const baseline = probe.getBoundingClientRect().bottom - box.getBoundingClientRect().top
  box.remove()
  return baseline
}

const compute = (font: TextFont, size: number) =>
  layoutText({ text: 'Hxg', font, size, width: 1e6, align: 'left' }, standardMeasure)
    .lines[0]!.baseline

/** What Blink does with the constants: whole-pixel ascent and descent, and a floored half-leading. */
function blinkModel(font: TextFont, size: number): number {
  const { ascent, descent } = standardMeasure.vertical(font)
  const a = Math.round(ascent * size)
  const d = Math.round(descent * size)
  return a + Math.floor((1.2 * size - (a + d)) / 2)
}

const fonts = checkTextFonts()
console.log(`[text fonts] baseline test, mode ${fonts.mode}: ${fonts.why}`)

describe('the line metrics match the fonts the text stacks pick', () => {
  for (const font of FACES) {
    const name = `${font.family} bold=${font.bold} italic=${font.italic}`
    for (const size of [10, 12, 18])
      it(`${name} at ${size}: the browser's baseline follows the constants`, () => {
        const measured = browserBaseline(font, size)
        const computed = compute(font, size)
        console.log(
          `[baseline] ${name} ${size}: measured ${measured.toFixed(3)} computed ${computed.toFixed(3)} model ${blinkModel(font, size)}`
        )
        // Blink rounds ascent and descent to whole pixels at small sizes, so up to a pixel apart.
        // Exact equality with the model only where the fonts are the ones the constants were taken from.
        if (fonts.mode === 'exact') expect(measured).toBe(blinkModel(font, size))
        expect(Math.abs(measured - computed)).toBeLessThanOrEqual(1.05)
      })
    it(`${name} at 400: the baseline is within a pixel of the constants`, () => {
      const measured = browserBaseline(font, 400)
      const computed = compute(font, 400)
      console.log(
        `[baseline] ${name} 400: measured ${measured.toFixed(3)} computed ${computed.toFixed(3)}`
      )
      // Rounding stays whole-pixel at any size, so this does not shrink with the size.
      expect(Math.abs(measured - computed)).toBeLessThanOrEqual(1.05)
    })
  }
})
