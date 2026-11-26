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
  if (typeof text !== 'string') return pdfString(text.bytes, true)
  return text.includes(ESC) ? text.replace(ESCAPE, '') : text
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

/**
 * @internal The `/DA` PDF.js reads: the inherited one unless it is empty, else `/AcroForm /DA`,
 * else none. Its bytes as they are: `/DA` is not a text string.
 */
export function defaultAppearanceText(
  inherited: FileTextShape | undefined,
  acroForm: FileTextShape | undefined
): string {
  const raw = (t: FileTextShape | undefined): string =>
    t === undefined ? '' : typeof t === 'string' ? t : latin1(t.bytes)
  return raw(inherited) || raw(acroForm)
}

/** One character per byte. */
function latin1(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += String.fromCharCode(byte)
  return out
}

/** @internal What `/DA` sets, as PDF.js's `parseDefaultAppearance` reads it. */
export interface DefaultAppearance {
  fontSize: number
  fontName: string
  color: Rgb
}

type Token =
  { kind: 'cmd'; cmd: string } | { kind: 'value'; value: unknown } | { kind: 'end' }

/** The operators PDF.js's preprocessor knows (its `opMap`), with the arguments each takes. */
const OPERATORS: ReadonlyMap<string, number> = new Map([
  ['w', 1],
  ['J', 1],
  ['j', 1],
  ['M', 1],
  ['d', 2],
  ['ri', 1],
  ['i', 1],
  ['gs', 1],
  ['q', 0],
  ['Q', 0],
  ['cm', 6],
  ['m', 2],
  ['l', 2],
  ['c', 6],
  ['v', 4],
  ['y', 4],
  ['h', 0],
  ['re', 4],
  ['S', 0],
  ['s', 0],
  ['f', 0],
  ['F', 0],
  ['f*', 0],
  ['B', 0],
  ['B*', 0],
  ['b', 0],
  ['b*', 0],
  ['n', 0],
  ['W', 0],
  ['W*', 0],
  ['BT', 0],
  ['ET', 0],
  ['Tc', 1],
  ['Tw', 1],
  ['Tz', 1],
  ['TL', 1],
  ['Tf', 2],
  ['Tr', 1],
  ['Ts', 1],
  ['Td', 2],
  ['TD', 2],
  ['Tm', 6],
  ['T*', 0],
  ['Tj', 1],
  ['TJ', 1],
  ["'", 1],
  ['"', 3],
  ['d0', 2],
  ['d1', 6],
  ['CS', 1],
  ['cs', 1],
  ['G', 1],
  ['g', 1],
  ['RG', 3],
  ['rg', 3],
  ['K', 4],
  ['k', 4],
  ['sh', 1],
  ['BI', 0],
  ['ID', 0],
  ['EI', 1],
  ['Do', 1],
  ['MP', 1],
  ['DP', 2],
  ['BMC', 1],
  ['BDC', 2],
  ['EMC', 0],
  ['BX', 0],
  ['EX', 0],
])

/** The operators that take any number of arguments up to the count. */
const VARIABLE_OPERATORS: ReadonlyMap<string, number> = new Map([
  ['SC', 4],
  ['SCN', 33],
  ['sc', 4],
  ['scn', 33],
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
    if (VARIABLE_OPERATORS.has(token.cmd)) {
      args = []
      continue
    }
    const count = OPERATORS.get(token.cmd)
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
 * empty `/Border`, and a width over half the rect's width or height taken as 1. A dash
 * (`/BS /D`, or `/Border`'s fourth entry) that PDF.js refuses makes the width 0; one it takes from
 * `/Border` makes the style dashed.
 */
export function borderOf(
  facts: Pick<AppearanceFactsShape, 'borderStyle' | 'border' | 'borderDash'>,
  rect: readonly number[]
): { width: number; style: number } {
  let width = 1
  let style = 1
  const setWidth = (given: number | null | undefined) => {
    if (typeof given !== 'number') return
    let w = given
    if (w > 0) {
      const maxWidth = (rect[2]! - rect[0]!) / 2
      const maxHeight = (rect[3]! - rect[1]!) / 2
      if (maxWidth > 0 && maxHeight > 0 && (w > maxWidth || w > maxHeight)) w = 1
    }
    width = w
  }
  // PDF.js's `setDashArray`: a list is taken when it is empty, or when every entry is a number
  // from 0 and one is above 0; else, and for anything but a list, the width is 0.
  const setDash = (dash: readonly (number | null)[] | null, forceStyle: boolean) => {
    if (dash === null) {
      width = 0
      return
    }
    const valid = dash.every((n) => n !== null && n >= 0)
    const allZeros = dash.every((n) => n === null || n <= 0)
    if (dash.length === 0 || (valid && !allZeros)) {
      if (forceStyle) style = BORDER_STYLES.D!
    } else width = 0
  }
  if (facts.borderStyle) {
    setWidth(facts.borderStyle.width)
    const s = facts.borderStyle.style
    if (s !== null && Object.hasOwn(BORDER_STYLES, s)) style = BORDER_STYLES[s]!
    if (facts.borderStyle.dash !== undefined) setDash(facts.borderStyle.dash, false)
  } else if (facts.border) {
    if (facts.border.length >= 3) {
      setWidth(facts.border[2])
      if (facts.borderDash !== undefined) setDash(facts.borderDash, true)
    } else if (facts.border.length === 0) width = 0
  } else width = 0
  return { width, style }
}

/** @internal `/Rect` normalised, as PDF.js's `lookupNormalRect`; all 0 when not four numbers. */
export function rectOf(facts: Pick<AppearanceFactsShape, 'rect' | 'rectOk'>): RectArray {
  if (!facts.rectOk || !facts.rect) return [0, 0, 0, 0]
  const [x1, y1, x2, y2] = facts.rect as number[]
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
