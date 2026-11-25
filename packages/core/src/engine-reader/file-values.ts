// The values of an annotation or widget dictionary as PDF.js 6.4.299 reads them, from the facts
// the engine reports: text strings, colours, `/DA`, the border width and ids. The engine gives the
// file's values as written; each rule here is PDF.js's, so either reader gives core the same.
import { pdfString } from './targets'

import type { AppearanceFactsShape, FileTextShape, ObjectRefShape } from './types'

export type Rgb = [number, number, number]

/** An escape sequence: a language code PDF.js drops from a text string. */
const ESC = '\x1b'
const ESCAPE = new RegExp(`${ESC}[^${ESC}]*(?:${ESC}|$)`, 'g')

/**
 * @internal A text string as PDF.js's `stringToPDFString` gives it: the engine's text, or bytes
 * that are not text decoded as PDF.js decodes them (UTF-16 or UTF-8 after a byte-order mark when
 * they decode, else PDFDocEncoding byte by byte), escape sequences dropped either way.
 */
export function textOf(text: FileTextShape): string {
  const decoded = typeof text === 'string' ? text : pdfString(text.bytes)
  return decoded.includes(ESC) ? decoded.replace(ESCAPE, '') : decoded
}

/** One colour component as PDF.js stores it: times 255 in a `Uint8ClampedArray`. */
const clamped = new Uint8ClampedArray(3)

/**
 * @internal A colour as PDF.js's `getRgbColor` reads one: one component gray, three RGB, four
 * CMYK (by PDF.js's own polynomial), each 0–255; `null` for none; `fallback` for any other
 * count or for no colour at all. An entry that is not a number counts as 0.
 */
export function rgbOf(
  components: readonly (number | null)[] | undefined,
  fallback: Rgb | null
): Rgb | null {
  if (!components) return fallback
  const c = components.map((n) => n ?? 0)
  switch (c.length) {
    case 0:
      return null
    case 1:
      clamped[0] = clamped[1] = clamped[2] = c[0]! * 255
      break
    case 3:
      clamped[0] = c[0]! * 255
      clamped[1] = c[1]! * 255
      clamped[2] = c[2]! * 255
      break
    case 4:
      cmyk(c[0]!, c[1]!, c[2]!, c[3]!)
      break
    default:
      return fallback
  }
  return [clamped[0]!, clamped[1]!, clamped[2]!]
}

/** PDF.js's `DeviceCmykCS` conversion, into `clamped`. */
function cmyk(c: number, m: number, y: number, k: number): void {
  clamped[0] =
    255 +
    c *
      (-4.387332384609988 * c +
        54.48615194189176 * m +
        18.82290502165302 * y +
        212.25662451639585 * k +
        -285.2331026137004) +
    m *
      (1.7149763477362134 * m -
        5.6096736904047315 * y +
        -17.873870861415444 * k -
        5.497006427196366) +
    y * (-2.5217340131683033 * y - 21.248923337353073 * k + 17.5119270841813) +
    k * (-21.86122147463605 * k - 189.48180835922747)
  clamped[1] =
    255 +
    c *
      (8.841041422036149 * c +
        60.118027045597366 * m +
        6.871425592049007 * y +
        31.159100130055922 * k +
        -79.2970844816548) +
    m *
      (-15.310361306967817 * m +
        17.575251261109482 * y +
        131.35250912493976 * k -
        190.9453302588951) +
    y * (4.444339102852739 * y + 9.8632861493405 * k - 24.86741582555878) +
    k * (-20.737325471181034 * k - 187.80453709719578)
  clamped[2] =
    255 +
    c *
      (0.8842522430003296 * c +
        8.078677503112928 * m +
        30.89978309703729 * y -
        0.23883238689178934 * k +
        -14.183576799673286) +
    m *
      (10.49593273432072 * m +
        63.02378494754052 * y +
        50.606957656360734 * k -
        112.23884253719248) +
    y * (0.03296041114873217 * y + 115.60384449646641 * k + -193.58209356861505) +
    k * (-22.33816807309886 * k - 180.12613974708367)
}

/** @internal What `/DA` sets, as PDF.js's `parseDefaultAppearance` reads it. */
export interface DefaultAppearance {
  fontSize: number
  fontName: string
  color: Rgb
}

type Token =
  { kind: 'cmd'; cmd: string } | { kind: 'value'; value: unknown } | { kind: 'end' }

