// Where a link or outline item goes, from the facts the engine reports, by the rules PDF.js
// 6.4.299 applies to the same dictionaries (`Catalog.parseDestDictionary` and the reader's
// `targetOf`), so either reader gives a host the same target. Nothing here runs a script: a
// JavaScript action is only matched against the one call shape PDF.js reads an address from.
import { isNamedAction, type LinkTarget, type RawDestination } from '../model/destination'
import { safeUrl, unsafeUrlReason } from '../model/form/url'

import type { FileActionShape, FileDestinationShape, FileTargetShape } from './types'

/** What PDF.js reads from a link or outline item before Inkbar turns it into a target. */
interface Read {
  dest?: RawDestination
  /** A Named action's name. */
  action?: string
  /** The address as the file gives it, before any clean-up. */
  unsafeUrl?: string
  newWindow?: boolean
}

/**
 * @internal Where a link or outline item goes, by PDF.js 6.4.299's rules, from the file's facts.
 */
export function targetFromFacts(facts: FileTargetShape): LinkTarget {
  const read = readTarget(facts)
  if (read.dest !== undefined) return { kind: 'dest', raw: read.dest }
  if (isNamedAction(read.action)) return { kind: 'named', action: read.action }
  const unsafeUrl = read.unsafeUrl
  if (unsafeUrl !== undefined) {
    const cleaned = cleanAddress(unsafeUrl)
    const url = cleaned === undefined ? undefined : safeUrl(cleaned)
    if (url) return { kind: 'url', url, newWindow: !!read.newWindow }
    if (unsafeUrl)
      return safeUrl(unsafeUrl)
        ? { kind: 'unsupported', reason: 'unknown' }
        : { kind: 'unsupported', reason: unsafeUrlReason(unsafeUrl) }
  }
  return { kind: 'unsupported', reason: 'unknown' }
}

/**
 * @internal The address PDF.js would make of a URI's bytes, before `safeUrl`. `undefined` when it
 * makes none.
 */
export function cleanUri(bytes: Uint8Array): string | undefined {
  return cleanAddress(latin1(bytes))
}

/**
 * @internal A destination as a `RawDestination`: a name decoded as PDF.js decodes a byte string,
 * an explicit one as `[page, { name: fit }, ...args]` with the arguments its fit takes. A `page`
 * of -1 is kept and resolves to nothing. `undefined` for an explicit destination PDF.js does not
 * accept (`isValidExplicitDest`), as far as the engine's facts tell: an unknown fit, a Fit or
 * FitB with an argument, a FitH, FitBH, FitV or FitBV with more than one, an XYZ with more than
 * three, or a FitR without four numbers.
 *
 * The facts give four arguments with `null` where the file has none, so a `null` the file
 * writes looks like one it leaves out, and an argument that is not a number reads as `null`.
 * What PDF.js refuses for those reasons is kept here: an XYZ with fewer than two arguments,
 * any fit with a written `null` past the arguments it takes, a FitR with more than four, a
 * non-number argument (or an indirect reference to a number), a fit written as a string, and a
 * first entry that is neither a page reference nor a whole number.
 */
export function rawDestination(dest: FileDestinationShape): RawDestination | undefined {
  if ('name' in dest) return pdfString(dest.name)
  const count = FIT_ARGS[dest.fit]
  if (count === undefined) return undefined
  const args = dest.args.slice(0, count)
  // An argument past those the fit takes is one more than PDF.js allows.
  if (dest.args.slice(count).some((arg) => arg !== null)) return undefined
  if (dest.fit === 'FitR' && (args.length < 4 || args.includes(null))) return undefined
  return [dest.page, { name: dest.fit }, ...args]
}

/**
 * @internal Bytes for a destination name that `rawDestination` decodes back to it:
 * PDFDocEncoding when every character has a byte there, else UTF-16BE with a byte-order mark.
 * The engine compares a name tree's keys decoded, so either finds a key however it was written.
 */
