import { describe, expect, it } from 'vitest'

import { clusters } from '../model/annotations/drawing/text/clusters'
import { layoutText } from '../model/annotations/drawing/text/layout'
import { measureWith, standardMeasure } from '../model/annotations/drawing/text/measure'

import { browserChars, browserEdges } from './text-browser-layout'
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

const TAB_SAMPLES: Record<string, string> = {
  'a tab early':
    'aa bb\tcc dd ee ff gg hh ii jj kk ll mm nn oo pp qq rr ss tt uu vv ww xx',
  'a tab late':
    'aa bb cc dd ee ff\tgg hh ii jj kk ll mm nn oo pp qq rr ss tt uu vv ww xx',
  'two tabs': 'a\tb c\td e f g h i j k l m n o p q r s t u v w x y z a b c d e f g h',
  'a tab after spaces': 'ab  \tcd ef gh ij kl mn op qr st uv wx yz ab cd ef gh ij kl mn',
}

describe('layoutText places the pieces of a justified line with tabs where the browser does', () => {
  for (const [name, text] of Object.entries(TAB_SAMPLES))
    it(name, () => {
      const problems: string[] = []
      let compared = 0
      for (const font of FACES)
        for (const size of SIZES)
          for (const width of WIDTHS) {
            const block: TextBlock = { text, font, size, width, align: 'justify' }
            const { chars, lineCount } = browserChars(block, false)
            const { lines } = layoutText(block, production)
            const browser = Array.from({ length: lineCount }, (_, i) =>
              chars.filter((c) => c.line === i)
            )
            const label = `${font.family}${font.bold ? ' bold' : ''}${font.italic ? ' italic' : ''} ${size} ${width}`
            const same =
              browser.length === lines.length &&
              browser.every(
                (cs, i) =>
                  cs.map((c) => c.char).join('') ===
                  lines[i]!.text.normalize('NFC').replace(/\s/gu, '')
              )
            if (!same) continue
            const space = production.width(' ', font, size).width
            lines.forEach((line, i) => {
              if (!line.segments || line.wordSpacing === undefined) return
              compared++
              const cs = browser[i]!
              let seen = 0
              for (const seg of line.segments) {
                const visible = seg.text.replace(/\s/gu, '').length
                if (visible === 0) continue
                const first = cs[seen]!
                const leading =
                  /^ */.exec(seg.text)![0].length * (space + line.wordSpacing)
                if (Math.abs(seg.x + leading - first.left) > TOLERANCE)
                  problems.push(
                    `${label} line ${i} piece ${JSON.stringify(seg.text)}: starts at ${first.left.toFixed(2)} in the browser, ${(seg.x + leading).toFixed(2)} in layout`
                  )
                seen += visible
              }
              const last = line.segments[line.segments.length - 1]!
              const end =
                last.x +
                last.width +
                line.wordSpacing * [...last.text].filter((c) => c === ' ').length
              const right = cs[cs.length - 1]!.right
              if (Math.abs(end - right) > TOLERANCE)
                problems.push(
                  `${label} line ${i}: ends at ${right.toFixed(2)} in the browser, ${end.toFixed(2)} in layout`
                )
            })
          }
      console.log(
        `[align tabs] ${name}: ${problems.length} problems in ${compared} lines compared`
      )
      for (const p of problems) console.log(`[align tabs problem] ${name} | ${p}`)
      expect(compared).toBeGreaterThanOrEqual(10)
      expect(problems).toEqual([])
    })
})
