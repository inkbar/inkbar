import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SCENARIOS } from '../scenarios/registry.ts'

import { FRAMEWORK_ORDER } from './frameworks.ts'
import { formatRoute, parseRoute, withLang } from './route.ts'

void test('parses a route', () => {
  assert.deepEqual(parseRoute('#/vue/forms'), {
    framework: 'vue',
    scenario: 'forms',
    lang: 'en',
  })
})

void test('falls back to react tour', () => {
  for (const hash of ['', '#/', '#/elm/forms', '#/vue/nope']) {
    assert.deepEqual(
      parseRoute(hash),
      { framework: 'react', scenario: 'tour', lang: 'en' },
      hash
    )
  }
})

void test('formats and round-trips', () => {
  assert.equal(formatRoute({ framework: 'vue', scenario: 'forms' }), '#/vue/forms')
  for (const framework of FRAMEWORK_ORDER) {
    for (const { id: scenario } of SCENARIOS) {
      assert.deepEqual(parseRoute(formatRoute({ framework, scenario })), {
        framework,
        scenario,
        lang: 'en',
      })
    }
  }
})

void test('reads the language from the query string', () => {
  assert.equal(parseRoute('#/vue/forms', '?lang=de').lang, 'de')
  assert.equal(parseRoute('#/vue/forms', '?debug&lang=fr').lang, 'fr')
})

void test('an unknown or missing language is English', () => {
  for (const search of ['', '?lang=xx', '?lang=', '?lang=DE', '?debug']) {
    assert.equal(parseRoute('#/vue/forms', search).lang, 'en', search)
  }
})

void test('changing the language keeps the framework and scenario', () => {
  const route = parseRoute('#/svelte/search', '?lang=fr')
  const next = withLang(route, 'de')
  assert.deepEqual(next, { framework: 'svelte', scenario: 'search', lang: 'de' })
  assert.equal(formatRoute(next), '#/svelte/search')
})
