import { clusters } from '../model/annotations/drawing/text/clusters'
import {
  measureWith,
  outsideTables,
  standardMeasure,
} from '../model/annotations/drawing/text/measure'

import { browserWidth, cssFont } from './text-fonts'

import type { TextFont } from '../model/annotations/drawing/types'

/**
 * What the browser tests that compare text layout with a real `div` may assume about the fonts
 * on the machine:
 * - `exact`: the Latin fonts are metric-compatible with the tables, and every class of character
 *   outside the tables that the texts use gives the widths the exact lists were recorded with.
 * - `by-cause`: the Latin fonts are compatible, some class of characters outside the tables is
 *   drawn in other widths (see `differing`).
 * - `foreign`: the Latin fonts do not follow the tables, so a table-measured line can break
 *   anywhere the fonts differ.
 */
export type TextFontMode = 'exact' | 'by-cause' | 'foreign'

/**
 * A kind of character outside the tables, told by Unicode properties. Fonts for each are found
 * independently on a machine (a machine may have a CJK font and no Arabic one), so each is probed
 * on its own.
 */
export type TextClass =
  | 'emoji'
  | 'emoji-modifier'
  | 'emoji-sequence'
  | 'flag'
  | 'keycap'
  | 'han'
  | 'cjk-punctuation'
  | 'hiragana'
  | 'katakana'
  | 'hangul'
  | 'arabic'
  | 'hebrew'
  | 'cyrillic'
  | 'greek'

/**
 * Per class: a probe string, and its width in the three font stacks (Helvetica, Times, Courier,
 * regular) at 10 px, as recorded on the machine the exact lists were recorded on.
 */
const PROBES: Record<TextClass, { text: string; recorded: [number, number, number] }> = {
  emoji: { text: '🙂🔥🎉', recorded: [36, 36, 36] },
  'emoji-modifier': { text: '\u{1f44b}\u{1f3fd}', recorded: [12, 12, 12] },
  'emoji-sequence': {
    text: '\u{1f468}\u200d\u{1f469}\u200d\u{1f467}\u200d\u{1f466}\u{1f3f3}\u200d\u{1f308}',
    recorded: [24, 24, 24],
  },
  flag: { text: '\u{1f1eb}\u{1f1f7}\u{1f1ef}\u{1f1f5}', recorded: [24, 24, 24] },
  keycap: { text: '1\ufe0f\u20e3#\ufe0f\u20e3', recorded: [24, 24, 24] },
  han: { text: '日本語漢字', recorded: [50, 50, 50] },
  'cjk-punctuation': { text: '。、「」（）〜', recorded: [62, 62, 62] },
  hiragana: { text: 'のちょっと', recorded: [50, 50, 50] },
  katakana: { text: 'コーヒーショップ', recorded: [80, 80, 80] },
  hangul: { text: '한국어', recorded: [27, 27, 27] },
  arabic: { text: 'مرحبا', recorded: [21, 21, 21] },
  hebrew: { text: 'שלום', recorded: [21.984375, 20.5625, 24.015625] },
  cyrillic: { text: 'Привет', recorded: [33.796875, 31.109375, 36.015625] },
  greek: { text: 'Καλημέρα', recorded: [44.703125, 42.34375, 48.015625] },
}

export const TEXT_CLASSES = Object.keys(PROBES) as TextClass[]

const FAMILIES = ['Helvetica', 'Times', 'Courier'] as const

/** In the order tested: the first that matches names the class. */
const CLASS_TESTS: [TextClass, RegExp][] = [
  ['keycap', /\u20e3/u],
  ['flag', /\p{Regional_Indicator}/u],
  ['emoji-modifier', /\p{Emoji_Modifier}/u],
  ['emoji-sequence', /\p{Extended_Pictographic}[^]*\u200d[^]*\p{Extended_Pictographic}/u],
  ['emoji', /[\p{Extended_Pictographic}\p{Emoji_Presentation}]|\p{Emoji}\ufe0f/u],
  ['cjk-punctuation', /^(?![\p{L}\p{N}])[\u3000-\u303f\uff00-\uffef]/u],
  ['han', /^\p{Script=Han}/u],
  ['hiragana', /^\p{Script=Hiragana}/u],
  ['katakana', /^\p{Script=Katakana}/u],
  ['hangul', /^\p{Script=Hangul}/u],
  ['arabic', /^\p{Script=Arabic}/u],
  ['hebrew', /^\p{Script=Hebrew}/u],
  ['cyrillic', /^\p{Script=Cyrillic}/u],
  ['greek', /^\p{Script=Greek}/u],
  // Characters shared by scripts (the prolonged sound mark of kana) belong to the script that uses them here.
  ['katakana', /^\p{Script_Extensions=Katakana}/u],
  ['hiragana', /^\p{Script_Extensions=Hiragana}/u],
]