export function nameBytes(name: string): Uint8Array {
  const bytes = new Uint8Array(name.length)
  let ok = true
  for (let i = 0; i < name.length && ok; i++) {
    const byte = PDF_DOC_BYTE.get(name.charCodeAt(i))
    if (byte === undefined) ok = false
    else bytes[i] = byte
  }
  if (ok && !startsWithMark(bytes)) return bytes
  const out = new Uint8Array(2 + name.length * 2)
  out[0] = 0xfe
  out[1] = 0xff
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i)
    out[2 + i * 2] = code >> 8
    out[3 + i * 2] = code & 0xff
  }
  return out
}

/** The most arguments after the fit name PDF.js accepts for each fit. */
const FIT_ARGS: Readonly<Record<string, number>> = {
  XYZ: 3,
  Fit: 0,
  FitB: 0,
  FitH: 1,
  FitBH: 1,
  FitV: 1,
  FitBV: 1,
  FitR: 4,
}

/**
 * What PDF.js reads from a link's or outline item's dictionary: its `/A`; failing that its
 * `/Dest`; failing both, its `/AA` entry for a press, else a release.
 */
function readTarget(facts: FileTargetShape): Read {
  const action = facts.action ?? (facts.destination ? undefined : facts.additionalAction)
  if (!action) return facts.destination ? destRead(facts.destination) : {}
  return readAction(action)
}

/**
 * A destination as PDF.js reads it into a target. An empty string or name is none: PDF.js tests
 * the file's value before decoding it.
 */
const destRead = (dest: FileDestinationShape | undefined): Read => {
  if (!dest || ('name' in dest && dest.name.length === 0)) return {}
  const raw = rawDestination(dest)
  return raw === undefined ? {} : { dest: raw }
}

function readAction(action: FileActionShape): Read {
  switch (action.kind) {
    case 'URI':
      return action.uri ? { unsafeUrl: latin1(action.uri) } : {}
    case 'GoTo':
      return destRead(action.destination)
    case 'GoToR':
    case 'Launch': {
      if (!action.file) return {}
      let address = fileName(action.file)
      const remote = action.destination && remoteDest(action.destination)
      // PDF.js joins the file and a destination in it as file#dest.
      if (remote) address = `${address.split('#', 1)[0]}#${remote}`
      return {
        unsafeUrl: address,
        ...(action.newWindow !== undefined && { newWindow: action.newWindow }),
      }
    }
    case 'Named':
      return action.name !== undefined ? { action: action.name } : {}
    case 'JavaScript': {
      const found = action.script === undefined ? undefined : urlInScript(action.script)
      return found ? { unsafeUrl: found.url, newWindow: found.newWindow } : {}
    }
    default:
      return {}
  }
}

/**
 * A destination in another file as PDF.js writes it after the `#`: a name decoded, an explicit
 * one as JSON. `undefined` for one PDF.js does not accept.
 */
function remoteDest(dest: FileDestinationShape): string | undefined {
  const raw = rawDestination(dest)
  if (raw === undefined) return undefined
  if (typeof raw === 'string') return raw
  // The page of another file is the number the file gives, so it is a valid entry.
  return Number.isInteger(raw[0]) ? JSON.stringify(raw) : undefined
}

/**
 * The file a GoToR or Launch action names. The engine gives the first string of a file
 * specification or `/F` itself: PDF.js decodes the former as text and keeps the latter's bytes,
 * so a name with a byte-order mark, which only text has, is decoded and any other is kept.
 */
function fileName(bytes: Uint8Array): string {
  return startsWithMark(bytes) ? pdfString(bytes) : latin1(bytes)
}

/**
 * The one shape of script PDF.js reads an address from: at its very start, `app.launchURL`,
 * `window.open` or `xfa.host.gotoURL` called with a quoted address and, for the first, a flag.
 * The pattern is PDF.js's own. It is anchored at the start and each part is a run of one class
 * up to a character outside it, so it reads a script of any length in linear time.
 */
const URL_CALL =
  /^\s*(app\.launchURL|window\.open|xfa\.host\.gotoURL)\((?:'|")([^'"]*)(?:'|")(?:,\s*(\w+)\)|\))/i

