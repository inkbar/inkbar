import { dictGet, isDict, isName, PdfSyntaxError, type PdfDict } from './lexer'

const ENDSTREAM = Uint8Array.from('endstream', (c) => c.charCodeAt(0))

function matchesAt(bytes: Uint8Array, at: number, pattern: Uint8Array): boolean {
  if (at < 0 || at + pattern.length > bytes.length) return false
  for (let i = 0; i < pattern.length; i++) if (bytes[at + i] !== pattern[i]) return false
  return true
}

function findEndstream(bytes: Uint8Array, from: number): number {
  for (let i = from; i + ENDSTREAM.length <= bytes.length; i++) {
    if (matchesAt(bytes, i, ENDSTREAM)) return i
  }
  return bytes.length
}

/** Raw stream bytes: trusts `length` when `endstream` follows it, otherwise scans. */
function rawData(
  bytes: Uint8Array,
  start: number,
  length: number | undefined
): Uint8Array {
  if (length !== undefined && Number.isInteger(length) && length >= 0) {
    let i = start + length
    while (i < bytes.length && (bytes[i] === 10 || bytes[i] === 13 || bytes[i] === 32))
      i++
    if (matchesAt(bytes, i, ENDSTREAM)) return bytes.subarray(start, start + length)
  }
  let end = findEndstream(bytes, start)
  if (end > start && bytes[end - 1] === 10) end--
  if (end > start && bytes[end - 1] === 13) end--
  return bytes.subarray(start, end)
}

/** The single filter parameter dictionary, if any. Anything else that is defined is an error. */
function decodeParms(dict: PdfDict): PdfDict | undefined {
  const parms = dictGet(dict, 'DecodeParms') ?? dictGet(dict, 'DP')
  const first = Array.isArray(parms) ? parms[0] : parms
  if (first === undefined || first === null) return undefined
  if (!isDict(first)) throw new PdfSyntaxError('Unsupported /DecodeParms')
  return first
}

function numberParam(parms: PdfDict | undefined, key: string, fallback: number): number {
  const v = parms ? dictGet(parms, key) : undefined
  return typeof v === 'number' ? v : fallback
}

/** A stream inflates to more than the caller allows. */
export class StreamTooLargeError extends Error {
  constructor(limit: number) {
    super(`The stream inflates to more than ${limit} bytes`)
    this.name = 'StreamTooLargeError'
  }
}

/**
 * `data` inflated. With `maxBytes`, inflating stops as soon as the output passes it and the
 * call rejects with a `StreamTooLargeError`, so a small stream cannot be made to fill memory.
 */
async function inflate(data: Uint8Array, maxBytes?: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'))
  if (maxBytes === undefined)
    return new Uint8Array(await new Response(stream).arrayBuffer())
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new StreamTooLargeError(maxBytes)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function undoPngPredictor(
  data: Uint8Array,
  columns: number,
  colors: number,
  bits: number
): Uint8Array {
  const bpp = Math.max(1, Math.ceil((colors * bits) / 8))
  const rowBytes = Math.ceil((columns * colors * bits) / 8)
  const rows = Math.floor(data.length / (rowBytes + 1))
  const out = new Uint8Array(rows * rowBytes)
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowBytes + 1)]!
    const src = r * (rowBytes + 1) + 1
    const dst = r * rowBytes
    for (let x = 0; x < rowBytes; x++) {
      const raw = data[src + x]!
      const left = x >= bpp ? out[dst + x - bpp]! : 0
      const up = r > 0 ? out[dst - rowBytes + x]! : 0
      const upLeft = r > 0 && x >= bpp ? out[dst - rowBytes + x - bpp]! : 0
      let value: number
      switch (type) {
        case 0:
          value = raw
          break
        case 1:
          value = raw + left
          break
        case 2:
          value = raw + up
          break
        case 3:
          value = raw + ((left + up) >> 1)
          break
        case 4:
          value = raw + paeth(left, up, upLeft)
          break
        default:
          throw new PdfSyntaxError(`Unknown PNG filter type ${type}`)
      }
      out[dst + x] = value & 0xff
    }
  }
  return out
}

/**
 * The decoded data of the stream whose dictionary is `dict` and whose data starts at `start`.
 * `length` is `/Length`, already resolved. With `maxBytes`, data larger than that rejects with a
 * `StreamTooLargeError`; a compressed stream stops inflating once it passes it.
 */
export async function decodeStream(
  bytes: Uint8Array,
  dict: PdfDict,
  start: number,
  length: number | undefined,
  maxBytes?: number
): Promise<Uint8Array> {
  const filter = dictGet(dict, 'Filter') ?? dictGet(dict, 'F')
  const filters = Array.isArray(filter) ? filter : filter === undefined ? [] : [filter]
  if (filters.length === 0) {
    const raw = rawData(bytes, start, length)
    if (maxBytes !== undefined && raw.length > maxBytes)
      throw new StreamTooLargeError(maxBytes)
    return raw
  }
  if (filters.length > 1 || !isName(filters[0], 'FlateDecode')) {
    throw new PdfSyntaxError('Unsupported stream filter')
  }
  const inflated = await inflate(rawData(bytes, start, length), maxBytes)
  const parms = decodeParms(dict)
  const predictor = numberParam(parms, 'Predictor', 1)
  if (predictor === 1) return inflated
  if (predictor < 10) throw new PdfSyntaxError(`Unsupported predictor ${predictor}`)
  return undoPngPredictor(
    inflated,
    numberParam(parms, 'Columns', 1),
    numberParam(parms, 'Colors', 1),
    numberParam(parms, 'BitsPerComponent', 8)
  )
}
