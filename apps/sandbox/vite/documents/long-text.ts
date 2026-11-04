/*
 * The text of the long document, apart from pdf-lib so tests and the search scenario can read it
 * without building the PDF. Each page is one entry of a made-up building works log, generated
 * from a seed per page, so every build draws the same words. `SEARCH_WORD` appears only in the
 * sentences `hitSentence` adds, on a fixed schedule of pages.
 */

export const SEARCH_WORD = 'invoice'
export const LONG_PAGES = 200
/** How often `SEARCH_WORD` appears across the whole document. */
export const LONG_HITS = 48
/** How many pages hold `SEARCH_WORD` at least once. */
export const LONG_HIT_PAGES = 31

/** Lines are wrapped to this many characters; at 10.5 pt Helvetica they fit the A4 measure. */
const MEASURE = 92

/**
 * Hits fall on every sixth page from 19 to 199. The first 17 of those pages hold two, the
 * other 14 hold one: 17 × 2 + 14 = 48 hits on 31 pages.
 */
function hitsOn(page: number): number {
  if (page < 19 || (page - 19) % 6 !== 0) return 0
  const k = (page - 19) / 6
  return k < 17 ? 2 : 1
}

/** A small seeded generator (mulberry32), so each page's words are fixed. */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const VERBS = [
  'replaced',
  'checked',
  'cleaned',
  'repainted',
  'measured',
  'repaired',
  'inspected',
  'sealed',
]
const THINGS = [
  'gutter',
  'fence panel',
  'boiler flue',
  'stair rail',
  'window seal',
  'drain cover',
  'roof tile',
  'door hinge',
  'meter cupboard',
  'light fitting',
]
const PLACES = [
  'on the north side',
  'on the east stair',
  'on the second floor',
  'in the car park',
  'in the rear yard',
  'in the entrance hall',
  'on the top landing',
  'in the plant room',
]
const PEOPLE = ['Priya', 'Tom', 'Grace', 'Kwame', 'Ellen', 'Marek']

type Pick = <T>(items: readonly T[]) => T

const SENTENCES: ((pick: Pick) => string)[] = [
  (p) => `The crew ${p(VERBS)} the ${p(THINGS)} ${p(PLACES)}.`,
  (p) => `${p(PEOPLE)} ${p(VERBS)} the ${p(THINGS)} ${p(PLACES)} before lunch.`,
  (p) => `${p(PEOPLE)} signed off the ${p(THINGS)} after a second look.`,
  () => 'Work stopped for an hour while the rain passed.',
  (p) => `Parts for the ${p(THINGS)} came from the usual supplier.`,
  (p) => `The ${p(THINGS)} ${p(PLACES)} needs another visit next week.`,
  (p) => `${p(PEOPLE)} took photos ${p(PLACES)} for the file.`,
  () => 'Tenants were told about the noise a day ahead.',
]

const HITS: ((pick: Pick) => string)[] = [
  (p) => `The ${SEARCH_WORD} for the ${p(THINGS)} went to the office.`,
  (p) => `${p(PEOPLE)} asked for a copy of the ${SEARCH_WORD} before paying.`,
]

/** Greedy word wrap to `MEASURE` characters. */
function wrap(text: string): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && next.length > MEASURE) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

const PARAGRAPHS = 6

/**
 * The lines drawn on `page` (from 1), top to bottom: a heading, then paragraphs separated by
 * an empty line. Hits go at the end of the first and fourth paragraphs.
 */
export function longPageText(page: number): string[] {
  const next = random(page * 7919)
  const pick: Pick = (items) => items[Math.floor(next() * items.length)]!
  const hits = hitsOn(page)
  const lines = [`Works log, entry ${page} of ${LONG_PAGES}`]
  for (let i = 0; i < PARAGRAPHS; i++) {
    const count = 4 + Math.floor(next() * 3)
    const sentences: string[] = []
    while (sentences.length < count) {
      const sentence = pick(SENTENCES)(pick)
      if (!sentences.includes(sentence)) sentences.push(sentence)
    }
    if ((i === 0 && hits >= 1) || (i === 3 && hits >= 2))
      sentences.push(HITS[i === 0 ? 0 : 1]!(pick))
    lines.push('', ...wrap(sentences.join(' ')))
  }
  return lines
}