/** The operators PDF.js's preprocessor knows that `/DA` uses, with their argument counts. */
const DA_OPS: ReadonlyMap<string, number> = new Map([
  ['Tf', 2],
  ['rg', 3],
  ['g', 1],
  ['k', 4],
  ['q', 0],
  ['Q', 0],
  // Others a `/DA` may hold, read past as PDF.js does.
  ['BT', 0],
  ['ET', 0],
  ['Tc', 1],
  ['Tw', 1],
  ['Tz', 1],
  ['TL', 1],
  ['Ts', 1],
  ['Tr', 1],
  ['RG', 3],
  ['G', 1],
  ['K', 4],
  ['w', 1],
  ['cs', 1],
  ['CS', 1],
])

/** A PDF name's characters, `#xx` decoded: one character per byte. */
class Name {
  constructor(readonly name: string) {}
}

const WHITE = /[\0\t\n\f\r ]/
const DELIMITER = /[()<>[\]{}/%]/

/** The tokens of a content stream: enough of PDF.js's lexer for `/DA`. */
function* tokens(s: string): Generator<Token> {
  let i = 0
  const regular = (c: string | undefined) =>
    c !== undefined && !WHITE.test(c) && !DELIMITER.test(c)
  const value = (): unknown => {
    const c = s[i]!
    if (c === '/') {
      i++
      let name = ''
      while (regular(s[i])) {
        if (s[i] === '#' && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) {
          name += String.fromCharCode(parseInt(s.slice(i + 1, i + 3), 16))
          i += 3
        } else name += s[i++]
      }
      return new Name(name)
    }
    if (c === '(') {
      let depth = 1
      i++
      let out = ''
      while (i < s.length && depth > 0) {
        const ch = s[i++]!
        if (ch === '\\') out += s[i++] ?? ''
        else if (ch === '(') {
          depth++
          out += ch
        } else if (ch === ')') {
          if (--depth > 0) out += ch
        } else out += ch
      }
      return out
    }
    if (c === '<' && s[i + 1] === '<') {
      i += 2
      const dict: unknown[] = []
      for (;;) {
        skipWhite()
        if (i >= s.length) return dict
        if (s[i] === '>' && s[i + 1] === '>') {
          i += 2
          return dict
        }
        dict.push(value())
      }
    }
    if (c === '<') {
      const end = s.indexOf('>', i)
      i = end === -1 ? s.length : end + 1
      return ''
    }
    if (c === '[') {
      i++
      const list: unknown[] = []
      for (;;) {
        skipWhite()
        if (i >= s.length) return list
        if (s[i] === ']') {
          i++
          return list
        }
        list.push(value())
      }
    }
    if (DELIMITER.test(c)) {
      i++
      return null
    }
    let word = ''
    while (regular(s[i])) word += s[i++]
    const number = /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word) ? Number(word) : undefined
    if (number !== undefined) return number
    if (word === 'true') return true
    if (word === 'false') return false
    if (word === 'null') return null
    return { cmd: word }
  }
  const skipWhite = () => {
    for (;;) {
      while (i < s.length && WHITE.test(s[i]!)) i++
      if (s[i] !== '%') return
      while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++
    }
  }
  for (;;) {
    skipWhite()
    if (i >= s.length) {
      yield { kind: 'end' }
      return
    }
    const v = value()
    if (typeof v === 'object' && v !== null && 'cmd' in v)
      yield { kind: 'cmd', cmd: v.cmd as string }
    else yield { kind: 'value', value: v }
  }
}

/**
 * @internal `/DA` read as PDF.js's `parseDefaultAppearance` reads it: the last `Tf`, `rg`, `g` or
 * `k` outside any `q`, with arguments short of what an operator takes borrowed from the ones an
 * earlier operator left over, as PDF.js's preprocessor does. Font size 0, no font name and black
 * when it sets none.
 */
export function parseDefaultAppearance(da: string): DefaultAppearance {
  const result: DefaultAppearance = { fontSize: 0, fontName: '', color: [0, 0, 0] }
  let depth = 0
  let args: unknown[] = []
  const leftOver: unknown[] = []
  for (const token of tokens(da)) {
    if (token.kind === 'end') break
    if (token.kind === 'value') {
      if (token.value === null) continue
      args.push(token.value)
      // PDF.js gives up on the rest past 33 arguments.
      if (args.length > 33) break
      continue
    }
    const count = DA_OPS.get(token.cmd)
    // An operator PDF.js does not know is skipped, its arguments kept for the next.
    if (count === undefined) continue
    while (args.length > count) leftOver.push(args.shift())
    while (args.length < count && leftOver.length > 0) args.unshift(leftOver.pop())
    if (args.length < count) {
      args = []
      continue
    }
    const op = token.cmd
    if (op === 'q') depth++
    else if (op === 'Q') depth = Math.max(0, depth - 1)
    else if (depth === 0) {
      const n = (k: number): number => {
        const arg = args[k]
        return typeof arg === 'number' ? arg : NaN
      }
      if (op === 'Tf') {
        const [font, size] = args
        if (font instanceof Name) result.fontName = font.name
        if (typeof size === 'number' && size > 0) result.fontSize = size
      } else if (op === 'rg' || op === 'g' || op === 'k') {
        const color = rgbOf(
          args.map((_, k) => n(k)),
          null
        )
        if (color) result.color = color
      }
    }
    args = []
  }
  return result
}

