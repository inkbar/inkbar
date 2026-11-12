import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { DOCUMENT_NAMES } from '../../vite/documents/index.ts'
import { FRAMEWORK_ORDER } from '../shell/frameworks.ts'

import { SCENARIOS } from './registry.ts'

void test('ten scenarios in order', () => {
  assert.deepEqual(
    SCENARIOS.map((s) => s.id),
    [
      'tour',
      'tools',
      'forms',
      'redactions',
      'controlled',
      'search',
      'sidebars',
      'outline',
      'locked',
      'events',
    ]
  )
})

void test('events is registered for every framework, with its plugin', () => {
  const events = SCENARIOS.find((s) => s.id === 'events')
  assert.ok(events)
  assert.equal(events.title, 'Press and long press')
  assert.equal(
    events.blurb,
    'A plugin hears presses and long presses on the page. On a phone or tablet, pinch to zoom the document.'
  )
  assert.equal(events.document, 'letter')
  assert.deepEqual(events.extraFiles, ['src/plugin/presses.ts', 'src/plugin/presses.css'])
  for (const file of ['react.tsx', 'vue.vue', 'svelte.svelte', 'vanilla.ts'])
    assert.ok(existsSync(new URL(`./events/${file}`, import.meta.url)), file)
})

void test('locked is registered for every framework', () => {
  const locked = SCENARIOS.find((s) => s.id === 'locked')
  assert.ok(locked)
  assert.equal(locked.title, 'Open a locked file')
  assert.equal(
    locked.blurb,
    'A password-protected PDF. Inkbar asks for the password before it opens. The password is "inkbar".'
  )
  assert.equal(locked.document, 'locked')
  assert.deepEqual(locked.panels, ['events'])
  for (const file of ['react.tsx', 'vue.vue', 'svelte.svelte', 'vanilla.ts'])
    assert.ok(existsSync(new URL(`./locked/${file}`, import.meta.url)), file)
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
