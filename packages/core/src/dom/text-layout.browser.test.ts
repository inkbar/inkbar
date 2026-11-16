import { afterEach, describe, expect, it } from 'vitest'

import { layoutText } from '../model/annotations/drawing/text/layout'
import { standardMeasure } from '../model/annotations/drawing/text/measure'

import { browserWidth, cssFont } from './text-fonts'

import type { TextBlock } from '../model/annotations/drawing/text/layout'
import type { TextFont, TextMeasure } from '../model/annotations/drawing/types'

let canvas: CanvasRenderingContext2D | undefined
/**
 * Whole strings measured by the browser at the real size, kerning and ligatures included, so the
 * comparison tests the line-breaking and not the difference between measuring and shaping.
 */
const shapedMeasure: TextMeasure = {
  width: (text, font, size) => {
    canvas ??= document.createElement('canvas').getContext('2d')!
    canvas.font = cssFont(font, size)
    canvas.fontKerning = 'normal'
    return { width: text === '' ? 0 : canvas.measureText(text).width, outside: false }
  },
  vertical: (font) => standardMeasure.vertical(font),
}

/** One character at a time through the production fallback: no kerning, measured at a reference size. */
const perCharMeasure: TextMeasure = {
  width: (text, font, size) => {
    let width = 0
    for (const c of text) width += browserWidth(c, font, size)
    return { width, outside: false }
  },
  vertical: (font) => standardMeasure.vertical(font),
}

const long =
  'The quick brown fox jumps over the lazy dog, and then the lazy dog, who had only been resting his eyes, got up and chased the fox all the way home through the tall grass.'

const SAMPLES: Record<string, string> = {
  paragraph: long,
  'multiple spaces':
    'one  two   three    four     five      six       seven        eight',
  tabs: 'a\tb\tc\tdddd\teeee\tffff\tgggg hhhh\tiiii',
  'a very long word':
    'short ' + 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(3) + ' end',
  'a long word at the start': 'Supercalifragilisticexpialidocious and more',
  'trailing spaces': 'trailing spaces here      \nnext line   ',
  'empty lines': 'first\n\n\nsecond\n\nthird',
  'only newlines': '\n\n',
  'leading spaces': '    indented line that goes on for a while and wraps\n  again',
  'spaces then a long word': '   ' + 'x'.repeat(60),
  'mixed script': 'Total: 42 €, 日本語のテキストがここにあります ok 🙂 Привет мир',
  'number ranges': 'pages 3-4 and 10-20 and 1234-5678-9012-3456 and 2026-11-16 end',
  hyphens: 'a well-known state-of-the-art re-entry point - and 3-4 digits 10-20',
  'no-break space': 'keep these words together please and some more text',
  'zero-width space': 'alpha​beta​gamma​delta​epsilon​zeta​eta',
  'one character': 'W',
  empty: '',
}

const FAMILIES: TextFont['family'][] = ['Helvetica', 'Times', 'Courier']
const SIZES = [10, 12, 18]
const WIDTHS = [80, 144, 300]

let host: HTMLElement | undefined
afterEach(() => host?.remove())

/** The non-space characters on each line of `text` laid out by the browser in a text box's CSS. */
function browserLines(block: TextBlock): string[] {
  host?.remove()
  host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden'
  const box = document.createElement('div')
  box.style.cssText = [
    `width:${block.width}px`,
    'box-sizing:border-box',
    `font:${cssFont(block.font, block.size)}`,
    'line-height:1.2',
    'white-space:pre-wrap',
    'overflow-wrap:break-word',
    `text-align:${block.align}`,
    'margin:0',
  ].join(';')
  const node = document.createTextNode(block.text)
  box.append(node)
  host.append(box)
  document.body.append(host)
  const lineHeight = block.size * 1.2
  const count = Math.round(box.getBoundingClientRect().height / lineHeight)
  const lines = Array.from({ length: Math.max(count, 1) }, () => '')
  const top = box.getBoundingClientRect().top
  const range = document.createRange()
  let offset = 0
  for (const char of block.text) {
    if (!/\s/.test(char)) {
      range.setStart(node, offset)
      range.setEnd(node, offset + char.length)
      const rect = range.getBoundingClientRect()
      const i = Math.floor((rect.top + rect.height / 2 - top) / lineHeight)
      lines[Math.min(Math.max(i, 0), lines.length - 1)] += char
    }
    offset += char.length
  }
  return lines
}

const spaceless = (s: string) => s.replace(/\s/gu, '')

describe('layoutText breaks lines where the browser does', () => {
  for (const [name, text] of Object.entries(SAMPLES)) {
    it(`${name}`, () => {
      const mismatches: string[] = []
      let total = 0
      for (const family of FAMILIES)
        for (const size of SIZES)
          for (const width of WIDTHS) {
            const block: TextBlock = {
              text,
              font: { family, bold: false, italic: false },
              size,
              width,
              align: 'left',
            }
            const expected = browserLines(block)
            const laid = layoutText(block, shapedMeasure).lines.map((l) =>
              spaceless(l.text)
            )
            total++
            if (JSON.stringify(expected) !== JSON.stringify(laid))
              mismatches.push(
                `${family} ${size} ${width}\n  browser ${JSON.stringify(expected)}\n  layout  ${JSON.stringify(laid)}`
              )
          }
      console.log(`[comparison] ${name}: ${total - mismatches.length}/${total}`)
      for (const m of mismatches) console.log(`[mismatch] ${name} | ${m}`)
      expect(mismatches).toEqual([])
    })
  }

  it('reports how the production per-character measure compares', () => {
    let total = 0
    let matched = 0
    const mismatches: string[] = []
    for (const [name, text] of Object.entries(SAMPLES))
      for (const family of FAMILIES)
        for (const size of SIZES)
          for (const width of WIDTHS) {
            const block: TextBlock = {
              text,
              font: { family, bold: false, italic: false },
              size,
              width,
              align: 'left',
            }
            const laid = layoutText(block, perCharMeasure).lines.map((l) =>
              spaceless(l.text)
            )
            total++
            if (JSON.stringify(browserLines(block)) === JSON.stringify(laid)) matched++
            else mismatches.push(`${name} | ${family} ${size} ${width}`)
          }
    console.log(
      `[per-char] ${matched}/${total} match; differing: ${mismatches.join('; ')}`
    )
    // Kerning, ligatures and hinting move a few lines by a character; most must still agree.
    expect(matched / total).toBeGreaterThan(0.95)
  })
})
