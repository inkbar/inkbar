import { describe, expect, it } from 'vitest'

import { clusters } from '../model/annotations/drawing/text/clusters'
import { layoutText } from '../model/annotations/drawing/text/layout'
import { measureWith, standardMeasure } from '../model/annotations/drawing/text/measure'

import { browserLines } from './text-browser-layout'
import { checkTextFonts } from './text-font-check'
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

/** One cluster at a time through the production fallback, measured at the real size: no kerning. */
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
  ellipses: 'wait…what… no…really… and so on…it goes on…and on…and on',
  exclamations:
    'word!word!word!word!word!word!word!word!word!word!word!word!word!word!word!word!',
  'small kana and the long vowel mark':
    'ちょっとしたコーヒーショップでキャッチボールをしました。ッーぁぃぅ',
  'iteration mark and wave dash':
    '人々の暮らしと時々の出来事、様々な国々〜東京〜大阪〜京都〜名古屋〜札幌〜福岡',
  // Scripts that join their letters or run right to left: measured as runs, not as isolated forms.
  arabic:
    'مرحبا بالعالم هذا نص عربي طويل يحتاج إلى عدة أسطر لاختبار التفاف الكلمات داخل المربع النصي',
  hebrew: 'שלום עולם זהו טקסט עברי ארוך שצריך כמה שורות כדי לבדוק את גלישת המילים בתיבה',
  'arabic with latin':
    'Order 42 مرحبا بالعالم and some more latin text then العربية again',
  'one character': 'W',
  empty: '',
}

/** Samples in scripts that join their letters or run right to left. */
const SHAPED = /^(arabic|hebrew)/

const FAMILIES: TextFont['family'][] = ['Helvetica', 'Times', 'Courier']
const SIZES = [10, 12, 18]
const WIDTHS = [80, 144, 300]

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

/** The measure production uses: the tables, and the browser's own widths for the rest. */
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

/** Whether every character of a sample is in the tables, so only the Latin fonts decide its lines. */
const latinOnly = (text: string) => !standardMeasure.width(text, HELV, 12).outside
const HELV: TextFont = { family: 'Helvetica', bold: false, italic: false }

interface Mismatch {
  label: string
  /** The smallest box-edge move, in px, after which layout agrees with the browser. */
  near: number | undefined
  latin: boolean
}

/** Lays every sample out with `measure` and compares it with a real `div`. */
function compareWith(
  measure: TextMeasure,
  faces: TextFont[],
  kerning: boolean,
  samples: [string, string][] = Object.entries(SAMPLES)
): { total: number; mismatches: Mismatch[] } {
  let total = 0
  const mismatches: Mismatch[] = []
  for (const [name, text] of samples)
    for (const font of faces)
      for (const size of SIZES)
        for (const width of WIDTHS) {
          const block: TextBlock = { text, font, size, width, align: 'left' }
          const expected = browserLines(block, kerning).map(spaceless)
          const laid = layoutText(block, measure).lines.map((l) => spaceless(l.text))
          total++
          if (JSON.stringify(expected) !== JSON.stringify(laid)) {
            const label = `${name} | ${font.family}${font.bold ? ' bold' : ''}${font.italic ? ' italic' : ''} ${size} ${width}`
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
            mismatches.push({ label, near, latin: latinOnly(text) })
            console.log(
              `[detail] kerning=${kerning} ${label} edge<=${near ?? 'none'}\n  browser ${JSON.stringify(expected)}\n  layout  ${JSON.stringify(laid)}`
            )
          }
        }
  return { total, mismatches }
}

const fonts = checkTextFonts()
console.log(`[text fonts] mode ${fonts.mode}: ${fonts.why}`)

/**
 * Checks a run's mismatches. With the fonts the exact lists were recorded on (`exact`), the
 * sorted labels must equal `known`. On any machine, a mismatch in text that has only characters
 * from the tables must be a line ending within 0.03 px of the box edge (with the browser's default
 * kerning, kerning may also move a break, so only the number of those is capped), and the total
 * is capped.
 */
function checkRun(
  run: { total: number; mismatches: Mismatch[] },
  options: { kerning: boolean; known: string[]; total: number }
) {
  const { total, mismatches } = run
  expect(total).toBe(options.total)
  expect(mismatches.length).toBeLessThanOrEqual(Math.ceil(total * 0.04))
  const latin = mismatches.filter((m) => m.latin)
  if (options.kerning) expect(latin.length).toBeLessThanOrEqual(Math.ceil(total * 0.01))
  else
    for (const m of latin)
      expect({ label: m.label, near: m.near }).toEqual({ label: m.label, near: 0.03 })
  if (fonts.mode === 'exact')
    expect(mismatches.map((m) => m.label).sort()).toEqual(options.known)
}

/** A line ends within 0.03 px of the box edge, so a rounding difference decides the break. The tables are rounded to 1/1000 em (for example "five      six" at 18 px is 80.028 by the tables and 80.016 in the browser, in an 80 px box). */
const EDGE_CASES = [
  'a long url | Times italic 12 80',
  'a long word at the start | Helvetica 18 80',
  'a long word at the start | Helvetica italic 18 80',
  'a very long word | Times bold italic 10 80',
  'hyphens | Times bold italic 18 144',
  'latin then CJK | Helvetica 18 300',
  'latin then CJK | Helvetica italic 18 300',
  'multiple spaces | Helvetica 18 80',
  'multiple spaces | Helvetica italic 18 80',
]

