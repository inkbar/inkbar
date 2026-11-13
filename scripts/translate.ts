/*
 * Drafts and checks Inkbar's shipped translations with DeepL. Local only: never run in CI.
 *
 *   pnpm translate [--lang fr,de] [--out <dir>]   drafts missing and stale keys
 *   pnpm translate --compare [--lang …] [--out …] compares every key with DeepL
 *   pnpm translate --accept <lang> <key>… | --all  records today's English for those keys
 *
 * Reads the built locales in packages/core/dist/locales, building core first when they are
 * missing or older than the sources. Writes only outside the repo, apart from `--accept`,
 * which rewrites packages/core/src/locales/<lang>.sources.json.
 *
 * The key comes from DEEPL_AUTH_KEY, else DEEPL_API_KEY. It is never printed.
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

type Source = { text?: string; param?: string; forms?: Record<string, string> }
type Messages = Record<string, unknown>

/** The repository root. */
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CORE = join(REPO, 'packages', 'core')
const DIST = join(CORE, 'dist', 'locales')
const SRC = join(CORE, 'src', 'locales')
const CONTEXT = 'UI label in a PDF viewer'
const LANGS = ['fr', 'de']

// ---------------------------------------------------------------------------------------------
// Pure helpers

/** `{name}` placeholders as XML tags, so DeepL moves them with the words around them. */
export function toTagged(text: string): string {
  return text.replace(/\{(\w+)\}/g, '<x id="$1"/>')
}

/** DeepL's tagged text back to `{name}` placeholders. */
export function fromTagged(text: string): string {
  return text
    .replace(/<x\s+id="(\w+)"\s*\/>/g, '{$1}')
    .replace(/<x\s+id="(\w+)"\s*><\/x>/g, '{$1}')
}

const normal = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/’/g, "'")

/** Equal after trimming, lower-casing, collapsing whitespace and mapping ’ to '. */
export function agrees(a: string, b: string): boolean {
  return normal(a) === normal(b)
}

/** Free keys end in `:fx` and use their own host. */
export function hostFor(key: string): string {
  return key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com'
}

/** The real path of `path`, or of its nearest ancestor that exists. */
function real(path: string): string {
  const abs = resolve(path)
  let dir = abs
  while (!existsSync(dir)) {
    const up = dirname(dir)
    if (up === dir) return abs
    dir = up
  }
  return join(realpathSync(dir), relative(dir, abs))
}

/** True when `path` is not the repo or anything under it. */
export function outsideRepo(path: string, repo = REPO): boolean {
  const p = real(path)
  const r = real(repo)
  return p !== r && !p.startsWith(r + sep)
}

/** Every `group.key` of a message set with its value, leaving out `lang`. */
function entries(messages: Messages): [string, string, unknown][] {
  const out: [string, string, unknown][] = []
  for (const [group, keys] of Object.entries(messages)) {
    if (group === 'lang' || typeof keys !== 'object' || keys === null) continue
    for (const [key, value] of Object.entries(keys)) out.push([group, key, value])
  }
  return out
}

function sourceObject(value: unknown): Source | undefined {
  return typeof value === 'function' ? (value as { source?: Source }).source : undefined
}

/** The English a translation is made from: the string, the template text, or the forms. */
function sourceText(value: unknown): string {
  if (typeof value === 'string') return value
  const source = sourceObject(value)
  if (source?.text !== undefined) return source.text
  if (source?.forms) return JSON.stringify(source.forms)
  throw new Error('a message function without a source')
}

/** `{ "group.key": English source }` for every key of `messages`. */
export function sourcesOf(messages: Messages): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [group, key, value] of entries(messages))
    out[`${group}.${key}`] = sourceText(value)
  return out
}

/** Keys whose English changed since the translation was recorded, or that were never recorded. */
export function staleKeys(en: Messages, recorded: Record<string, string>): string[] {
  return Object.entries(sourcesOf(en))
    .filter(([path, text]) => recorded[path] !== text)
    .map(([path]) => path)
}

function readJson(path: string): Record<string, string> {
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>)
    : {}
}

