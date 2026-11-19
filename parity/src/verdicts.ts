// The shape of parity.json, and the check that a file has it.

export type Verdict =
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
  /** Does not open in one reader, or the readers count its pages differently. */
  | { state: 'skipped'; reason: string }

export type ParityFile = Record<string, Verdict>

const KEYS: Record<Verdict['state'], { required: string[]; optional: string[] }> = {
  same: { required: [], optional: ['blank'] },
  different: { required: ['reason', 'accepted'], optional: ['pages'] },
  baseline: { required: ['reason'], optional: [] },
  skipped: { required: ['reason'], optional: [] },
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * What is wrong with `json` as a parity file, one line per problem; empty when nothing is.
 * `pagesCompared` gives how many pages the suite compares for each fixture that opens.
 */
export function parityProblems(
  json: unknown,
  pagesCompared: Record<string, number>
): string[] {
  if (!isRecord(json)) return ['parity.json is not an object']
  const problems: string[] = []
  for (const [name, entry] of Object.entries(json)) {
    const at = (what: string) => problems.push(`${name}: ${what}`)
    if (!(name in pagesCompared)) at('not a fixture that opens')
    if (!isRecord(entry)) {
      at('not an object')
      continue
    }
    const state = entry.state
    if (typeof state !== 'string' || !(state in KEYS)) {
      at(`unknown state ${JSON.stringify(state)}`)
      continue
    }
    const { required, optional } = KEYS[state as Verdict['state']]
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
    if ('blank' in entry && entry.blank !== true) at('blank is not true')
    if ('pages' in entry) {
      const pages = entry.pages
      const count = pagesCompared[name] ?? 0
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
  for (const name of Object.keys(pagesCompared)) {
    if (!(name in json)) problems.push(`${name}: no verdict recorded`)
  }
  return problems
}
