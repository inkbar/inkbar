import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SCENARIOS } from '../scenarios/registry.ts'

import { FRAMEWORK_ORDER } from './frameworks.ts'
import { formatRoute, parseRoute } from './route.ts'

void test('parses a route', () => {
  assert.deepEqual(parseRoute('#/vue/forms'), { framework: 'vue', scenario: 'forms' })
})

void test('falls back to react tour', () => {
  for (const hash of ['', '#/', '#/elm/forms', '#/vue/nope']) {
    assert.deepEqual(parseRoute(hash), { framework: 'react', scenario: 'tour' }, hash)
  }
})

void test('formats and round-trips', () => {
  assert.equal(formatRoute({ framework: 'vue', scenario: 'forms' }), '#/vue/forms')
  for (const framework of FRAMEWORK_ORDER) {
    for (const { id: scenario } of SCENARIOS) {
      assert.deepEqual(parseRoute(formatRoute({ framework, scenario })), {
        framework,
        scenario,
      })
    }
  }
})