function writeSources(path: string, sources: Record<string, string>): void {
  const sorted = Object.fromEntries(
    Object.entries(sources).sort(([a], [b]) => (a < b ? -1 : 1))
  )
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`)
}

/**
 * Records today's English for `keys` (or every key) in the sources file at `file`, leaving the
 * other entries as they are. Throws, writing nothing, for a key English does not have.
 */
export function acceptKeys(file: string, en: Messages, keys: string[] | 'all'): void {
  const current = sourcesOf(en)
  if (keys === 'all') return writeSources(file, current)
  const unknown = keys.filter((k) => !Object.hasOwn(current, k))
  if (unknown.length) throw new Error(`Not a key in English: ${unknown.join(', ')}`)
  const recorded = readJson(file)
  for (const k of keys) recorded[k] = current[k]!
  writeSources(file, recorded)
}

// ---------------------------------------------------------------------------------------------
// DeepL

type Job = { group: string; text: string }

/** Sends `texts` (tagged) for one group in batches of 50; returns the translations untagged. */
async function deepl(
  key: string,
  lang: string,
  group: string,
  texts: string[]
): Promise<string[]> {
  const out: string[] = []
  for (let i = 0; i < texts.length; i += 50) {
    const body = {
      text: texts.slice(i, i + 50).map(toTagged),
      source_lang: 'EN',
      target_lang: lang.toUpperCase(),
      tag_handling: 'xml',
      context: `${CONTEXT}, in the "${group}" group`,
      formality: 'prefer_more',
    }
    let res: Response
    try {
      res = await fetch(`https://${hostFor(key)}/v2/translate`, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch {
      throw new Error('DeepL request failed: no response')
    }
    if (!res.ok) throw new Error(`DeepL request failed: HTTP ${res.status}`)
    const json = (await res.json()) as { translations: { text: string }[] }
    out.push(...json.translations.map((t) => fromTagged(t.text)))
  }
  return out
}

/** Translates every job, one request per group, in the order given. */
async function translateAll(key: string, lang: string, jobs: Job[]): Promise<string[]> {
  const out: string[] = new Array<string>(jobs.length)
  const byGroup = new Map<string, number[]>()
  jobs.forEach((j, i) => byGroup.set(j.group, [...(byGroup.get(j.group) ?? []), i]))
  for (const [group, indexes] of byGroup) {
    const texts = await deepl(
      key,
      lang,
      group,
      indexes.map((i) => jobs[i]!.text)
    )
    indexes.forEach((i, n) => (out[i] = texts[n]!))
  }
  return out
}

/** A count for each plural category of `lang`, to fill a form in before it goes to DeepL. */
function representatives(lang: string): Map<string, number> {
  const rules = new Intl.PluralRules(lang)
  const out = new Map<string, number>()
  for (const n of [1, 5, 2, 3, 0, 11, 21, 1_000_000]) {
    const c = rules.select(n)
    if (!out.has(c)) out.set(c, n)
  }
  return out
}

/** One row per string to translate: plain text, a template, or one plural form. */
type Item = {
  path: string
  form?: string
  english: string
  count?: number
  param?: string
}

/** What to send for `en`: plural forms per category of `lang`, each filled with its count. */
function itemsFor(en: Messages, lang: string, paths?: Set<string>): Item[] {
  const items: Item[] = []
  const enRules = new Intl.PluralRules('en')
  for (const [group, key, value] of entries(en)) {
    const path = `${group}.${key}`
    if (paths && !paths.has(path)) continue
    const source = sourceObject(value)
    if (source?.forms && source.param) {
      for (const [category, n] of representatives(lang)) {
        const form = source.forms[enRules.select(n)] ?? source.forms.other!
        const english = form.replaceAll(`{${source.param}}`, String(n))
        items.push({ path, form: category, english, count: n, param: source.param })
      }
    } else {
      items.push({ path, english: sourceText(value) })
    }
  }
  return items
}

/** DeepL's text with the representative count turned back into its placeholder. */
function unfill(item: Item, text: string): string {
  if (item.count === undefined || !item.param) return text
  const digits = String(item.count)
  return text.replace(/\d[\d\s.,]*\d|\d/g, (m) =>
    m.replace(/\D/g, '') === digits ? `{${item.param}}` : m
  )
}

