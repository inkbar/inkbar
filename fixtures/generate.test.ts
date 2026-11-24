import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const scratchRoot = join(here, '.tmp')

const SECONDARY = [
  'generate-links.ts',
  'generate-redaction.ts',
  'generate-scripts.ts',
  'generate-unembedded.ts',
]

/** A scratch copy of the committed pdf/ and manifest.json, for generators to write into. */
function scratchCopy(label: string): string {
  const dir = join(scratchRoot, label)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  cpSync(join(here, 'pdf'), join(dir, 'pdf'), { recursive: true })
  cpSync(join(here, 'manifest.json'), join(dir, 'manifest.json'))
  return dir
}

function run(script: string, dir: string) {
  // As the package's own scripts do: `tsx <script>`, run from the package directory.
  execFileSync('pnpm', ['exec', 'tsx', script], {
    cwd: here,
    env: { ...process.env, INKBAR_FIXTURES_OUT: dir },
    stdio: 'pipe',
  })
}

/** What differs between the scratch copy and the committed fixtures, as readable lines. */
function differences(dir: string): string[] {
  const found: string[] = []
  const committed = readdirSync(join(here, 'pdf')).sort()
  const written = readdirSync(join(dir, 'pdf')).sort()
  for (const name of new Set([...committed, ...written])) {
    if (!committed.includes(name)) found.push(`extra file ${name}`)
    else if (!written.includes(name)) found.push(`missing file ${name}`)
    else if (
      !readFileSync(join(here, 'pdf', name)).equals(readFileSync(join(dir, 'pdf', name)))
    )
      found.push(`bytes differ ${name}`)
  }
  const want = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8')) as Record<
    string,
    unknown
  >
  const got = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<
    string,
    unknown
  >
  for (const key of new Set([...Object.keys(want), ...Object.keys(got)])) {
    if (!(key in got)) found.push(`manifest lacks ${key}`)
    else if (!(key in want)) found.push(`manifest adds ${key}`)
    else if (JSON.stringify(want[key]) !== JSON.stringify(got[key]))
      found.push(`manifest entry differs ${key}`)
  }
  if (JSON.stringify(Object.keys(want)) !== JSON.stringify(Object.keys(got)))
    found.push('manifest entry order differs')
  if (
    readFileSync(join(here, 'manifest.json'), 'utf8') !==
    readFileSync(join(dir, 'manifest.json'), 'utf8')
  )
    found.push('manifest text differs')
  return found
}

// Each generator is its own process, and one test runs nine of them. On a busy CI runner
// that takes about thirty seconds, so these tests get more than the package's default.
describe('regenerating the fixtures', { timeout: 180_000 }, () => {
  beforeAll(() => rmSync(scratchRoot, { recursive: true, force: true }))
  afterAll(() => rmSync(scratchRoot, { recursive: true, force: true }))

  it('leaves every committed file and manifest entry as it was', () => {
    const dir = scratchCopy('all')
    run('generate.ts', dir)
    expect(differences(dir)).toEqual([])
  })

  it('does the same when the other generators run first, or run again after', () => {
    const dir = scratchCopy('order')
    for (const script of [...SECONDARY].reverse()) run(script, dir)
    expect(differences(dir)).toEqual([])
    run('generate.ts', dir)
    expect(differences(dir)).toEqual([])
    for (const script of SECONDARY) run(script, dir)
    expect(differences(dir)).toEqual([])
  })

  it('writes the whole manifest into a directory that has none', () => {
    const dir = scratchCopy('bare')
    rmSync(join(dir, 'manifest.json'))
    for (const script of ['generate.ts', ...SECONDARY]) run(script, dir)
    const got = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<
      string,
      unknown
    >
    const want = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8')) as Record<
      string,
      unknown
    >
    // Entries other scripts own (saved and corpus files) are not this suite's to write.
    const owned = Object.keys(want).filter(
      (key) => !key.startsWith('saved-') && !key.startsWith('corpus-')
    )
    for (const key of owned) expect(got[key]).toEqual(want[key])
    // The committed order is the order entries were added over time, so no run reproduces it;
    // what must hold is that the same run always gives the same order.
    const again = scratchCopy('bare-again')
    rmSync(join(again, 'manifest.json'))
    for (const script of ['generate.ts', ...SECONDARY]) run(script, again)
    expect(readFileSync(join(again, 'manifest.json'), 'utf8')).toBe(
      readFileSync(join(dir, 'manifest.json'), 'utf8')
    )
  })
})

describe('the committed fixtures and the manifest', () => {
  type Entry = { file: string; source?: unknown }
  const entries = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8')) as Record<
    string,
    Entry
  >

  it('has a file for every entry', () => {
    // corpus-* entries name a file in corpus/; every other entry, saved-* included, is
    // pdf/<key>.pdf.
    for (const [key, entry] of Object.entries(entries)) {
      const path = key.startsWith('corpus-')
        ? join(here, 'corpus', entry.file)
        : join(here, 'pdf', `${key}.pdf`)
      expect(existsSync(path), `${key} has no file`).toBe(true)
    }
  })

  it('has an entry for every file', () => {
    const files = new Set(Object.values(entries).map((entry) => entry.file))
    const bare = readdirSync(join(here, 'pdf')).filter((name) => {
      // saved-<name>.annotations.json sits beside saved-<name>.pdf and has no entry of its own.
      if (/^saved-.+\.annotations\.json$/.test(name))
        return !(`${name.replace(/\.annotations\.json$/, '')}` in entries)
      return !files.has(name)
    })
    expect(bare).toEqual([])
    const bareCorpus = readdirSync(join(here, 'corpus')).filter(
      (name) => name.endsWith('.pdf') && !files.has(name)
    )
    expect(bareCorpus).toEqual([])
  })
})
