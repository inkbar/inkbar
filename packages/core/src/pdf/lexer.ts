/** A PDF name object, with `#xx` escapes decoded. */
export interface PdfName {
  kind: 'name'
  name: string
}

/** An indirect reference such as `12 0 R`. */
export interface PdfRef {
  kind: 'ref'
  num: number
  gen: number
}

/** A string object: its bytes after escapes and hex are decoded. See `textString` for text. */
export interface PdfString {
  kind: 'string'
  bytes: Uint8Array
}

/** A dictionary object. */
export interface PdfDict {
  kind: 'dict'
  entries: Map<string, PdfValue>
}

/** Any PDF object this reader understands. */
export type PdfValue =
  number | boolean | null | PdfName | PdfRef | PdfString | PdfDict | PdfValue[]

/** Thrown when the bytes are not valid PDF object syntax. */
export class PdfSyntaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfSyntaxError'
  }
}

const isWhite = (c: number): boolean =>
  c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32

const isDelimiter = (c: number): boolean =>
  c === 0x28 || // (
  c === 0x29 || // )
  c === 0x3c || // <
  c === 0x3e || // >
  c === 0x5b || // [
  c === 0x5d || // ]
  c === 0x7b || // {
  c === 0x7d || // }
  c === 0x2f || // /
  c === 0x25 // %

const isRegular = (c: number): boolean => !isWhite(c) && !isDelimiter(c)
const isDigit = (c: number): boolean => c >= 0x30 && c <= 0x39

const latin1 = (bytes: Uint8Array, from: number, to: number): string => {
  let out = ''
  for (let i = from; i < to; i++) out += String.fromCharCode(bytes[i]!)
  return out
}

function skipSpace(bytes: Uint8Array, offset: number): number {
  let i = offset
  while (i < bytes.length) {
    const c = bytes[i]!
    if (isWhite(c)) {
      i++
    } else if (c === 0x25) {
      while (i < bytes.length && bytes[i] !== 10 && bytes[i] !== 13) i++
    } else {
      break
    }
  }
  return i
}

function tokenEnd(bytes: Uint8Array, offset: number): number {
  let i = offset
  while (i < bytes.length && isRegular(bytes[i]!)) i++
  return i
}

const hexValue = (c: number | undefined): number => {
  if (c === undefined) return -1
  if (c >= 0x30 && c <= 0x39) return c - 0x30
  if (c >= 0x41 && c <= 0x46) return c - 0x41 + 10
  if (c >= 0x61 && c <= 0x66) return c - 0x61 + 10
  return -1
}

function parseName(bytes: Uint8Array, offset: number): { value: PdfName; end: number } {
  const end = tokenEnd(bytes, offset + 1)
  let name = ''
  for (let i = offset + 1; i < end; i++) {
    const c = bytes[i]!
    const hi = c === 0x23 ? hexValue(bytes[i + 1]) : -1
    const lo = hi >= 0 ? hexValue(bytes[i + 2]) : -1
    if (hi >= 0 && lo >= 0 && i + 2 < end) {
      name += String.fromCharCode(hi * 16 + lo)
      i += 2
    } else {
      name += String.fromCharCode(c)
    }
  }
  return { value: { kind: 'name', name }, end }
}

const ESCAPES: Record<number, number> = {
  0x6e: 10, // n
  0x72: 13, // r
  0x74: 9, // t
  0x62: 8, // b
  0x66: 12, // f
}

const isOctal = (c: number | undefined): c is number =>
  c !== undefined && c >= 0x30 && c <= 0x37

function parseLiteralString(
  bytes: Uint8Array,
  offset: number
): { value: PdfString; end: number } {
  const out: number[] = []
  let depth = 0
  for (let i = offset; i < bytes.length; i++) {
    const c = bytes[i]!
    if (c === 0x5c) {
      const e = bytes[++i]
      if (e === undefined) break
      if (isOctal(e)) {
        let n = e - 0x30
        for (let k = 0; k < 2 && isOctal(bytes[i + 1]); k++)
          n = n * 8 + bytes[++i]! - 0x30
        out.push(n & 0xff)
      } else if (e === 13) {
        // A backslash before an end of line continues the string on the next line.
        if (bytes[i + 1] === 10) i++
      } else if (e !== 10) {
        out.push(ESCAPES[e] ?? e)
      }
      continue
    }
    if (c === 0x28 && depth++ === 0) continue
    if (c === 0x29 && --depth === 0) {
      return { value: { kind: 'string', bytes: Uint8Array.from(out) }, end: i + 1 }
    }
    if (c === 13) {
      // An unescaped CR or CRLF in a literal string reads as a single LF.
      if (bytes[i + 1] === 10) i++
      out.push(10)
      continue
    }
    out.push(c)
  }
  throw new PdfSyntaxError('Unterminated string')
}