/** The current value of an item in a locale: the string, template text, or plural form. */
function currentOf(messages: Messages | undefined, item: Item): string | undefined {
  if (!messages) return undefined
  const [group, key] = item.path.split(/\.(.*)/s) as [string, string]
  const value = (messages[group] as Record<string, unknown> | undefined)?.[key]
  if (value === undefined) return undefined
  const source = sourceObject(value)
  if (item.form !== undefined) return source?.forms?.[item.form] ?? source?.forms?.other
  return sourceText(value)
}

// ---------------------------------------------------------------------------------------------
// Files

/** Builds core when a locale's dist file is missing or older than its sources. */
function ensureBuilt(langs: string[]): void {
  const newest = Math.max(
    ...[SRC, join(CORE, 'src', 'messages')].flatMap((dir) =>
      readdirSync(dir)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
        .map((f) => statSync(join(dir, f)).mtimeMs)
    )
  )
  const stale = ['en', ...langs].some((l) => {
    if (!existsSync(join(SRC, `${l}.ts`))) return false
    const built = join(DIST, `${l}.mjs`)
    return !existsSync(built) || statSync(built).mtimeMs < newest
  })
  if (!stale) return
  console.log('Building @inkbar/core…')
  execFileSync('pnpm', ['--filter', '@inkbar/core', 'build'], {
    cwd: REPO,
    stdio: 'inherit',
  })
}