function urlInScript(script: string): { url: string; newWindow: boolean } | undefined {
  const found = URL_CALL.exec(script)
  if (!found?.[2]) return undefined
  return { url: found[2], newWindow: found[1] === 'app.launchURL' && found[3] === 'true' }
}

/**
 * PDF.js's clean-up of an address: `http://` before one that starts `www.` and has a second dot,
 * a UTF-8 decode when the characters are UTF-8 bytes, then the URL parser's `href`.
 */
function cleanAddress(address: string): string | undefined {
  let url = address
  if (url.startsWith('www.') && url.indexOf('.', 4) !== -1) url = `http://${url}`
  const utf8 = utf8Of(url)
  if (utf8 !== undefined) url = utf8
  try {
    return new URL(url).href
  } catch {
    return undefined
  }
}

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** `text`'s characters as bytes decoded as UTF-8, or `undefined` when they are not UTF-8 bytes. */
function utf8Of(text: string): string | undefined {
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code > 0xff) return undefined
    bytes[i] = code
  }
  try {
    return UTF8.decode(bytes)
  } catch {
    return undefined
  }
}

/** One character per byte, as PDF.js holds a string from the file. */
function latin1(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 8192)
    out += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return out
}

const startsWithMark = (b: Uint8Array): boolean =>
  (b[0] === 0xfe && b[1] === 0xff) ||
  (b[0] === 0xff && b[1] === 0xfe) ||
  (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf)

/** PDFDocEncoding where it is not Latin-1: 0x18 to 0x1f, 0x80 to 0x9e and 0xa0. */
const PDF_DOC: ReadonlyMap<number, number> = new Map([
  ...[0x2d8, 0x2c7, 0x2c6, 0x2d9, 0x2dd, 0x2db, 0x2da, 0x2dc].map(
    (code, i) => [0x18 + i, code] as const
  ),
  ...[
    0x2022, 0x2020, 0x2021, 0x2026, 0x2014, 0x2013, 0x192, 0x2044, 0x2039, 0x203a, 0x2212,
    0x2030, 0x201e, 0x201c, 0x201d, 0x2018, 0x2019, 0x201a, 0x2122, 0xfb01, 0xfb02, 0x141,
    0x152, 0x160, 0x178, 0x17d, 0x131, 0x142, 0x153, 0x161, 0x17e,
  ].map((code, i) => [0x80 + i, code] as const),
  [0xa0, 0x20ac],
])

/** Each character PDFDocEncoding has, to its byte. */
const PDF_DOC_BYTE: ReadonlyMap<number, number> = new Map(
  Array.from({ length: 256 }, (_, byte) => [PDF_DOC.get(byte) ?? byte, byte] as const)
)

const DECODERS = {
  'utf-16be': new TextDecoder('utf-16be', { fatal: true }),
  'utf-16le': new TextDecoder('utf-16le', { fatal: true }),
  'utf-8': new TextDecoder('utf-8', { fatal: true }),
}

/**
 * A byte string decoded as PDF.js's `stringToPDFString` decodes one, escape sequences kept:
 * UTF-16 or UTF-8 after a byte-order mark (an odd last byte of UTF-16 dropped), else, or when
 * that does not decode, PDFDocEncoding (over the bytes left after that drop).
 */
function pdfString(bytes: Uint8Array): string {
  const encoding =
    bytes[0] === 0xfe && bytes[1] === 0xff
      ? 'utf-16be'
      : bytes[0] === 0xff && bytes[1] === 0xfe
        ? 'utf-16le'
        : bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
          ? 'utf-8'
          : undefined
  let text = bytes
  if (encoding) {
    // PDF.js drops an odd last byte of UTF-16 before it decodes, and keeps it dropped when it
    // falls back.
    if (encoding !== 'utf-8') text = bytes.subarray(0, bytes.length & ~1)
    try {
      return DECODERS[encoding].decode(text)
    } catch {
      // Not what the mark says: read as PDFDocEncoding, as PDF.js does.
    }
  }
  let out = ''
  for (const byte of text) out += String.fromCharCode(PDF_DOC.get(byte) ?? byte)
  return out
}
