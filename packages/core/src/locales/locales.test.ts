import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { de } from './de'
import { en } from './en'
import { fr } from './fr'

import type { InkMessages } from '../messages'

type Source = { text?: string; param?: string; forms?: Record<string, string> }
type Fn = ((p: Record<string, string | number>) => string) & { source: Source }

const shipped = { fr, de } as const

/** Every `group.key` with its value, leaving out the top-level `lang`. */
function entries(m: InkMessages): [string, unknown][] {
  const out: [string, unknown][] = []
  for (const [group, keys] of Object.entries(m)) {
    if (group === 'lang') continue
    for (const [key, value] of Object.entries(keys as Record<string, unknown>)) {
      out.push([`${group}.${key}`, value])
    }
  }
  return out
}

/** The English a translation is made from: the string, the template text, or the forms. */
function sourceOf(value: unknown): string {
  if (typeof value === 'string') return value
  const { source } = value as Fn
  return source.text ?? JSON.stringify(source.forms)
}

/** Params that take a name get a word; the rest get the number. */
const NAMES = ['name', 'author', 'label', 'badge', 'kind']

describe.each(Object.entries(shipped))('%s', (lang, messages) => {
  it('names its language', () => {
    expect(messages.lang).toBe(lang)
  })

  it("has exactly English's groups and keys", () => {
    const keys = (m: InkMessages) =>
      entries(m)
        .map(([k]) => k)
        .sort()
    expect(keys(messages)).toEqual(keys(en))
  })

  it('renders every function with its numbers formatted for the language', () => {
    const nf = new Intl.NumberFormat(lang)
    let checked = 0
    for (const [path, value] of entries(messages)) {
      if (typeof value === 'string') {
        expect(value.trim(), path).not.toBe('')
        continue
      }
      const fn = value as Fn
      expect(typeof fn, path).toBe('function')
      const text = fn.source.text ?? Object.values(fn.source.forms!).join(' ')
      const names = new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))
      for (const n of [0, 1, 2, 1000]) {
        const params: Record<string, string | number> = {}
        for (const name of names) params[name] = NAMES.includes(name) ? 'Ann' : n
        const out = fn(params)
        expect(out, path).not.toContain('{')
        for (const v of Object.values(params)) {
          expect(out, path).toContain(typeof v === 'number' ? nf.format(v) : v)
        }
      }
      checked++
    }
    expect(checked).toBeGreaterThan(10)
  })

  it('no translation is stale', () => {
    const file = new URL(`./${lang}.sources.json`, import.meta.url)
    const recorded = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
    const stale = entries(en)
      .filter(([path, value]) => recorded[path] !== sourceOf(value))
      .map(([path]) => path)
    expect(
      stale,
      `The English changed for ${stale.join(', ')}. Run \`pnpm translate --lang ${lang}\` ` +
        `to draft new text, update ${lang}.ts, then \`pnpm translate --accept ${lang} <key>…\`.`
    ).toEqual([])
  })
})

describe('number formats', () => {
  it('groups thousands the way each language does', () => {
    expect(fr.search.resultCount({ count: 1000 })).toBe('1 000 résultats')
    expect(de.search.resultCount({ count: 1000 })).toBe('1.000 Ergebnisse')
  })

  it('picks the plural form for the language', () => {
    expect(fr.search.resultCount({ count: 0 })).toBe('0 résultat')
    expect(fr.search.resultCount({ count: 1 })).toBe('1 résultat')
    expect(de.search.resultCount({ count: 1 })).toBe('1 Ergebnis')
    expect(de.search.resultCount({ count: 0 })).toBe('0 Ergebnisse')
  })
})

describe('en', () => {
  it('names its language', () => {
    expect(en.lang).toBe('en')
  })
})
