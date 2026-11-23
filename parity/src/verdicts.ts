// The shape of parity.json, and the check that a file has it.

/**
 * A fixture's verdict on one of text, links and the outline, checked like the drawing's. `pages`
 * (1-based) lists the compared pages that differ, as for the drawing; the outline has no pages.
 */
export type PartVerdict =
  | { state: 'same' }
  | { state: 'different'; reason: string; accepted: boolean; pages?: number[] }

/** The parts compared beside the drawing. An absent key means `{ state: 'same' }`. */
export const PARTS = ['text', 'links', 'outline'] as const
export type Part = (typeof PARTS)[number]
type Parts = { [K in Part]?: PartVerdict }

/** A verdict on the drawing of a fixture that opens. */
type DrawingVerdict =
  /**
   * `blank: true` says the compared pages are meant to be empty: both readers drawing every one
   * of them pure white is then the expected result, and without it that fails.
   */
  | { state: 'same'; blank?: true }
  /**
   * `pages` (1-based) lists the compared pages that differ; every other compared page must be the
   * same. Without it, every compared page must differ.
   */
  | { state: 'different'; reason: string; accepted: boolean; pages?: number[] }
  /** Compared with parity/baselines/<fixture>-<page>.png. */
  | { state: 'baseline'; reason: string }

export type Verdict =
  | (DrawingVerdict & Parts)
  /** Does not open in one reader, or the readers count its pages differently. */
  | { state: 'skipped'; reason: string }

/** The verdict `entry` records on `part`; `{ state: 'same' }` when it records none. */
export const partVerdict = (entry: Verdict | undefined, part: Part): PartVerdict =>
  (entry && entry.state !== 'skipped' ? entry[part] : undefined) ?? { state: 'same' }

export type ParityFile = Record<string, Verdict>

const KEYS: Record<Verdict['state'], { required: string[]; optional: string[] }> = {
  same: { required: [], optional: ['blank', ...PARTS] },
  different: { required: ['reason', 'accepted'], optional: ['pages', ...PARTS] },
  baseline: { required: ['reason'], optional: [...PARTS] },
  skipped: { required: ['reason'], optional: [] },
}

const PART_KEYS: Record<
  PartVerdict['state'],
  { required: string[]; optional: string[] }
> = {
  same: { required: [], optional: [] },
  different: { required: ['reason', 'accepted'], optional: ['pages'] },
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Checks one verdict object's keys and values against `keys`, reporting through `at`. */
function checkKeys(
  entry: Record<string, unknown>,
  { required, optional }: { required: string[]; optional: string[] },
  count: number,
  at: (what: string) => void
): void {
  for (const key of Object.keys(entry)) {
    if (key !== 'state' && !required.includes(key) && !optional.includes(key)) {
      at(`unknown key ${key}`)
    }
  }
  for (const key of required) if (!(key in entry)) at(`no ${key}`)
  if (
    'reason' in entry &&
    (typeof entry.reason !== 'string' || entry.reason.trim() === '')
  ) {
    at('reason is empty or not a string')
  }
  if ('accepted' in entry && typeof entry.accepted !== 'boolean')
    at('accepted is not a boolean')
  if ('blank' in entry && optional.includes('blank') && entry.blank !== true)
    at('blank is not true')
  if ('pages' in entry && optional.includes('pages')) {
    const pages = entry.pages
    if (
      !Array.isArray(pages) ||
      pages.length === 0 ||
      !pages.every(
        (p, i) =>
          Number.isInteger(p) && p >= 1 && p <= count && (i === 0 || p > pages[i - 1])
      )
    ) {
      at(`pages must list compared pages, 1 to ${count}, in increasing order`)
    }
  }
}

/**
 * What is wrong with `json` as a parity file, one line per problem; empty when nothing is.
 * `pagesCompared` gives how many pages the suite compares for each fixture that opens, and
 * `pageCounts` how many pages it has: links are compared on every page, so a `links` verdict's
 * `pages` may list any of them. Without `pageCounts`, links take `pagesCompared` too.
 */
export function parityProblems(
  json: unknown,
  pagesCompared: Record<string, number>,
  pageCounts: Record<string, number> = pagesCompared
): string[] {
  if (!isRecord(json)) return ['parity.json is not an object']
  const problems: string[] = []
  for (const [name, entry] of Object.entries(json)) {
    const at = (what: string) => problems.push(`${name}: ${what}`)
    if (!Object.hasOwn(pagesCompared, name)) at('not a fixture that opens')
    if (!isRecord(entry)) {
      at('not an object')
      continue
    }
    const state = entry.state
    if (typeof state !== 'string' || !Object.hasOwn(KEYS, state)) {
      at(`unknown state ${JSON.stringify(state)}`)
      continue
    }
    const count = pagesCompared[name] ?? 0
    checkKeys(entry, KEYS[state as Verdict['state']], count, at)
    for (const part of PARTS) {
      if (!(part in entry) || !KEYS[state as Verdict['state']].optional.includes(part))
        continue
      const atPart = (what: string) => at(`${part}: ${what}`)
      const value = entry[part]
      if (!isRecord(value)) {
        atPart('not an object')
        continue
      }
      const partState = value.state
      if (typeof partState !== 'string' || !Object.hasOwn(PART_KEYS, partState)) {
        atPart(`unknown state ${JSON.stringify(partState)}`)
        continue
      }
      const keys = PART_KEYS[partState as PartVerdict['state']]
      // The outline is one tree for the whole file: it has no pages to list.
      checkKeys(
        value,
        part === 'outline'
          ? { ...keys, optional: keys.optional.filter((k) => k !== 'pages') }
          : keys,
        part === 'links' ? (pageCounts[name] ?? count) : count,
        atPart
      )
    }
  }
  for (const name of Object.keys(pagesCompared)) {
    if (!Object.hasOwn(json, name)) problems.push(`${name}: no verdict recorded`)
  }
  return problems
}