function parseHexString(
  bytes: Uint8Array,
  offset: number
): { value: PdfString; end: number } {
  const out: number[] = []
  let hi = -1
  for (let i = offset + 1; i < bytes.length; i++) {
    const c = bytes[i]!
    if (c === 0x3e) {
      // An odd final digit is read as if followed by 0.
      if (hi >= 0) out.push(hi * 16)
      return { value: { kind: 'string', bytes: Uint8Array.from(out) }, end: i + 1 }
    }
    const v = hexValue(c)
    if (v < 0) continue
    if (hi < 0) {
      hi = v
    } else {
      out.push(hi * 16 + v)
      hi = -1
    }
  }
  throw new PdfSyntaxError('Unterminated hex string')
}

/** After a non-negative integer ending at `end`, looks for `gen R`. */
function tryReference(
  bytes: Uint8Array,
  num: number,
  end: number
): { value: PdfRef; end: number } | undefined {
  let i = end
  if (i >= bytes.length || !isWhite(bytes[i]!)) return undefined
  i = skipSpace(bytes, i)
  const genStart = i
  while (i < bytes.length && isDigit(bytes[i]!)) i++
  if (i === genStart || i >= bytes.length || !isWhite(bytes[i]!)) return undefined
  const gen = Number(latin1(bytes, genStart, i))
  i = skipSpace(bytes, i)
  if (bytes[i] !== 0x52 || (i + 1 < bytes.length && isRegular(bytes[i + 1]!))) {
    return undefined
  }
  return { value: { kind: 'ref', num, gen }, end: i + 1 }
}

function parseNumberOrKeyword(
  bytes: Uint8Array,
  offset: number
): { value: PdfValue; end: number } {
  const end = tokenEnd(bytes, offset)
  const token = latin1(bytes, offset, end)
  if (token === 'true') return { value: true, end }
  if (token === 'false') return { value: false, end }
  if (token === 'null') return { value: null, end }
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(token)) {
    const n = Number(token)
    if (/^\d+$/.test(token)) {
      const ref = tryReference(bytes, n, end)
      if (ref) return ref
    }
    return { value: n, end }
  }
  throw new PdfSyntaxError(`Unexpected token "${token}" at ${offset}`)
}

/** Parses one value at `offset`, skipping whitespace and comments first. */
export function parseValue(
  bytes: Uint8Array,
  offset: number
): { value: PdfValue; end: number } {
  const i = skipSpace(bytes, offset)
  if (i >= bytes.length) throw new PdfSyntaxError('Unexpected end of data')
  const c = bytes[i]!
  if (c === 0x2f) return parseName(bytes, i)
  if (c === 0x28) return parseLiteralString(bytes, i)
  if (c === 0x3c && bytes[i + 1] === 0x3c) return parseDict(bytes, i + 2)
  if (c === 0x3c) return parseHexString(bytes, i)
  if (c === 0x5b) return parseArray(bytes, i + 1)
  if (isRegular(c)) return parseNumberOrKeyword(bytes, i)
  throw new PdfSyntaxError(`Unexpected "${String.fromCharCode(c)}" at ${i}`)
}

function parseArray(
  bytes: Uint8Array,
  offset: number
): { value: PdfValue[]; end: number } {
  const items: PdfValue[] = []
  let i = offset
  for (;;) {
    i = skipSpace(bytes, i)
    if (i >= bytes.length) throw new PdfSyntaxError('Unterminated array')
    if (bytes[i] === 0x5d) return { value: items, end: i + 1 }
    const item = parseValue(bytes, i)
    items.push(item.value)
    i = item.end
  }
}