/**
 * The class of a character (a cluster) outside the tables. A character of no known class throws
 * instead of being probed under a name of its own: the list above is what the tests vouch for, so
 * a sample with a new script has to add it, with a probe and its recorded widths.
 */
export function classOf(cluster: string): TextClass {
  for (const [name, test] of CLASS_TESTS) if (test.test(cluster)) return name
  throw new Error(
    `No text class for ${JSON.stringify(cluster)} (U+${cluster.codePointAt(0)!.toString(16)}): add it to the classes in text-font-check.ts`
  )
}

/** The characters of `text` that are outside the tables, by class (white space is the layout's own business). */
function outsideCharacters(text: string): Map<TextClass, string> {
  const found = new Map<TextClass, string>()
  for (const cluster of clusters(text.normalize('NFC')))
    if (!/^\s+$/u.test(cluster) && outsideTables(cluster)) {
      const name = classOf(cluster)
      found.set(name, (found.get(name) ?? '') + cluster)
    }
  return found
}

/** The classes of the characters of `text` that are outside the tables. */
export function classesIn(text: string): Set<TextClass> {
  return new Set(outsideCharacters(text).keys())
}

export interface ClassProbe {
  class: TextClass
  family: TextFont['family']
  /** The probe's width at 10 px as recorded, and as this machine draws it. */
  recorded: number
  actual: number
  /** The widest gap, in px, between a real line holding the class and the layout's measure of it, at the sizes the tests use. */
  contextGap: number
  differs: boolean
}

export interface TextFontCheck {
  mode: TextFontMode
  /** What decided it, for the test log. */
  why: string
  /**
   * The classes whose characters this machine draws in other widths than the lists were recorded
   * with, or than the layout measures them in. A forced mode cannot know: it says all of them.
   */
  differing: ReadonlySet<TextClass>
  /** Every probe made, per class and font stack. */
  probes: readonly ClassProbe[]
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

/** The faces the production measure is used for, probed in context. */
const FACES: TextFont[] = [
  { family: 'Courier', bold: false, italic: false },
  ...(['Helvetica', 'Times'] as const).flatMap((family) =>
    [false, true].flatMap((bold) =>
      [false, true].map((italic) => ({ family, bold, italic }))
    )
  ),
]
const CONTEXT_SIZES = [10, 12, 18]
/** How far the layout's width of a line with a run outside the tables may be from the browser's, in ems: the tables round the space to 1/1000 em. */
const CONTEXT_TOLERANCE_EM = 0.005
/** How far the browser's width of a run in a span may be from its width on the canvas, in px. */
const RUN_TOLERANCE = 0.01

const production = measureWith(browserWidth)

/**
 * How far a real line of `chars` between two Latin letters is from what the layout measures for
 * it, at the largest, over the faces and sizes the tests use. The layout asks the canvas for each
 * run outside the tables and the tables for the spaces; the browser shapes the line as a whole,
 * and a font that lacks the script draws it with a fallback whose spaces, glyphs or shaping
 * differ.
 */
function contextGap(chars: string): number {
  const line = `x ${chars} ${chars} x`
  let worst = 0
  for (const font of FACES)
    for (const size of CONTEXT_SIZES) {
      const gap = Math.abs(
        domWidth(line, size, font) - production.width(line, font, size).width
      )
      worst = Math.max(worst, gap - CONTEXT_TOLERANCE_EM * size)
    }
  return Math.max(worst, 0)
}

/** The classes forced to differ by `VITE_INKBAR_TEXT_CLASSES_DIFFER`, a comma-separated list or `all`. */
function forcedClasses(): TextClass[] {
  const raw = (import.meta.env as Record<string, string | undefined>)[
    'VITE_INKBAR_TEXT_CLASSES_DIFFER'
  ]
  if (!raw) return []
  if (raw === 'all') return [...TEXT_CLASSES]
  return raw.split(',').map((name) => {
    if (!TEXT_CLASSES.includes(name as TextClass))
      throw new Error(`VITE_INKBAR_TEXT_CLASSES_DIFFER: unknown class ${name}`)
    return name as TextClass
  })
}

/** What each differing class said, for the log: the class and the stacks that gave other widths. */
function describeDifferences(probes: readonly ClassProbe[]): string {
  const byClass = new Map<TextClass, string[]>()
  for (const p of probes) {
    if (!p.differs) continue
    const list = byClass.get(p.class) ?? []
    list.push(
      p.actual !== p.recorded
        ? `${p.family} ${p.actual} (recorded ${p.recorded})`
        : `${p.family} in a line ${p.contextGap.toFixed(3)} px off the layout`
    )
    byClass.set(p.class, list)
  }
  return [...byClass].map(([name, list]) => `${name}: ${list.join(', ')}`).join('; ')
}

/**
 * Decides the mode. Every class of character outside the tables is probed in each font stack, and,
 * in a line, against the layout's own measure of it. `texts` are the texts the caller compares: the
 * characters they use are added to the probe of their class, and a character of no class throws, so
 * a sample cannot go unprobed. `VITE_INKBAR_TEXT_FONTS=by-cause` or
 * `foreign` forces a mode, and `VITE_INKBAR_TEXT_CLASSES_DIFFER` (class names, or `all`), or `differ`, makes the
 * named classes differ, to check that the tests also hold on a machine whose fonts lack them.
 */
export function checkTextFonts(
  texts?: readonly string[],
  differ: readonly TextClass[] = []
): TextFontCheck {
  // A character of no class throws whatever the mode, so a sample cannot go unprobed anywhere.
  const own = new Map<TextClass, string>()
  for (const text of texts ?? [])
    for (const [name, chars] of outsideCharacters(text))
      own.set(name, (own.get(name) ?? '') + chars)

  const forced = (import.meta.env as Record<string, string | undefined>)[
    'VITE_INKBAR_TEXT_FONTS'
  ]
  if (forced === 'by-cause' || forced === 'foreign')
    return {
      mode: forced,
      why: `forced by VITE_INKBAR_TEXT_FONTS=${forced}`,
      differing: new Set(TEXT_CLASSES),
      probes: [],
    }

  const canvas = document.createElement('canvas').getContext('2d')!
  canvas.fontKerning = 'none'
  const worst: string[] = []
  let latinOk = true
  for (const family of FAMILIES)
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
      differing: new Set(TEXT_CLASSES),
      probes: [],
    }

