import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { DOCUMENT_NAMES } from '../../vite/documents/index.ts'
import { FRAMEWORK_ORDER } from '../shell/frameworks.ts'

import { SCENARIOS } from './registry.ts'

void test('seven scenarios in order', () => {
  assert.deepEqual(
    SCENARIOS.map((s) => s.id),
    ['tour', 'tools', 'forms', 'redactions', 'controlled', 'search', 'sidebars']
  )
})

void test('sidebars is registered for every framework', () => {
  const sidebars = SCENARIOS.find((s) => s.id === 'sidebars')
  assert.ok(sidebars)
  assert.equal(sidebars.title, 'Sidebars')
  assert.equal(
    sidebars.blurb,
    'Thumbnails, search and a panel of your own in a rail, tabs or a stack, on either side.'
  )
  assert.equal(sidebars.document, 'tour')
  const file = {
    react: 'react.tsx',
    vue: 'vue.vue',
    svelte: 'svelte.svelte',
    vanilla: 'vanilla.ts',
  }
  for (const framework of FRAMEWORK_ORDER)
    assert.ok(
      existsSync(new URL(`./sidebars/${file[framework]}`, import.meta.url)),
      framework
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
    'src/plugin/suggestions.css',
  ])
})

void test('the component files show in their scenarios', () => {
  const files = (id: string) => SCENARIOS.find((s) => s.id === id)?.frameworkFiles
  assert.deepEqual(files('redactions'), {
    vue: ['src/scenarios/redactions/ReviewSidebar.vue'],
    svelte: [
      'src/scenarios/redactions/ReviewSidebar.svelte',
      'src/scenarios/redactions/CommandLog.svelte',
    ],
  })
  assert.deepEqual(files('search'), {
    vue: ['src/scenarios/search/ResultsSidebar.vue'],
    svelte: [
      'src/scenarios/search/ResultsSidebar.svelte',
      'src/scenarios/search/SearchLog.svelte',
    ],
  })
  for (const s of SCENARIOS)
    if (s.id !== 'redactions' && s.id !== 'search')
      assert.equal(s.frameworkFiles, undefined, s.id)
})

void test('no scenario carries a per-framework note', () => {
  for (const s of SCENARIOS) assert.equal(s.notes, undefined, s.id)
})
