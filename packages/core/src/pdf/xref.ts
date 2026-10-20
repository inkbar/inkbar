import { isDict, parseIndirect, parseValue, type PdfDict, type PdfValue } from './lexer'
import { decodeStream } from './stream'

export type XrefEntry =
  | { type: 'offset'; offset: number; gen: number }
  | { type: 'compressed'; stream: number; index: number }
  | { type: 'free' }

export interface Xref {
  entries: Map<number, XrefEntry>
  trailer: PdfDict
}

const isWhite = (c: number): boolean =>
  c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32

const latin1 = (bytes: Uint8Array, from: number, to: number): string => {
  let out = ''
  for (let i = from; i < to; i++) out += String.fromCharCode(bytes[i]!)
  return out
}

function readToken(bytes: Uint8Array, offset: number): { token: string; end: number } {
  let i = offset
  while (i < bytes.length && isWhite(bytes[i]!)) i++
  const start = i
  while (i < bytes.length && !isWhite(bytes[i]!)) i++
  return { token: latin1(bytes, start, i), end: i }
}

function readInt(bytes: Uint8Array, offset: number): { n: number; end: number } {
  const { token, end } = readToken(bytes, offset)
  if (!/^\d+$/.test(token)) throw new Error(`Expected an integer at ${offset}`)
  return { n: Number(token), end }
}

function findStartxref(bytes: Uint8Array): number {
  const tail = latin1(bytes, Math.max(0, bytes.length - 1024), bytes.length)
  const at = tail.lastIndexOf('startxref')
  if (at < 0) throw new Error('No startxref')
  return readInt(bytes, bytes.length - tail.length + at + 9).n
}

interface Section {
  entries: Map<number, XrefEntry>
  trailer: PdfDict
}

function readTable(bytes: Uint8Array, offset: number): Section {
  const entries = new Map<number, XrefEntry>()
  let i = readToken(bytes, offset).end // past "xref"
  for (;;) {
    const head = readToken(bytes, i)
    if (head.token.startsWith('trailer')) {
      // The dictionary may follow the keyword with no space: `trailer<<`.
      const trailer = parseValue(bytes, head.end - (head.token.length - 7)).value
      if (!isDict(trailer)) throw new Error('Trailer is not a dictionary')
      return { entries, trailer }
    }
    const first = readInt(bytes, i)
    const count = readInt(bytes, first.end)
    i = count.end
    for (let k = 0; k < count.n; k++) {
      const off = readInt(bytes, i)
      const gen = readInt(bytes, off.end)
      const kind = readToken(bytes, gen.end)
      i = kind.end
      if (kind.token === 'n') {
        entries.set(first.n + k, { type: 'offset', offset: off.n, gen: gen.n })
      } else if (kind.token === 'f') {
        entries.set(first.n + k, { type: 'free' })
      } else {
        throw new Error(`Bad xref entry type "${kind.token}"`)
      }
    }
  }
}

const numbers = (v: PdfValue | undefined): number[] | undefined =>
  Array.isArray(v) && v.every((x) => typeof x === 'number' && x >= 0)
    ? (v as number[])
    : undefined

async function readStream(bytes: Uint8Array, offset: number): Promise<Section> {
  const obj = parseIndirect(bytes, offset)
  const dict = obj.value
  if (!isDict(dict) || obj.streamStart === undefined) {
    throw new Error('Xref stream expected')
  }
  const length = dict.entries.get('Length')
  const data = await decodeStream(
    bytes,
    dict,
    obj.streamStart,
    typeof length === 'number' ? length : undefined
  )
  const w = numbers(dict.entries.get('W'))
  if (!w || w.length !== 3 || w.some((x) => x > 8)) throw new Error('Bad /W')
  const size = dict.entries.get('Size')
  const index = numbers(dict.entries.get('Index')) ?? [
    0,
    typeof size === 'number' ? size : 0,
  ]
  const [w0, w1, w2] = w as [number, number, number]
  const rowLength = w0 + w1 + w2
  if (rowLength === 0) throw new Error('Empty xref rows')
  const field = (at: number, width: number): number => {
    let n = 0
    for (let k = 0; k < width; k++) n = n * 256 + data[at + k]!
    return n
  }
  const entries = new Map<number, XrefEntry>()
  let row = 0
  for (let s = 0; s + 1 < index.length; s += 2) {
    for (let k = 0; k < index[s + 1]!; k++, row++) {
      const at = row * rowLength
      if (at + rowLength > data.length) return { entries, trailer: dict }
      const type = w0 === 0 ? 1 : field(at, w0)
      const a = field(at + w0, w1)
      const b = field(at + w0 + w1, w2)
      const num = index[s]! + k
      if (type === 0) entries.set(num, { type: 'free' })
      else if (type === 1) entries.set(num, { type: 'offset', offset: a, gen: b })
      else if (type === 2) entries.set(num, { type: 'compressed', stream: a, index: b })
    }
  }
  return { entries, trailer: dict }
}

async function readSection(bytes: Uint8Array, offset: number): Promise<Section> {
  if (!Number.isInteger(offset) || offset < 0 || offset >= bytes.length) {
    throw new Error('Xref offset out of range')
  }
  return readToken(bytes, offset).token === 'xref'
    ? readTable(bytes, offset)
    : readStream(bytes, offset)
}

/** Newest entry wins along the /Prev chain (and a hybrid file's /XRefStm). Undefined when startxref or a section cannot be read. */
export async function readXref(bytes: Uint8Array): Promise<Xref | undefined> {
  try {
    const entries = new Map<number, XrefEntry>()
    const visited = new Set<number>()
    let trailer: PdfDict | undefined
    let next: number | undefined = findStartxref(bytes)
    while (next !== undefined && !visited.has(next)) {
      visited.add(next)
      const section = await readSection(bytes, next)
      trailer ??= section.trailer
      const hybrid = section.trailer.entries.get('XRefStm')
      // A hybrid file's table marks compressed objects free; its XRefStm holds the real entries.
      if (typeof hybrid === 'number' && !visited.has(hybrid)) {
        visited.add(hybrid)
        const extra = await readSection(bytes, hybrid)
        for (const [num, e] of extra.entries) if (!entries.has(num)) entries.set(num, e)
      }
      for (const [num, e] of section.entries) if (!entries.has(num)) entries.set(num, e)
      const prev = section.trailer.entries.get('Prev')
      next = typeof prev === 'number' ? prev : undefined
    }
    return trailer ? { entries, trailer } : undefined
  } catch {
    return undefined
  }
}
