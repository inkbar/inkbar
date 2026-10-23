import type { TextContent, TextItem } from './text'

/** Gap, as a fraction of the font size, above which two items on a line read as separate words. */
export const GAP_SPACE = 0.15

/** How far off the baseline, as a fraction of the font size, an item can sit and still share the line. */
const SAME_LINE = 0.5

export interface SearchableText {
  page: number
  /** The joined page text. */
  raw: string
  /** The normalised text matched against. */
  norm: string
  /** `normToRaw[i]` is the raw index norm char `i` came from; the last entry is `raw.length`. */
  normToRaw: Int32Array
  /** Index into `content.items` for each raw char, `-1` for an inserted space. */
  rawToItem: Int32Array
  /** Offset within that item's `str` for each raw char, `-1` for an inserted space. */
  rawToOffset: Int32Array
  content: TextContent
}

const FOLD: Record<string, string> = {}
for (const c of '‘’‚‛') FOLD[c] = "'"
for (const c of '“”„‟') FOLD[c] = '"'
for (const c of '‐‑‒–—―') FOLD[c] = '-'

/** A line ending in one of these joins to the next line's word: hyphen, U+2010, U+2011, soft hyphen. */
const JOINING_HYPHENS = new Set(['-', '\u2010', '\u2011', '\u00ad'])

const MARKS = /\p{M}/gu
const WHITESPACE = /^\s$/u
const LETTER = /^\p{L}/u

/** One code point to its normalised form: NFKD, marks stripped, quotes and dashes folded. */
function fold(ch: string): string {
  const out = ch.normalize('NFKD').replace(MARKS, '')
  let s = ''
  for (const c of out) s += FOLD[c] ?? c
  return s
}

const isSpace = (ch: string | undefined) => ch !== undefined && WHITESPACE.test(ch)

function lineGap(prev: TextItem, next: TextItem): { gap: number; sameLine: boolean } {
  const dx = prev.quad.p4.x - prev.quad.p3.x
  const dy = prev.quad.p4.y - prev.quad.p3.y
  const len = Math.hypot(dx, dy)
  const ux = len === 0 ? 1 : dx / len
  const uy = len === 0 ? 0 : dy / len
  const sx = next.quad.p3.x - prev.quad.p4.x
  const sy = next.quad.p3.y - prev.quad.p4.y
  const size = Math.max(prev.fontSize, next.fontSize)
  return {
    gap: sx * ux + sy * uy,
    sameLine: Math.abs(sx * -uy + sy * ux) <= SAME_LINE * size,
  }
}

/**
 * Joins a page's items the way the page reads: in content order with nothing between them,
 * a space after an item that ends its line, and a space where two items on a line sit further
 * apart than `GAP_SPACE` of the font size. Neither adds a space next to whitespace already there.
 */
export function searchableText(content: TextContent): SearchableText {
  const chars: string[] = []
  const item: number[] = []
  const offset: number[] = []
  // Raw indexes of spaces inserted for a line end, which the hyphen rule looks for.
  const eolSpace = new Set<number>()
  let prev: TextItem | undefined

  const space = (eol: boolean) => {
    if (eol) eolSpace.add(chars.length)
    chars.push(' ')
    item.push(-1)
    offset.push(-1)
  }

  content.items.forEach((it, i) => {
    if (it.str === '') {
      if (it.hasEOL && chars.length > 0 && !isSpace(chars[chars.length - 1])) space(true)
      return
    }
    if (prev && chars.length > 0 && !isSpace(chars[chars.length - 1])) {
      const { gap, sameLine } = lineGap(prev, it)
      const size = Math.max(prev.fontSize, it.fontSize)
      if (!isSpace(it.str[0]) && (!sameLine || gap > GAP_SPACE * size)) space(false)
    }
    for (let k = 0; k < it.str.length; k++) {
      chars.push(it.str[k]!)
      item.push(i)
      offset.push(k)
    }
    if (it.hasEOL && !isSpace(it.str[it.str.length - 1])) space(true)
    prev = it
  })

  const raw = chars.join('')
  let norm = ''
  const map: number[] = []
  for (let r = 0; r < raw.length;) {
    const ch = String.fromCodePoint(raw.codePointAt(r)!)
    if (JOINING_HYPHENS.has(ch) && eolSpace.has(r + 1) && LETTER.test(raw.slice(r + 2))) {
      // "docu-⏎ment": drop the hyphen and the space the line end added.
      r += 2
      continue
    }
    for (const c of fold(ch)) {
      const out = isSpace(c) ? ' ' : c
      if (out === ' ' && norm.endsWith(' ')) continue
      norm += out
      for (let u = 0; u < out.length; u++) map.push(r)
    }
    r += ch.length
  }
  map.push(raw.length)
  const normToRaw = Int32Array.from(map)

  return {
    page: content.page,
    raw,
    norm,
    normToRaw,
    rawToItem: Int32Array.from(item),
    rawToOffset: Int32Array.from(offset),
    content,
  }
}

/** Folds a query the way `norm` is folded; case is lowered here only when the match ignores it. */
export function normalizeQuery(query: string, matchCase: boolean): string {
  let out = ''
  for (const ch of query) out += fold(ch)
  out = out.replace(/\s+/gu, ' ')
  return matchCase ? out : out.toLowerCase()
}

/** Whether `query` folds to nothing but whitespace, which a search treats as no query at all. */
export function isBlankQuery(query: string): boolean {
  return normalizeQuery(query, true).trim() === ''
}
