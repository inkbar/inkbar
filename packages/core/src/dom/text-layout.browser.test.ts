import { afterEach, describe, expect, it } from 'vitest'

import { clusters } from '../model/annotations/drawing/text/clusters'
import { layoutText } from '../model/annotations/drawing/text/layout'
import { measureWith, standardMeasure } from '../model/annotations/drawing/text/measure'

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

/** One cluster at a time through the production fallback: no kerning, measured at a reference size. */
const perCharMeasure: TextMeasure = {
  width: (text, font, size) => {
    let width = 0
    for (const c of clusters(text.normalize('NFC'))) width += browserWidth(c, font, size)
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
  dashes: 'word—word—word and a long—dash and 1990–2000 and pages 3–4 end',
  slashes: 'and/or either/or yes/no/maybe and 1/2 or 3/4 end!and more?yes ok',
  'a long url':
    'see https://example.com/some/very/long/path/to/a/page?query=value&other=thing#fragment for more',
  'latin then CJK': 'Hello世界こんにちはworld漢字テスト42日本語text',
  'CJK punctuation': '日本語の文章です。次の文、その次の文。「引用」と（括弧）で終わる。',
  flags: 'flags 🇫🇷🇩🇪🇯🇵🇺🇸🇬🇧🇮🇹🇪🇸🇨🇦 end',
  'skin tones': 'wave 👋🏽👋🏿👍🏻👍🏼 hands 🙌🏾🙌🏽 end',
  'family emoji': 'family 👨‍👩‍👧‍👦 and 👩‍❤️‍👨 together 🧑‍🧑‍🧒‍🧒 ok',
  'decomposed accents':
    'Cafe\u0301 re\u0301sume\u0301 nai\u0308ve fiance\u0301e a\u0308o\u0308u\u0308 end',
  'one character': 'W',
  empty: '',
}

const FAMILIES: TextFont['family'][] = ['Helvetica', 'Times', 'Courier']
const SIZES = [10, 12, 18]
const WIDTHS = [80, 144, 300]

let host: HTMLElement | undefined
afterEach(() => host?.remove())

/** The non-space characters on each line of `text` laid out by the browser in a text box's CSS. */
function browserLines(block: TextBlock, kerning = true): string[] {
  host?.remove()
  host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden'
  const box = document.createElement('div')
  box.style.cssText = [
    `width:${block.width}px`,
    'box-sizing:border-box',
    `font:${cssFont(block.font, block.size)}`,
    kerning ? 'font-kerning:auto' : 'font-kerning:none',
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

const spaceless = (s: string) => s.normalize('NFC').replace(/\s/gu, '')

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
            const expected = browserLines(block).map(spaceless)
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
})

describe('known differences from the browser', () => {
  it('Chrome breaks at a soft hyphen and draws a hyphen there; layout does neither', () => {
    const block: TextBlock = {
      text: 'extra\u00adordinarily\u00adlong\u00adword',
      font: { family: 'Helvetica', bold: false, italic: false },
      size: 12,
      width: 60,
      align: 'left',
    }
    const browser = browserLines(block).map(spaceless)
    const laid = layoutText(block, shapedMeasure).lines.map((l) => spaceless(l.text))
    // The browser's lines end in a soft hyphen's break; layout fills each line to the box.
    expect(browser).not.toEqual(laid)
    expect(laid.join('')).toBe(block.text)
  })
})

/** The measure production uses: the tables, and the browser's per-character widths for the rest. */
const productionMeasure = measureWith(browserWidth)

const PRODUCTION_FACES: TextFont[] = [
  { family: 'Courier', bold: false, italic: false },
  ...(['Helvetica', 'Times'] as const).flatMap((family) =>
    [false, true].flatMap((bold) =>
      [false, true].map((italic) => ({ family, bold, italic }))
    )
  ),
]

/** Pixels a box edge is moved to see whether a mismatch is a line ending next to the edge. */
const EDGE_STEPS = [0.03, 0.1, 0.25, 0.5, 1, 2]

/** Lays every sample out with `measure` and compares it with a real `div`. */
function compareWith(
  measure: TextMeasure,
  faces: TextFont[],
  kerning: boolean
): { total: number; mismatches: string[] } {
  let total = 0
  const mismatches: string[] = []
  for (const [name, text] of Object.entries(SAMPLES))
    for (const font of faces)
      for (const size of SIZES)
        for (const width of WIDTHS) {
          const block: TextBlock = { text, font, size, width, align: 'left' }
          const expected = browserLines(block, kerning).map(spaceless)
          const laid = layoutText(block, measure).lines.map((l) => spaceless(l.text))
          total++
          if (JSON.stringify(expected) !== JSON.stringify(laid)) {
            const label = `${name} | ${font.family}${font.bold ? ' bold' : ''}${font.italic ? ' italic' : ''} ${size} ${width}`
            // How far the box would have to move for layout to agree: a small number means a line
            // ended within that many pixels of the box edge.
            const near = EDGE_STEPS.find((delta) =>
              [-delta, delta].some(
                (d) =>
                  JSON.stringify(
                    layoutText({ ...block, width: width + d }, measure).lines.map((l) =>
                      spaceless(l.text)
                    )
                  ) === JSON.stringify(expected)
              )
            )
            mismatches.push(label)
            console.log(
              `[detail] kerning=${kerning} ${label} edge<=${near ?? 'none'}\n  browser ${JSON.stringify(expected)}\n  layout  ${JSON.stringify(laid)}`
            )
          }
        }
  return { total, mismatches }
}

const PER_CHAR_TOTAL = 702
/**
 * With the font's own per-cluster widths and no tables: twelve CJK bracket cases (a lone 「 or 」 is
 * measured narrow, in text it is a full em), two emoji cases (whole-pixel advances in the
 * DOM), and one kerning case (the 'ff' of the tabs sample is narrower in the real text).
 */
const PER_CHAR_KNOWN = [
  'CJK punctuation | Courier 10 144',
  'CJK punctuation | Courier 12 80',
  'CJK punctuation | Courier 18 300',
  'CJK punctuation | Courier 18 80',
  'CJK punctuation | Helvetica 10 144',
  'CJK punctuation | Helvetica 12 80',
  'CJK punctuation | Helvetica 18 300',
  'CJK punctuation | Helvetica 18 80',
  'CJK punctuation | Times 10 144',
  'CJK punctuation | Times 12 80',
  'CJK punctuation | Times 18 300',
  'CJK punctuation | Times 18 80',
  'family emoji | Helvetica 10 144',
  'skin tones | Courier 10 144',
  'tabs | Helvetica 18 300',
]

/** A line ends within 0.03 px of the box edge, so a rounding difference decides the break: the tables are rounded to 1/1000 em, and Liberation Mono's advance is 1229/2048 em, not 0.6, so a Courier line of exactly 24 or 20 characters fits in the tables and not in the browser. */
const EDGE_CASES = [
  'a long url | Courier 10 144',
  'a long url | Courier 10 300',
  'a long url | Courier 12 144',
  'a long url | Times italic 12 80',
  'a long word at the start | Courier 10 144',
  'a long word at the start | Courier 12 144',
  'a long word at the start | Helvetica 18 80',
  'a long word at the start | Helvetica italic 18 80',
  'a very long word | Courier 10 144',
  'a very long word | Courier 10 300',
  'a very long word | Courier 12 144',
  'a very long word | Times bold italic 10 80',
  'dashes | Courier 12 144',
  'family emoji | Helvetica bold 10 80',
  'family emoji | Helvetica bold 18 144',
  'family emoji | Helvetica bold italic 10 80',
  'family emoji | Helvetica bold italic 18 144',
  'hyphens | Courier 10 144',
  'hyphens | Courier 10 300',
  'hyphens | Times bold italic 18 144',
  'latin then CJK | Helvetica 18 300',
  'latin then CJK | Helvetica italic 18 300',
  'multiple spaces | Courier 10 144',
  'multiple spaces | Helvetica 18 80',
  'multiple spaces | Helvetica italic 18 80',
  'no-break space | Courier 10 144',
  'no-break space | Courier 12 144',
  'paragraph | Courier 10 144',
  'paragraph | Courier 12 144',
  'slashes | Courier 12 144',
  'spaces then a long word | Courier 10 144',
  'spaces then a long word | Courier 10 300',
  'spaces then a long word | Courier 12 144',
  'tabs | Courier 12 144',
  'trailing spaces | Courier 12 144',
]
/** The fallback measures 「 and 」 alone (0.59 em, as Chrome's text-spacing-trim narrows a lone bracket) but Chrome keeps them a full em between other full-width characters, so layout's lines are a character longer. */
const CJK_BRACKET_CASES = [
  'CJK punctuation | Courier 10 144',
  'CJK punctuation | Courier 12 80',
  'CJK punctuation | Courier 18 300',
  'CJK punctuation | Courier 18 80',
  'CJK punctuation | Helvetica 10 144',
  'CJK punctuation | Helvetica 12 80',
  'CJK punctuation | Helvetica 18 300',
  'CJK punctuation | Helvetica 18 80',
  'CJK punctuation | Helvetica bold 10 144',
  'CJK punctuation | Helvetica bold 12 80',
  'CJK punctuation | Helvetica bold 18 300',
  'CJK punctuation | Helvetica bold 18 80',
  'CJK punctuation | Helvetica bold italic 10 144',
  'CJK punctuation | Helvetica bold italic 12 80',
  'CJK punctuation | Helvetica bold italic 18 300',
  'CJK punctuation | Helvetica bold italic 18 80',
  'CJK punctuation | Helvetica italic 10 144',
  'CJK punctuation | Helvetica italic 12 80',
  'CJK punctuation | Helvetica italic 18 300',
  'CJK punctuation | Helvetica italic 18 80',
  'CJK punctuation | Times 10 144',
  'CJK punctuation | Times 12 80',
  'CJK punctuation | Times 18 300',
  'CJK punctuation | Times 18 80',
  'CJK punctuation | Times bold 10 144',
  'CJK punctuation | Times bold 12 80',
  'CJK punctuation | Times bold 18 300',
  'CJK punctuation | Times bold 18 80',
  'CJK punctuation | Times bold italic 10 144',
  'CJK punctuation | Times bold italic 12 80',
  'CJK punctuation | Times bold italic 18 300',
  'CJK punctuation | Times bold italic 18 80',
  'CJK punctuation | Times italic 10 144',
  'CJK punctuation | Times italic 12 80',
  'CJK punctuation | Times italic 18 300',
  'CJK punctuation | Times italic 18 80',
]
/** Colour emoji advances are whole pixels in the DOM (12 px at 10 px, 22 px at 18 px) but 1.25 em (12.5, 22.5) when measured at the reference size and scaled. */
const EMOJI_CASES = [
  'family emoji | Helvetica 10 144',
  'family emoji | Helvetica italic 10 144',
  'flags | Helvetica bold 10 144',
  'flags | Helvetica bold italic 10 144',
  'skin tones | Courier 10 144',
  'skin tones | Helvetica bold 18 80',
  'skin tones | Helvetica bold italic 18 80',
  'skin tones | Times bold italic 10 144',
]
/** Only with the browser's default kerning: kerning and ligatures in the real text shift a break by one character (an 'ff' pair in the tabs sample, italic pairs in the long word) that kerning-free widths do not. */
const KERNING_ONLY_CASES = [
  'a very long word | Times italic 12 300',
  'tabs | Helvetica 18 300',
]

/** Every case the production measure is known to break differently with kerning off. */
const KNOWN_KERNING_OFF = [...EDGE_CASES, ...CJK_BRACKET_CASES, ...EMOJI_CASES].sort()
/** And with the browser's default kerning. */
const KNOWN_KERNING_DEFAULT = [...KNOWN_KERNING_OFF, ...KERNING_ONLY_CASES].sort()

describe('layoutText with per-character browser widths and no tables', () => {
  it('breaks lines as the browser does with its default kerning, but for the known cases', () => {
    const faces = FAMILIES.map((family) => ({ family, bold: false, italic: false }))
    const { total, mismatches } = compareWith(perCharMeasure, faces, true)
    console.log(`[per-char] ${total - mismatches.length}/${total}`)
    for (const m of mismatches) console.log(`[per-char mismatch] ${m}`)
    expect(total).toBe(PER_CHAR_TOTAL)
    expect([...mismatches].sort()).toEqual(PER_CHAR_KNOWN)
  })
})

describe('layoutText with the production measure (tables plus the browser fallback)', () => {
  it('breaks lines as the browser does with kerning off', () => {
    const { total, mismatches } = compareWith(productionMeasure, PRODUCTION_FACES, false)
    console.log(`[production kerning-off] ${total - mismatches.length}/${total}`)
    for (const m of mismatches) console.log(`[production kerning-off mismatch] ${m}`)
    expect(total).toBe(2106)
    expect([...mismatches].sort()).toEqual(KNOWN_KERNING_OFF)
  })

  it('breaks lines as the browser does with its default kerning', () => {
    const { total, mismatches } = compareWith(productionMeasure, PRODUCTION_FACES, true)
    console.log(`[production kerning-default] ${total - mismatches.length}/${total}`)
    for (const m of mismatches) console.log(`[production kerning-default mismatch] ${m}`)
    expect(total).toBe(2106)
    expect([...mismatches].sort()).toEqual(KNOWN_KERNING_DEFAULT)
  })
})
