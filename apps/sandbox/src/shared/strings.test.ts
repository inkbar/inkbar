import assert from 'node:assert/strict'
import { test } from 'node:test'

import { de } from './strings/de.ts'
import { en } from './strings/en.ts'
import { fr } from './strings/fr.ts'

type Source = { text?: string; forms?: Record<string, string> }

/** Every `a.b.c` key of a set with its text: a string, a template's text or a plural's forms. */
function flatten(value: unknown, prefix = '', out = new Map<string, string[]>()) {
  if (typeof value === 'string') out.set(prefix, [value])
  else if (typeof value === 'function') {
    const source = (value as { source?: Source }).source
    const texts =
      source?.text !== undefined ? [source.text] : Object.values(source?.forms ?? {})
    out.set(prefix, texts)
  } else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value))
      flatten(v, prefix ? `${prefix}.${k}` : k, out)
  return out
}

const placeholders = (texts: string[]) =>
  [
    ...new Set(texts.flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))),
  ].sort()

const english = flatten(en)

for (const [name, set] of [
  ['fr', fr],
  ['de', de],
] as const) {
  void test(`${name} has exactly the keys of English`, () => {
    assert.deepEqual([...flatten(set).keys()].sort(), [...english.keys()].sort())
  })

  void test(`${name} has no empty text`, () => {
    for (const [key, texts] of flatten(set)) {
      assert.ok(texts.length > 0, key)
      for (const text of texts) assert.ok(text.trim().length > 0, key)
    }
  })

  void test(`${name} keeps each key's placeholders`, () => {
    const own = flatten(set)
    for (const [key, texts] of english)
      assert.deepEqual(placeholders(own.get(key) ?? []), placeholders(texts), key)
  })

  void test(`${name} names its language`, () => {
    assert.equal(set.lang, name)
  })
}

void test('French and German count with their own plural rules', () => {
  assert.equal(en.shell.eventCount({ count: 0 }), '0 events')
  assert.equal(fr.shell.eventCount({ count: 0 }), '0 événement')
  assert.equal(fr.shell.eventCount({ count: 2 }), '2 événements')
  assert.equal(de.shell.eventCount({ count: 1 }), '1 Ereignis')
  assert.equal(de.labels.plugin.found({ count: 0 }), '0 Vorschläge')
  assert.equal(fr.labels.plugin.found({ count: 1 }), '1 suggestion')
})