/** Only with the browser's default kerning: an 'ff' pair in the tabs sample, italic pairs in the long word and the mark positioning of Arabic and Hebrew are narrower in the real text. */
const KERNING_ONLY_CASES = [
  'a very long word | Times italic 12 300',
  'exclamations | Times italic 10 300',
  'exclamations | Times italic 10 80',
  'exclamations | Times italic 12 300',
  'exclamations | Times italic 18 144',
  'exclamations | Times italic 18 300',
  'tabs | Helvetica 18 300',
  'arabic | Courier 18 144',
  'arabic | Times 18 300',
  'arabic | Times bold 18 300',
  'arabic | Times bold italic 18 300',
  'arabic | Times italic 18 300',
  'hebrew | Helvetica 10 300',
  'hebrew | Helvetica italic 10 300',
]

/** The two runs with the production measure, on a machine with the fonts the lists were recorded on. */
const KNOWN_KERNING_OFF = [...EDGE_CASES].sort()
const KNOWN_KERNING_DEFAULT = [...KNOWN_KERNING_OFF, ...KERNING_ONLY_CASES].sort()

/** With the font's own per-cluster widths and no tables: the CJK bracket cases (not the edge cases, as no table is involved) and the tabs kerning case. */
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
  'tabs | Helvetica 18 300',
]

/** In `foreign` mode there is no table to compare, so these show as skipped, not as passed. */
const unlessForeign = it.skipIf(fonts.mode === 'foreign')
if (fonts.mode === 'foreign')
  console.log(
    '[text fonts] mode foreign: the per-cluster and production comparisons are skipped'
  )

describe('layoutText with per-cluster browser widths and no tables', () => {
  unlessForeign(
    'breaks (skipped when the Latin fonts are foreign) lines as the browser does with its default kerning',
    () => {
      const faces = FAMILIES.map((family) => ({ family, bold: false, italic: false }))
      // A script that joins its letters has no per-cluster width: the production measure takes
      // it as runs, and its own tests above and below cover it.
      const samples = Object.entries(SAMPLES).filter(([name]) => !SHAPED.test(name))
      const run = compareWith(perCharMeasure, faces, true, samples)
      console.log(
        `[per-char] ${run.total - run.mismatches.length}/${run.total} (${fonts.mode})`
      )
      for (const m of run.mismatches) console.log(`[per-char mismatch] ${m.label}`)
      // Without tables there is no edge to blame: mismatches are Latin kerning (capped) or involve other characters.
      expect(run.total).toBe(
        samples.length * FAMILIES.length * SIZES.length * WIDTHS.length
      )
      expect(run.mismatches.length).toBeLessThanOrEqual(Math.ceil(run.total * 0.04))
      expect(run.mismatches.filter((m) => m.latin).length).toBeLessThanOrEqual(2)
      if (fonts.mode === 'exact')
        expect(run.mismatches.map((m) => m.label).sort()).toEqual(PER_CHAR_KNOWN)
    }
  )
})

/** An edge case that mismatches must be one the box edge explains: unresolved (no move fixes it) fails. */
function expectEdgeCasesNearTheEdge(mismatches: Mismatch[]) {
  for (const label of EDGE_CASES) {
    const m = mismatches.find((x) => x.label === label)
    expect(
      m === undefined || m.near === 0.03,
      `${label} is not explained by the box edge`
    ).toBe(true)
  }
}

describe('layoutText with the production measure (tables plus the browser fallback)', () => {
  unlessForeign(
    'breaks lines as the browser does with kerning off (skipped when the Latin fonts are foreign)',
    () => {
      const run = compareWith(productionMeasure, PRODUCTION_FACES, false)
      console.log(
        `[production kerning-off] ${run.total - run.mismatches.length}/${run.total} (${fonts.mode})`
      )
      for (const m of run.mismatches)
        console.log(
          `[production kerning-off mismatch] ${m.label} edge<=${m.near ?? 'none'}`
        )
      checkRun(run, {
        kerning: false,
        known: KNOWN_KERNING_OFF,
        total:
          Object.keys(SAMPLES).length *
          PRODUCTION_FACES.length *
          SIZES.length *
          WIDTHS.length,
      })
      expectEdgeCasesNearTheEdge(run.mismatches)
    }
  )

  unlessForeign(
    'breaks lines as the browser does with its default kerning (skipped when the Latin fonts are foreign)',
    () => {
      const run = compareWith(productionMeasure, PRODUCTION_FACES, true)
      console.log(
        `[production kerning-default] ${run.total - run.mismatches.length}/${run.total} (${fonts.mode})`
      )
      for (const m of run.mismatches)
        console.log(
          `[production kerning-default mismatch] ${m.label} edge<=${m.near ?? 'none'}`
        )
      checkRun(run, {
        kerning: true,
        known: KNOWN_KERNING_DEFAULT,
        total:
          Object.keys(SAMPLES).length *
          PRODUCTION_FACES.length *
          SIZES.length *
          WIDTHS.length,
      })
      expectEdgeCasesNearTheEdge(run.mismatches)
    }
  )
})
