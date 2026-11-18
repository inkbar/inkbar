const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const SEXTET = new Map([...BASE64].map((c, i) => [c.charCodeAt(0), i]))

/**
 * The media type (lower case, without parameters) and bytes of a data URL, base64 or
 * percent-encoded; undefined for anything else, or a body that does not decode.
 */
export function decodeDataUrl(
  url: string
): { type: string; data: Uint8Array } | undefined {
  const match = /^data:([^,]*),(.*)$/is.exec(url)
  if (!match) return undefined
  const [type = '', ...params] = match[1]!.split(';').map((p) => p.trim().toLowerCase())
  const bytes = percentDecoded(match[2]!)
  const data = params.includes('base64') ? base64Decoded(bytes) : bytes
  return data && { type, data }
}

/** `text` with each `%xx` as its byte and every other character as its UTF-8. */
function percentDecoded(text: string): Uint8Array {
  const out: number[] = []
  const utf8 = new TextEncoder()
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    const hex = c === 0x25 ? text.slice(i + 1, i + 3) : ''
    if (/^[0-9a-f]{2}$/i.test(hex)) {
      out.push(parseInt(hex, 16))
      i += 2
    } else if (c < 0x80) out.push(c)
    else {
      const char = String.fromCodePoint(text.codePointAt(i)!)
      out.push(...utf8.encode(char))
      i += char.length - 1
    }
  }
  return new Uint8Array(out)
}

/** Base64 as bytes, ignoring white space and padding; undefined for any other character. */
function base64Decoded(text: Uint8Array): Uint8Array | undefined {
  const sextets: number[] = []
  let end = text.length
  while (end > 0 && isSpace(text[end - 1]!)) end--
  for (let pad = 0; pad < 2 && end > 0 && text[end - 1] === 0x3d; pad++) end--
  for (let i = 0; i < end; i++) {
    const b = text[i]!
    if (isSpace(b)) continue
    const v = SEXTET.get(b)
    if (v === undefined) return undefined
    sextets.push(v)
  }
  if (sextets.length % 4 === 1) return undefined
  const out = new Uint8Array(Math.floor((sextets.length * 6) / 8))
  let bits = 0
  let held = 0
  let n = 0
  for (const v of sextets) {
    bits = (bits << 6) | v
    held += 6
    if (held >= 8) {
      held -= 8
      out[n++] = (bits >> held) & 0xff
      bits &= (1 << held) - 1
    }
  }
  return out
}

const isSpace = (b: number): boolean =>
  b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0c || b === 0x0d
