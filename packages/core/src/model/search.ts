import { rectFromQuads, type Point, type Quad, type Rect } from './geometry'
import { isBlankQuery, normalizeQuery, type SearchableText } from './search-text'

/** How much page text `before` and `after` carry on each side of a hit. */
export const CONTEXT_CHARS = 40

export interface SearchOptions {
  /** Defaults to false. Ignored for a `RegExp`, whose own `i` flag rules. */
  matchCase?: boolean
  /** Requires a hit to have no letter, digit or underscore next to it. */
  wholeWord?: boolean
  /** Page indices to search, in the order given. Defaults to every page in order. */
  pages?: readonly number[]
  signal?: AbortSignal
}

export interface SearchHit {
  page: number
  /** Offsets into `pageText(page)`. */
  start: number
  end: number
  /** The page text the hit covers. */
  text: string
  /** One quad per run of text the hit touches. */
  quads: Quad[]
  rect: Rect
  /** Up to `CONTEXT_CHARS` of page text either side of the hit, whitespace collapsed. */
  before: string
  after: string
}

export interface SearchResults extends AsyncIterable<SearchHit> {
  all(): Promise<SearchHit[]>
}

const WORD_BEFORE = /[\p{L}\p{N}_]$/u
const WORD_AFTER = /^[\p{L}\p{N}_]/u

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Match ranges `[start, end)` into `norm`, in order and without overlap. */
function normRanges(
  norm: string,
  query: string | RegExp,
  matchCase: boolean
): [number, number][] {
  const out: [number, number][] = []
  if (typeof query === 'string') {
    if (isBlankQuery(query)) return out
    const needle = normalizeQuery(query, true)
    const haystack = matchCase ? norm : norm.toLowerCase()
    const target = matchCase ? needle : needle.toLowerCase()
    // Indexes into `norm` only carry over when folding case kept every length.
    if (haystack.length === norm.length && target.length === needle.length) {
      for (
        let at = haystack.indexOf(target);
        at !== -1;
        at = haystack.indexOf(target, at + target.length)
      )
        out.push([at, at + target.length])
      return out
    }
    // Lower-casing changed a length ("İ" is two UTF-16 units), so search `norm` itself.
    return regexRanges(norm, new RegExp(escapeRegExp(needle), 'giu'))
  }
  // Global so `exec` walks the text; not sticky, which would stop at the first gap.
  const flags = query.flags.replace(/[gy]/g, '') + 'g'
  return regexRanges(norm, new RegExp(query.source, flags))
}

function regexRanges(norm: string, re: RegExp): [number, number][] {
  const out: [number, number][] = []
  const unicode = re.unicode || re.flags.includes('v')
  for (let m = re.exec(norm); m; m = re.exec(norm)) {
    if (m[0] !== '') {
      out.push([m.index, m.index + m[0].length])
      continue
    }
    // Step past an empty match by a whole code point: a unicode regexp moved to the middle of
    // a surrogate pair backs up to its start and finds the same empty match again.
    re.lastIndex = m.index + (unicode && norm.codePointAt(m.index)! > 0xffff ? 2 : 1)
  }
  return out
}

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/** The part of an item's quad from character `a` to `b` of `len`, cut along its baseline. */
function cutQuad(q: Quad, a: number, b: number, len: number): Quad {
  const t0 = a / len
  const t1 = b / len
  return {
    p1: lerp(q.p1, q.p2, t0),
    p2: lerp(q.p1, q.p2, t1),
    p3: lerp(q.p3, q.p4, t0),
    p4: lerp(q.p3, q.p4, t1),
  }
}

function quadsFor(st: SearchableText, start: number, end: number): Quad[] {
  const spans = new Map<number, [number, number]>()
  for (let r = start; r < end; r++) {
    const i = st.rawToItem[r]!
    if (i < 0) continue
    const k = st.rawToOffset[r]!
    const span = spans.get(i)
    if (span) {
      span[0] = Math.min(span[0], k)
      span[1] = Math.max(span[1], k + 1)
    } else spans.set(i, [k, k + 1])
  }
  const quads: Quad[] = []
  for (const [i, [a, b]] of spans) {
    const it = st.content.items[i]!
    quads.push(cutQuad(it.quad, a, b, it.str.length))
  }
  return quads
}

const collapse = (s: string) => s.replace(/\s+/gu, ' ')

/** Every hit for `query` on one page, in page order. */
export function matchPage(
  st: SearchableText,
  query: string | RegExp,
  opts: { matchCase: boolean; wholeWord: boolean }
): SearchHit[] {
  const hits: SearchHit[] = []
  for (const [ns, ne] of normRanges(st.norm, query, opts.matchCase)) {
    if (opts.wholeWord) {
      if (WORD_BEFORE.test(st.norm.slice(Math.max(0, ns - 2), ns))) continue
      if (WORD_AFTER.test(st.norm.slice(ne, ne + 2))) continue
    }
    const start = st.normToRaw[ns]!
    const last = st.normToRaw[ne - 1]!
    const end = last + (st.raw.codePointAt(last)! > 0xffff ? 2 : 1)
    const quads = quadsFor(st, start, end)
    if (quads.length === 0) continue
    hits.push({
      page: st.page,
      start,
      end,
      text: st.raw.slice(start, end),
      quads,
      rect: rectFromQuads(quads),
      before: collapse(st.raw.slice(Math.max(0, start - CONTEXT_CHARS), start)),
      after: collapse(st.raw.slice(end, end + CONTEXT_CHARS)),
    })
  }
  return hits
}