/** The border style numbers PDF.js gives: solid, dashed, beveled, inset, underline. */
const BORDER_STYLES: Readonly<Record<string, number>> = {
  S: 1,
  D: 2,
  B: 3,
  I: 4,
  U: 5,
}

/**
 * @internal The border width and style PDF.js's `AnnotationBorderStyle` takes from `/BS`, else
 * `/Border`, over the normalised `rect`: width 1 and solid by default, 0 with neither entry or an
 * empty `/Border`, and a width over half the rect's width or height taken as 1.
 */
export function borderOf(
  facts: Pick<AppearanceFactsShape, 'borderStyle' | 'border'>,
  rect: readonly number[]
): { width: number; style: number } {
  let width = 1
  let style = 1
  const setWidth = (given: number | null | undefined) => {
    if (typeof given !== 'number') return
    let w = fileNumber(given)
    if (w > 0) {
      const maxWidth = (rect[2]! - rect[0]!) / 2
      const maxHeight = (rect[3]! - rect[1]!) / 2
      if (maxWidth > 0 && maxHeight > 0 && (w > maxWidth || w > maxHeight)) w = 1
    }
    width = w
  }
  if (facts.borderStyle) {
    setWidth(facts.borderStyle.width)
    const s = facts.borderStyle.style
    if (s !== null && Object.hasOwn(BORDER_STYLES, s)) style = BORDER_STYLES[s]!
  } else if (facts.border) {
    if (facts.border.length >= 3) setWidth(facts.border[2])
    else if (facts.border.length === 0) width = 0
  } else width = 0
  return { width, style }
}

/**
 * @internal A number the engine gives as a 32-bit float, exactly or written to 9 significant
 * digits, as the file most likely writes it: the shortest decimal that is the same float.
 * `0.400000006` is `0.4`. Any other number is given as it is.
 */
export function fileNumber(x: number): number {
  if (!Number.isFinite(x)) return x
  const float = Math.fround(x)
  if (float !== x && Number(float.toPrecision(9)) !== x) return x
  for (let digits = 1; digits < 10; digits++) {
    const decimal = Number(float.toPrecision(digits))
    if (Math.fround(decimal) === float) return decimal
  }
  return x
}

/** @internal `/Rect` normalised, as PDF.js's `lookupNormalRect`; all 0 when not four numbers. */
export function rectOf(facts: Pick<AppearanceFactsShape, 'rect' | 'rectOk'>): RectArray {
  if (!facts.rectOk || !facts.rect) return [0, 0, 0, 0]
  const [x1, y1, x2, y2] = (facts.rect as number[]).map(fileNumber)
  return [Math.min(x1!, x2!), Math.min(y1!, y2!), Math.max(x1!, x2!), Math.max(y1!, y2!)]
}

export type RectArray = [number, number, number, number]

/** @internal An object reference as core writes it: `12R`, or `12R3` for generation 3. */
export const refId = (ref: ObjectRefShape): string =>
  `${ref.objectNumber}R${ref.generation ? ref.generation : ''}`

/**
 * @internal The id of an annotation or widget: its object reference, or for one written as a
 * direct object `p<page>i<index>`, its page and place in `/Annots`.
 */
export const annotationId = (
  page: number,
  entry: { index: number; objectNumber?: number; generation?: number }
): string =>
  entry.objectNumber === undefined
    ? `p${page}i${entry.index}`
    : refId({ objectNumber: entry.objectNumber, generation: entry.generation ?? 0 })

/** Annotation flags. */
export const F_INVISIBLE = 1
export const F_HIDDEN = 2
export const F_NO_VIEW = 32

/**
 * @internal `/F` as PDF.js keeps it for an annotation of a kind it knows: a whole number above 0,
 * else 0, with Invisible cleared.
 */
export const knownFlags = (flags: number): number =>
  (Number.isInteger(flags) && flags > 0 ? flags : 0) & ~F_INVISIBLE
