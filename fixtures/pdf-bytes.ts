// Test support: what a PDF's bytes hold, for tests that check a writer left no trace of some text.
import { inflateSync } from 'node:zlib'

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1')

/** The data of every stream in the file: inflated when it is Flate, as stored otherwise. */
function streamData(bytes: Uint8Array): string[] {
  const text = latin1(bytes)
  const data: string[] = []
  const start = /(?<!end)stream\r?\n/g
  for (let found = start.exec(text); found; found = start.exec(text)) {
    const begin = found.index + found[0].length
    const end = text.indexOf('endstream', begin)
    if (end < 0) break
    const stored = bytes.subarray(begin, end)
    try {
      data.push(latin1(inflateSync(stored)))
    } catch {
      data.push(latin1(stored))
    }
    start.lastIndex = end
  }
  return data
}

const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }

/**
 * The text of every string in `source`, literal `(...)` with its escapes and hex `<...>`, the
 * elements of TJ arrays and strings in dictionaries included, joined in order.
 */
function strings(source: string): string {
  const out: string[] = []
  let i = 0
  while (i < source.length) {
    const c = source[i]
    if (c === '%') {
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++
    } else if (c === '(') {
      let depth = 1
      i++
      while (i < source.length && depth > 0) {
        const d = source[i++] as string
        if (d === '\\') {
          const e = source[i++]
          if (e === undefined) break
          if (e in ESCAPES) out.push(ESCAPES[e] as string)
          else if (/[0-7]/.test(e)) {
            let octal = e
            while (octal.length < 3 && /[0-7]/.test(source[i] ?? '')) octal += source[i++]
            out.push(String.fromCharCode(Number.parseInt(octal, 8) & 0xff))
          } else if (e === '\r') {
            if (source[i] === '\n') i++
          } else if (e !== '\n') out.push(e)
        } else if (d === '(') {
          depth++
          out.push(d)
        } else if (d === ')') {
          if (--depth > 0) out.push(d)
        } else out.push(d)
      }
    } else if (c === '<' && source[i + 1] !== '<') {
      const end = source.indexOf('>', i)
      if (end < 0) break
      let hex = source.slice(i + 1, end).replace(/[^0-9A-Fa-f]/g, '')
      if (hex.length % 2) hex += '0'
      out.push(Buffer.from(hex, 'hex').toString('latin1'))
      i = end + 1
    } else if (c === '<') i += 2
    else i++
  }
  return out.join('')
}

/**
 * Everything the file holds as text: its bytes, the data of every stream with Flate streams
 * inflated, and the decoded strings of both, once as bytes and once with NUL bytes dropped, so
 * text stored as UTF-16 reads as plain text too.
 */
export function pdfText(bytes: Uint8Array): string {
  const sources = [latin1(bytes), ...streamData(bytes)]
  const decoded = sources.map(strings)
  return [...sources, ...decoded, ...decoded.map((s) => s.replaceAll('\0', ''))].join(
    '\n'
  )
}

/** Whether `word` appears anywhere in the file as `pdfText` reads it. */
export function holdsText(bytes: Uint8Array, word: string): boolean {
  return pdfText(bytes).includes(word)
}