  const wanted = new Set<TextClass>(TEXT_CLASSES)
  const probes: ClassProbe[] = []
  for (const name of wanted) {
    const { text, recorded } = PROBES[name]
    // The probe, and the characters of this class the texts use, so a sample is probed as it is.
    const chars = [
      ...new Set([...clusters(text), ...clusters(own.get(name) ?? '')]),
    ].join('')
    const gap = contextGap(chars)
    FAMILIES.forEach((family, i) => {
      const font: TextFont = { family, bold: false, italic: false }
      const actual = domWidth(text, 10, font)
      probes.push({
        class: name,
        family,
        recorded: recorded[i]!,
        actual,
        contextGap: gap,
        differs: Math.abs(actual - recorded[i]!) >= 0.01 || gap >= RUN_TOLERANCE,
      })
    })
  }
  const differing = new Set(probes.filter((p) => p.differs).map((p) => p.class))
  const forcedNow = [...differ, ...forcedClasses()]
  for (const name of forcedNow) differing.add(name)
  if (differing.size > 0)
    return {
      mode: 'by-cause',
      why: `${describeDifferences(probes)}${forcedNow.length > 0 ? ` (forced to differ: ${forcedNow.join(', ')})` : ''}`,
      differing,
      probes,
    }
  return {
    mode: 'exact',
    why: `Latin fonts within ${LATIN_TOLERANCE * 100}% of the tables at 100 px and ${SMALL_TOLERANCE * 100}% at 10, 12 and 18 px (${worst.join(', ')}); ${[...wanted].join(', ')} as recorded in all three stacks and in a line`,
    differing,
    probes,
  }
}

/**
 * Whether the browser draws a run outside the tables in `lines` (the lines a mismatch concerns,
 * with their spaces) in another width than the layout measured for it. Only these lines are
 * looked at, so an unrelated run elsewhere cannot explain a mismatch. This is the cause of a
 * different break by itself: whatever the font or the missing font, the layout's width of the run
 * is not the browser's.
 */
export function outsideRunsDiffer(
  lines: readonly string[],
  font: TextFont,
  size: number
): boolean {
  const runs: string[] = []
  const recording = measureWith((run, f, s) => {
    runs.push(run)
    return browserWidth(run, f, s)
  })
  for (const line of lines) recording.width(line, font, size)
  return runs.some(
    (run) =>
      Math.abs(domWidth(run, size, font) - browserWidth(run, font, size)) >= RUN_TOLERANCE
  )
}
