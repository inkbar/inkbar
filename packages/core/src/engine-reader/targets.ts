// Where a link or outline item goes, from the facts the engine reports, by the rules PDF.js
// 6.4.299 applies to the same dictionaries (`Catalog.parseDestDictionary` and the reader's
// `targetOf`), so either reader gives a host the same target. Nothing here runs a script: a
// JavaScript action is only matched against the one call shape PDF.js reads an address from.
import { isNamedAction, type LinkTarget, type RawDestination } from '../model/destination'
import { safeUrl, unsafeUrlReason } from '../model/form/url'

import type {
  ExplicitDestinationShape,
  FileActionShape,
  FileDestinationShape,
  FileTargetShape,
} from './types'

/**
 * @internal Pages by object reference, `"<number> <generation>"`, for the references this
 * reader puts in an explicit destination's `raw`, so it can resolve them again. -1 for a
 * reference to no page of the file.
 */
export type RefPages = Map<string, number>

/** @internal The key of a page reference in `RefPages`. */
export const refKey = (num: number, gen: number): string => `${num} ${gen}`

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
 * The page reference of an explicit destination it gives is noted in `pages`.
 */
export function targetFromFacts(
  facts: FileTargetShape & { destinationInvalid?: true },
  pages?: RefPages
): LinkTarget {
  const read = readTarget(facts, pages)
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
 * @internal A destination as a `RawDestination`, in the shape PDF.js gives one: a name decoded as
 * PDF.js decodes a byte string; an explicit one as the file's array, its page entry as
 * `{ num, gen }` when it is a reference and as the number when it is a whole number, its fit as
 * `{ name }`, then the arguments as written. A page number of -1 is kept and resolves to nothing.
 * `undefined` for an explicit destination PDF.js's `isValidExplicitDest` refuses. A reference is
 * noted in `pages` with the page it names.
 */
export function rawDestination(
  dest: FileDestinationShape,
  pages?: RefPages
): RawDestination | undefined {
  if ('name' in dest) return pdfString(dest.name)
  if (!validExplicit(dest)) return undefined
  const rest = [{ name: dest.fit }, ...dest.args.slice(0, dest.argCount)]
  if (!dest.pageRef) return [dest.page, ...rest]
  const { objectNumber: num, generation: gen } = dest.pageRef
  pages?.set(refKey(num, gen), dest.page)
  return [{ num, gen }, ...rest]
}

/**
 * Whether PDF.js 6.4.299's `isValidExplicitDest` accepts the array: a page entry that is a
 * reference, to anything, or a whole number; a fit written as a name PDF.js knows; as many
 * arguments as that fit takes (XYZ two or three, Fit and FitB none, FitH, FitBH, FitV and FitBV
 * at most one, FitR four); and each argument a number or, but for FitR, `null`, written in
 * place: a reference, even to a number, is refused.
 */
function validExplicit(dest: ExplicitDestinationShape): boolean {
  if (!dest.pageRef && dest.pageKind !== 'integer') return false
  if (dest.fitKind !== 'name') return false
  const range = FIT_ARGS.get(dest.fit)
  if (!range) return false
  const [least, most] = range
  if (dest.argCount < least || dest.argCount > most) return false
  if (dest.argIndirect) return false
  const nullable = dest.fit !== 'FitR'
  return dest.argKinds.every((kind) => kind === 'number' || (nullable && kind === 'null'))
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

/**
 * The fewest and most arguments after the fit name PDF.js accepts for each fit. A map, so a name
 * from the file such as `constructor` finds nothing.
 */
const FIT_ARGS: ReadonlyMap<string, readonly [number, number]> = new Map([
  ['XYZ', [2, 3]],
  ['Fit', [0, 0]],
  ['FitB', [0, 0]],
  ['FitH', [0, 1]],
  ['FitBH', [0, 1]],
  ['FitV', [0, 1]],
  ['FitBV', [0, 1]],
  ['FitR', [4, 4]],
])

/**
 * What PDF.js reads from a link's or outline item's dictionary: its `/A`; failing that its
 * `/Dest`, whatever the `/Dest` holds; with neither, its `/AA` entry for a press, else a release.
 */
function readTarget(
  facts: FileTargetShape & { destinationInvalid?: true },
  pages: RefPages | undefined
): Read {
  const hasDest = facts.destination !== undefined || facts.destinationInvalid === true
  const action = facts.action ?? (hasDest ? undefined : facts.additionalAction)
  if (!action) return destRead(facts.destination, pages)
  return readAction(action, pages)
}

/**
 * A destination as PDF.js reads it into a target. An empty string or name is none: PDF.js tests
 * the file's value before decoding it.
 */
const destRead = (dest: FileDestinationShape | undefined, pages?: RefPages): Read => {
  if (!dest || ('name' in dest && dest.name.length === 0)) return {}
  const raw = rawDestination(dest, pages)
  return raw === undefined ? {} : { dest: raw }
}

function readAction(action: FileActionShape, pages: RefPages | undefined): Read {
  switch (action.kind) {
    case 'URI':
      // PDF.js reads a name as the address `/` and the name.
      if (action.uriKind === 'name')
        return { unsafeUrl: `/${latin1(action.uri ?? EMPTY)}` }
      return action.uriKind === 'string' ? { unsafeUrl: latin1(action.uri ?? EMPTY) } : {}
    case 'GoTo':
      return destRead(action.destination, pages)
    case 'GoToR':
    case 'Launch': {
      if (!action.fileKind) return {}
      const file = action.file ?? EMPTY
      let address = action.fileKind === 'spec' ? specFileName(file) : latin1(file)
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
 * one as JSON of its array. `undefined` for one PDF.js does not accept.
 */
function remoteDest(dest: FileDestinationShape): string | undefined {
  const raw = rawDestination(dest)
  if (raw === undefined) return undefined
  return typeof raw === 'string' ? raw : JSON.stringify(raw)
}

const EMPTY = new Uint8Array()

/**
 * The file a file specification names, as PDF.js's `FileSpec.filename` gives it: the string
 * decoded as text, each backslash then a slash (a doubled one first made single, and one before
 * a slash dropped). PDF.js keeps a plain `/F` string's bytes instead.
 */
function specFileName(bytes: Uint8Array): string {
  return pdfString(bytes)
    .replaceAll('\\\\', '\\')
    .replaceAll('\\/', '/')
    .replaceAll('\\', '/')
}

/**
 * The one shape of script PDF.js reads an address from: at its very start, `app.launchURL`,
 * `window.open` or `xfa.host.gotoURL` called with a quoted address and, for the first, a flag.
 * The pattern is PDF.js's own. It is anchored at the start and each part is a run of one class
 * up to a character outside it, so it reads a script of any length in linear time.
 */
const URL_CALL =
  /^\s*(app\.launchURL|window\.open|xfa\.host\.gotoURL)\((?:'|")([^'"]*)(?:'|")(?:,\s*(\w+)\)|\))/i

/** @internal The address and window flag of the one script shape PDF.js reads an address from. */
export function urlInScript(
  script: string
): { url: string; newWindow: boolean } | undefined {
  const found = URL_CALL.exec(script)
  if (!found?.[2]) return undefined
  return { url: found[2], newWindow: found[1] === 'app.launchURL' && found[3] === 'true' }
}

/**
 * PDF.js's clean-up of an address: `http://` before one that starts `www.` and has a second dot,
 * a UTF-8 decode when the characters are UTF-8 bytes, then the URL parser's `href`.
 *
 * @internal
 */
export function cleanAddress(address: string): string | undefined {
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
 * that does not decode, PDFDocEncoding (over the bytes left after that drop). With
 * `dropEscapes`, escape sequences are dropped as PDF.js drops them by default: from the decoded
 * text, or from the bytes before PDFDocEncoding is applied.
 *
 * @internal
 */
export function pdfString(bytes: Uint8Array, dropEscapes = false): string {
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
      const decoded = DECODERS[encoding].decode(text)
      return dropEscapes && decoded.includes(ESC) ? decoded.replace(ESCAPES, '') : decoded
    } catch {
      // Not what the mark says: read as PDFDocEncoding, as PDF.js does.
    }
  }
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const byte = text[i]!
    // An escape sequence runs to the next escape byte, both dropped: before translation, as
    // 0x1b is a character of PDFDocEncoding too.
    if (dropEscapes && byte === 0x1b) {
      while (++i < text.length && text[i] !== 0x1b);
      continue
    }
    out += String.fromCharCode(PDF_DOC.get(byte) ?? byte)
  }
  return out
}

const ESC = '\x1b'
/** An escape sequence in decoded text: a language code PDF.js drops. */
const ESCAPES = new RegExp(`${ESC}[^${ESC}]*(?:${ESC}|$)`, 'g')
