/*
 * Drafts the sandbox's French and German words with DeepL, with the settings
 * `scripts/translate.ts` uses for Inkbar's own: formality "prefer_more", a context sentence,
 * and `{name}` placeholders sent as tags so they move with the words around them.
 *
 *   node scripts/draft-strings.ts <out.json> [key…]
 *
 * Writes `{ "<key>": { "fr": …, "de": … } }` for every key of the English set, or only the keys
 * named, so the drafts can be read before they go into `src/shared/strings/fr.ts` and `de.ts`.
 * A plural is drafted form by form, under `<key>.<form>`. The key comes from DEEPL_AUTH_KEY,
 * else DEEPL_API_KEY, and is never printed.
 */
import { writeFileSync } from 'node:fs'

import { en } from '../src/shared/strings/en.ts'

const CONTEXT = 'UI label in a demo page for a PDF viewer aimed at software developers'

type Source = { text?: string; forms?: Record<string, string> }

/** Every `a.b.c` key of `value` with its English: a string, a template's text, a plural's forms. */
function flatten(value: unknown, prefix: string, out: Record<string, string>): void {
  if (typeof value === 'string') out[prefix] = value
  else if (typeof value === 'function') {
    const source = (value as { source?: Source }).source
    if (source?.text !== undefined) out[prefix] = source.text
    else if (source?.forms)
      for (const [form, text] of Object.entries(source.forms))
        out[`${prefix}.${form}`] = text
    else throw new Error(`${prefix} is a function without a source`)
  } else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value))
      flatten(v, prefix ? `${prefix}.${k}` : k, out)
}

const toTagged = (text: string) => text.replace(/\{(\w+)\}/g, '<x id="$1"/>')
const fromTagged = (text: string) =>
  text.replace(/<x\s+id="(\w+)"\s*(\/>|><\/x>)/g, '{$1}')

async function translate(key: string, lang: string, texts: string[]): Promise<string[]> {
  const host = key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com'
  const res = await fetch(`https://${host}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: texts.map(toTagged),
      source_lang: 'EN',
      target_lang: lang.toUpperCase(),
      tag_handling: 'xml',
      context: CONTEXT,
      formality: 'prefer_more',
    }),
  })
  if (!res.ok) throw new Error(`DeepL request failed: HTTP ${res.status}`)
  const json = (await res.json()) as { translations: { text: string }[] }
  return json.translations.map((t) => fromTagged(t.text))
}

const [out, ...only] = process.argv.slice(2)
if (!out) throw new Error('Usage: node scripts/draft-strings.ts <out.json> [key…]')
const key = process.env['DEEPL_AUTH_KEY'] ?? process.env['DEEPL_API_KEY']
if (!key) throw new Error('Set DEEPL_AUTH_KEY or DEEPL_API_KEY.')

const all: Record<string, string> = {}
flatten({ ...en, lang: undefined }, '', all)
const keys = Object.keys(all).filter((k) => only.length === 0 || only.includes(k))
const drafts: Record<string, Record<string, string>> = {}
for (const k of keys) drafts[k] = { en: all[k]! }
for (const lang of ['fr', 'de']) {
  const texts = await translate(
    key,
    lang,
    keys.map((k) => all[k]!)
  )
  keys.forEach((k, i) => (drafts[k]![lang] = texts[i]!))
}
writeFileSync(out, `${JSON.stringify(drafts, null, 2)}\n`)
console.log(`Drafted ${keys.length} keys into ${out}.`)