function parseDict(bytes: Uint8Array, offset: number): { value: PdfDict; end: number } {
  const entries = new Map<string, PdfValue>()
  let i = offset
  for (;;) {
    i = skipSpace(bytes, i)
    if (i >= bytes.length) throw new PdfSyntaxError('Unterminated dictionary')
    if (bytes[i] === 0x3e && bytes[i + 1] === 0x3e) {
      return { value: { kind: 'dict', entries }, end: i + 2 }
    }
    if (bytes[i] !== 0x2f) throw new PdfSyntaxError(`Expected a name key at ${i}`)
    const key = parseName(bytes, i)
    const val = parseValue(bytes, key.end)
    entries.set(key.value.name, val.value)
    i = val.end
  }
}

function readInteger(bytes: Uint8Array, offset: number): { n: number; end: number } {
  const i = skipSpace(bytes, offset)
  let end = i
  while (end < bytes.length && isDigit(bytes[end]!)) end++
  if (end === i) throw new PdfSyntaxError(`Expected an integer at ${i}`)
  return { n: Number(latin1(bytes, i, end)), end }
}

/** Parses `num gen obj <value> [stream]` at `offset`. `streamStart` is the first data byte after `stream` and its EOL. */
export function parseIndirect(
  bytes: Uint8Array,
  offset: number
): { num: number; gen: number; value: PdfValue; streamStart?: number } {
  const num = readInteger(bytes, offset)
  const gen = readInteger(bytes, num.end)
  const kw = skipSpace(bytes, gen.end)
  if (latin1(bytes, kw, tokenEnd(bytes, kw)) !== 'obj') {
    throw new PdfSyntaxError(`Expected "obj" at ${kw}`)
  }
  const { value, end } = parseValue(bytes, kw + 3)
  const result: { num: number; gen: number; value: PdfValue; streamStart?: number } = {
    num: num.n,
    gen: gen.n,
    value,
  }
  const next = skipSpace(bytes, end)
  if (latin1(bytes, next, next + 6) === 'stream' && !isRegular(bytes[next + 6] ?? 32)) {
    let start = next + 6
    if (bytes[start] === 13 && bytes[start + 1] === 10) start += 2
    else if (bytes[start] === 10 || bytes[start] === 13) start += 1
    result.streamStart = start
  }
  return result
}

/** Reads a dictionary entry. */
export const dictGet = (d: PdfDict, key: string): PdfValue | undefined =>
  d.entries.get(key)

/** True for a name object, optionally one with the given spelling. */
export const isName = (v: unknown, name?: string): v is PdfName =>
  typeof v === 'object' &&
  v !== null &&
  (v as PdfName).kind === 'name' &&
  (name === undefined || (v as PdfName).name === name)

/** True for a dictionary object. */
export const isDict = (v: PdfValue | undefined): v is PdfDict =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'dict'

/** True for an indirect reference. */
export const isRef = (v: PdfValue | undefined): v is PdfRef =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'ref'

/** PDFDocEncoding where it differs from Latin-1: 0x18–0x1f, 0x80–0x9e and 0xa0 (the euro sign). */
const PDF_DOC_18 = '\u02d8\u02c7\u02c6\u02d9\u02dd\u02db\u02da\u02dc'
const PDF_DOC_80 = '•†‡…—–ƒ⁄‹›−‰„“”‘’‚™ﬁﬂŁŒŠŸŽıłœšž'

/**
 * A string object read as a text string: UTF-16BE or UTF-8 after a byte-order mark, else
 * PDFDocEncoding. Undefined for anything that is not a string.
 */
export function textString(v: PdfValue | undefined): string | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v) || v.kind !== 'string')
    return undefined
  const b = v.bytes
  if (b[0] === 0xfe && b[1] === 0xff)
    return new TextDecoder('utf-16be').decode(b.subarray(2))
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf)
    return new TextDecoder().decode(b.subarray(3))
  let out = ''
  for (const c of b) {
    if (c >= 0x18 && c <= 0x1f) out += PDF_DOC_18[c - 0x18]
    else if (c >= 0x80 && c <= 0x9e) out += PDF_DOC_80[c - 0x80]
    else if (c === 0xa0) out += '€'
    else out += String.fromCharCode(c)
  }
  return out
}
