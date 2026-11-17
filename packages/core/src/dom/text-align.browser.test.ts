import { describe, expect, it } from 'vitest'

import { clusters } from '../model/annotations/drawing/text/clusters'
import { layoutText } from '../model/annotations/drawing/text/layout'
import { measureWith, standardMeasure } from '../model/annotations/drawing/text/measure'

import { browserEdges } from './text-browser-layout'
import { checkTextFonts } from './text-font-check'
import { browserWidth } from './text-fonts'

import type { TextBlock } from '../model/annotations/drawing/text/layout'
import type { TextFont, TextMeasure } from '../model/annotations/drawing/types'

const fonts = checkTextFonts()
console.log(`[text fonts] alignment test, mode ${fonts.mode}: ${fonts.why}`)

/**
 * The measure production uses, or, where the Latin fonts do not follow the tables, the browser's
 * own widths for everything, so the test still checks the placement rules and not the fonts.
 */
const production: TextMeasure =
  fonts.mode === 'foreign'
    ? {
        width: (text, font, size) => ({
          width: clusters(text.normalize('NFC')).reduce(
            (w, c) => w + browserWidth(c, font, size),
            0
          ),
          outside: false,
        }),
        vertical: (font) => standardMeasure.vertical(font),
      }
    : measureWith(browserWidth)

const SAMPLES: Record<string, string> = {
  paragraph:
    'The quick brown fox jumps over the lazy dog, and then the lazy dog, who had only been resting his eyes, got up and chased the fox all the way home.',
  'trailing spaces': 'ab   ',
  'trailing spaces before a newline': 'trailing spaces here      \nnext line   \nlast',
  'a wrapped line with trailing spaces': 'aaaa bbbb cccc dddd   \neeee',
  'leading spaces': '   indented once\n      indented twice and wrapped around the box',
  'empty lines': 'first\n\nsecond\n\n\nthird',
  'no-break spaces': 'keep these together and these too and some more words to wrap',
  'a long word': 'start Pneumonoultramicroscopicsilicovolcanoconiosis end',
}

const FACES: TextFont[] = [
  { family: 'Helvetica', bold: false, italic: false },
  { family: 'Helvetica', bold: true, italic: false },
  { family: 'Times', bold: false, italic: true },
  { family: 'Courier', bold: false, italic: false },
]
const SIZES = [10, 12, 18]
const WIDTHS = [80, 144, 300]
const ALIGNS = ['center', 'right', 'justify'] as const
/** How far a first or last character may sit from where layout puts it. */
const TOLERANCE = 0.5

describe('layoutText places lines horizontally where the browser does', () => {
  for (const align of ALIGNS)
    for (const [name, text] of Object.entries(SAMPLES))
      it(`${align}: ${name}`, () => {
        const problems: string[] = []
        let skipped = 0
        let compared = 0
        for (const font of FACES)
          for (const size of SIZES)
            for (const width of WIDTHS) {
              const block: TextBlock = { text, font, size, width, align }
              const edges = browserEdges(block)
              const { lines } = layoutText(block, production)
              const space = production.width(' ', font, size).width
              const label = `${font.family}${font.bold ? ' bold' : ''}${font.italic ? ' italic' : ''} ${size} ${width}`
              // Only lines the two break the same way can be compared by position.
              const same =
                edges.length === lines.length &&
                edges.every(
                  (e, i) =>
                    (e?.text ?? '') ===
                    lines[i]!.text.normalize('NFC').replace(/\s/gu, '')
                )
              if (!same) {
                skipped++
                continue
              }
              compared++
              lines.forEach((line, i) => {
                const edge = edges[i]
                if (!edge || line.text.trim() === '') return
                const leading = /^ */.exec(line.text)![0].length * space
                const left = line.x + leading * (1 + (line.wordSpacing ?? 0) / space)
                if (Math.abs(left - edge.left) > TOLERANCE)
                  problems.push(
                    `${label} line ${i} ${JSON.stringify(line.text)}: first character at ${edge.left.toFixed(2)} in the browser, ${left.toFixed(2)} in layout`
                  )
                if (align === 'justify' && line.wordSpacing !== undefined) {
                  const right =
                    line.x +
                    line.width +
                    line.wordSpacing * [...line.text].filter((c) => c === ' ').length
                  if (Math.abs(right - edge.right) > TOLERANCE)
                    problems.push(
                      `${label} line ${i} ${JSON.stringify(line.text)}: last character ends at ${edge.right.toFixed(2)} in the browser, ${right.toFixed(2)} in layout`
                    )
                }
              })
            }
        console.log(
          `[align] ${align}: ${name}: ${problems.length} problems in ${compared} cases compared, ${skipped} skipped (the browser breaks lines elsewhere)`
        )
        for (const p of problems) console.log(`[align problem] ${align}: ${name} | ${p}`)
        expect(compared).toBeGreaterThanOrEqual(30)
        expect(problems).toEqual([])
      })
})
