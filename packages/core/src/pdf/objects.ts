import {
  isDict,
  isRef,
  parseIndirect,
  parseValue,
  type PdfDict,
  type PdfRef,
  type PdfValue,
} from './lexer'
import { decodeStream } from './stream'
import { readXref, type Xref } from './xref'

export interface PdfObjects {
  trailer: PdfDict
  /** The object `ref` names, or undefined if it is missing, free, or unreadable. Never throws. */
  get(ref: PdfRef): Promise<PdfValue | undefined>
  /** `v` with one level of reference followed; other values as they are. */
  resolve(v: PdfValue | undefined): Promise<PdfValue | undefined>
}

interface ObjectStream {
  decoded: Uint8Array
  first: number
  /** Object numbers and offsets from the header, in order. */
  pairs: { num: number; offset: number }[]
}

class Reader implements PdfObjects {
  readonly trailer: PdfDict
  private readonly objectStreams = new Map<number, Promise<ObjectStream | undefined>>()

  constructor(
    private readonly bytes: Uint8Array,
    private readonly xref: Xref
  ) {
    this.trailer = xref.trailer
  }

  async get(ref: PdfRef): Promise<PdfValue | undefined> {
    try {
      return await this.load(ref, true)
    } catch {
      return undefined
    }
  }

  async resolve(v: PdfValue | undefined): Promise<PdfValue | undefined> {
    return isRef(v) ? this.get(v) : v
  }

  /** `followLength` is false while resolving a /Length, so a self-referencing length cannot recurse. */
  private async load(ref: PdfRef, followLength: boolean): Promise<PdfValue | undefined> {
    const entry = this.xref.entries.get(ref.num)
    if (!entry || entry.type === 'free') return undefined
    if (entry.type === 'offset') {
      if (entry.gen !== ref.gen) return undefined
      const obj = parseIndirect(this.bytes, entry.offset)
      return obj.num === ref.num && obj.gen === ref.gen ? obj.value : undefined
    }
    if (ref.gen !== 0) return undefined
    const container = await this.objectStream(entry.stream, followLength)
    if (!container) return undefined
    let pair = container.pairs[entry.index]
    if (pair?.num !== ref.num) pair = container.pairs.find((p) => p.num === ref.num)
    if (!pair) return undefined
    return parseValue(container.decoded, container.first + pair.offset).value
  }

  private objectStream(
    num: number,
    followLength: boolean
  ): Promise<ObjectStream | undefined> {
    let cached = this.objectStreams.get(num)
    if (!cached) {
      cached = this.readObjectStream(num, followLength).catch(() => undefined)
      this.objectStreams.set(num, cached)
    }
    return cached
  }

  private async readObjectStream(
    num: number,
    followLength: boolean
  ): Promise<ObjectStream | undefined> {
    const entry = this.xref.entries.get(num)
    if (entry?.type !== 'offset') return undefined
    const obj = parseIndirect(this.bytes, entry.offset)
    const dict = obj.value
    if (obj.num !== num || !isDict(dict) || obj.streamStart === undefined)
      return undefined
    const n = dict.entries.get('N')
    const first = dict.entries.get('First')
    if (typeof n !== 'number' || typeof first !== 'number') return undefined
    let length = dict.entries.get('Length')
    if (isRef(length)) length = followLength ? await this.loadLength(length) : undefined
    const decoded = await decodeStream(
      this.bytes,
      dict,
      obj.streamStart,
      typeof length === 'number' ? length : undefined
    )
    const pairs: ObjectStream['pairs'] = []
    let at = 0
    for (let i = 0; i < n; i++) {
      const a = parseValue(decoded, at)
      const b = parseValue(decoded, a.end)
      if (typeof a.value !== 'number' || typeof b.value !== 'number') return undefined
      pairs.push({ num: a.value, offset: b.value })
      at = b.end
    }
    return { decoded, first, pairs }
  }

  private async loadLength(ref: PdfRef): Promise<PdfValue | undefined> {
    try {
      return await this.load(ref, false)
    } catch {
      return undefined
    }
  }
}

/** Undefined when the file is encrypted (`/Encrypt` in the trailer) or its xref cannot be read. */
export async function openPdfObjects(bytes: Uint8Array): Promise<PdfObjects | undefined> {
  try {
    const xref = await readXref(bytes)
    if (!xref || xref.trailer.entries.has('Encrypt')) return undefined
    return new Reader(bytes, xref)
  } catch {
    return undefined
  }
}
