import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SCENARIOS } from '../scenarios/registry.ts'

import { FRAMEWORK_ORDER } from './frameworks.ts'
import { formatRoute, formatSearch, parseRoute, withEngine, withLang } from './route.ts'

void test('parses a route', () => {
  assert.deepEqual(parseRoute('#/vue/forms'), {
    framework: 'vue',
    scenario: 'forms',
    lang: 'en',
    engine: false,
  })
})

void test('falls back to react tour', () => {
  for (const hash of ['', '#/', '#/elm/forms', '#/vue/nope']) {
    assert.deepEqual(
      parseRoute(hash),
      { framework: 'react', scenario: 'tour', lang: 'en', engine: false },
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
        engine: false,
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
  assert.deepEqual(next, {
    framework: 'svelte',
    scenario: 'search',
    lang: 'de',
    engine: false,
  })
  assert.equal(formatRoute(next), '#/svelte/search')
})

void test('the engine draws the pages only with reader=engine', () => {
  assert.equal(parseRoute('#/vue/forms', '?reader=engine').engine, true)
  assert.equal(parseRoute('#/vue/forms', '?lang=fr&reader=engine').engine, true)
  for (const search of ['', '?reader=', '?reader=pdfjs', '?reader=ENGINE', '?debug']) {
    assert.equal(parseRoute('#/vue/forms', search).engine, false, search)
  }
})

void test('the reader parameter round-trips through the query string', () => {
  const route = parseRoute('#/react/tour', '?debug&lang=de')
  const on = formatSearch(withEngine(route, true), '?debug&lang=de')
  assert.equal(on, '?debug=&lang=de&reader=engine')
  assert.deepEqual(parseRoute('#/react/tour', on), { ...route, engine: true })
  const off = formatSearch(withEngine(route, false), on)
  assert.equal(off, '?debug=&lang=de')
  assert.deepEqual(parseRoute('#/react/tour', off), route)
})

void test('changing the reader keeps the framework, scenario and language', () => {
  const route = parseRoute('#/svelte/search', '?lang=fr')
  assert.deepEqual(withEngine(route, true), { ...route, engine: true })
})
