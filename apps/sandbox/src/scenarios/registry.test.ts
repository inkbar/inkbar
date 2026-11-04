import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DOCUMENT_NAMES } from '../../vite/documents/index.ts'

import { SCENARIOS } from './registry.ts'

void test('six scenarios in order', () => {
  assert.deepEqual(
    SCENARIOS.map((s) => s.id),
    ['tour', 'tools', 'forms', 'redactions', 'controlled', 'search']
  )
})

void test('every scenario names a document', () => {
  for (const s of SCENARIOS)
    assert.ok((DOCUMENT_NAMES as readonly string[]).includes(s.document), s.id)
})

void test('only forms has a values panel', () => {
  for (const s of SCENARIOS) {
    assert.deepEqual(s.panels, s.id === 'forms' ? ['events', 'values'] : ['events'], s.id)
  }
  assert.deepEqual(SCENARIOS.find((s) => s.id === 'redactions')?.extraFiles, [
    'src/plugin/suggestions.ts',
  ])
})