async function load(lang: string): Promise<Messages | undefined> {
  const file = join(DIST, `${lang}.mjs`)
  if (!existsSync(file)) return undefined
  const mod = (await import(pathToFileURL(file).href)) as Record<string, Messages>
  return mod[lang]
}

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const cell = (s: string | undefined) =>
  (s ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** Ready-to-paste source for one key, from DeepL's text for each of its items. */
function draftLine(
  lang: string,
  en: Messages,
  path: string,
  texts: Map<string, string>
): string {
  const [group, key] = path.split(/\.(.*)/s) as [string, string]
  const value = (en[group] as Record<string, unknown>)[key]
  const name = /^\w+$/.test(key) ? key : q(key)
  const source = sourceObject(value)
  if (source?.forms && source.param) {
    const forms = [...representatives(lang).keys()]
      .map((c) => `${c}: ${q(texts.get(`${path}#${c}`) ?? '')}`)
      .join(', ')
    return `    ${name}: plural(${q(lang)}, ${q(source.param)}, { ${forms} }),`
  }
  const text = texts.get(path) ?? ''
  return typeof value === 'string'
    ? `    ${name}: ${q(text)},`
    : `    ${name}: template(${q(lang)}, ${q(text)}),`
}

// ---------------------------------------------------------------------------------------------
// Commands

async function draft(
  key: string,
  lang: string,
  en: Messages,
  out: string
): Promise<void> {
  const messages = await load(lang)
  const have = new Set(messages ? Object.keys(sourcesOf(messages)) : [])
  const all = Object.keys(sourcesOf(en))
  const missing = all.filter((p) => !have.has(p))
  const recorded = readJson(join(SRC, `${lang}.sources.json`))
  const stale = staleKeys(en, recorded).filter((p) => have.has(p))
  const items = itemsFor(en, lang, new Set([...missing, ...stale]))
  const texts = await translateAll(
    key,
    lang,
    items.map((i) => ({ group: i.path.split('.')[0]!, text: i.english }))
  )
  const byPath = new Map(
    items.map((it, n) => [
      it.form ? `${it.path}#${it.form}` : it.path,
      unfill(it, texts[n]!),
    ])
  )
  const lines = [
    `// Drafts for ${lang}. Check each, paste it into packages/core/src/locales/${lang}.ts,`,
  ]
  lines.push(`// then run \`pnpm translate --accept ${lang} <key>…\`.`, '')
  lines.push(`// Missing (${missing.length})`)
  // Grouped as in the locale file, so a whole new language pastes in as one object.
  let group = ''
  for (const p of missing) {
    const g = p.split('.')[0]!
    if (g !== group) {
      if (group) lines.push('  },')
      lines.push(`  ${/^\w+$/.test(g) ? g : q(g)}: {`)
      group = g
    }
    lines.push(draftLine(lang, en, p, byPath))
  }
  if (group) lines.push('  },')
  lines.push(
    '',
    `// Stale: the English changed since the translation was made (${stale.length})`
  )
  for (const p of stale) {
    lines.push(`    // ${p}: was ${JSON.stringify(recorded[p] ?? null)}`)
    lines.push(`    //   now ${JSON.stringify(sourcesOf(en)[p])}`)
    lines.push(draftLine(lang, en, p, byPath))
  }
  const file = join(out, `${lang}-missing.ts`)
  writeFileSync(file, `${lines.join('\n')}\n`)
  console.log(`${lang}: ${missing.length} missing, ${stale.length} stale -> ${file}`)
}

async function compare(
  key: string,
  lang: string,
  en: Messages,
  out: string
): Promise<void> {
  const messages = await load(lang)
  const items = itemsFor(en, lang)
  const texts = await translateAll(
    key,
    lang,
    items.map((i) => ({ group: i.path.split('.')[0]!, text: i.english }))
  )
  let agree = 0
  const rows = items.map((item, n) => {
    const ours = currentOf(messages, item)
    const theirs = unfill(item, texts[n]!)
    const same = ours !== undefined && agrees(ours, theirs)
    if (same) agree++
    const name = item.form ? `${item.path} [${item.form}]` : item.path
    const english = item.form
      ? currentOf(en, { ...item, form: enForm(item) })
      : item.english
    return `| ${cell(name)} | ${cell(english)} | ${cell(ours)} | ${cell(theirs)} | ${same ? 'agree' : 'differs'} |`
  })
  const head = [
    `# ${lang}: shipped text against DeepL`,
    '',
    `${agree} agree, ${items.length - agree} differ.`,
    '',
    '| Key | English | Current | DeepL | |',
    '| --- | --- | --- | --- | --- |',
  ]
  const file = join(out, `${lang}-compare.md`)
  writeFileSync(file, `${[...head, ...rows].join('\n')}\n`)
  console.log(`${lang}: ${agree} agree, ${items.length - agree} differ -> ${file}`)
}

/** The English plural form a target-language item was filled from. */
function enForm(item: Item): string {
  return new Intl.PluralRules('en').select(item.count ?? 0)
}

function usage(): never {
  console.error(
    'Usage: pnpm translate [--compare] [--lang fr,de] [--out <dir>]\n' +
      '       pnpm translate --accept <lang> <key>… | --all'
  )
  process.exit(1)
}

async function main(argv: string[]): Promise<void> {
  if (argv[0] === '--accept') {
    const [, lang, ...keys] = argv
    if (!lang || !keys.length) usage()
    ensureBuilt([lang])
    const en = await load('en')
    if (!en)
      throw new Error('packages/core/dist/locales/en.mjs is missing after the build')
    const file = join(SRC, `${lang}.sources.json`)
    acceptKeys(file, en, keys.includes('--all') ? 'all' : keys)
    console.log(
      `Recorded the English for ${keys.includes('--all') ? 'every key' : keys.join(', ')} in ${relative(REPO, file)}`
    )
    return
  }

  let mode: 'draft' | 'compare' = 'draft'
  let langs = LANGS
  let out = join(tmpdir(), 'inkbar-translate')
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--compare') mode = 'compare'
    else if (arg === '--lang' && argv[i + 1])
      langs = argv[++i]!.split(',').filter(Boolean)
    else if (arg === '--out' && argv[i + 1]) out = resolve(argv[++i]!)
    else usage()
  }
  if (!outsideRepo(out)) {
    console.error(
      `Refusing to write inside the repo: ${out}. Pass --out with a path outside it.`
    )
    process.exit(1)
  }
  const key = process.env.DEEPL_AUTH_KEY ?? process.env.DEEPL_API_KEY
  if (!key) {
    console.error('Set DEEPL_AUTH_KEY (or DEEPL_API_KEY) to a DeepL API key.')
    process.exit(1)
  }
  ensureBuilt(langs)
  const en = await load('en')
  if (!en) throw new Error('packages/core/dist/locales/en.mjs is missing after the build')
  mkdirSync(out, { recursive: true })
  for (const lang of langs) {
    await (mode === 'compare' ? compare : draft)(key, lang, en, out)
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    // Our own errors carry no key: HTTP failures name only the status.
    console.error(e instanceof Error ? e.message : 'translate failed')
    process.exit(1)
  })
}
