import assert from 'node:assert/strict'
import { test } from 'node:test'

import { highlight, langFor } from './highlight.ts'

void test('highlights with the Inkbar theme into a focusable pre', async () => {
  const html = await highlight('const answer = 42', 'ts')
  assert.match(html, /^<pre class="shiki inkbar-ink"/)
  assert.match(html, /tabindex="0"/)
  assert.match(html, /answer/)
})

void test('maps the four source file types to languages', () => {
  assert.equal(langFor('src/react/Demo.tsx'), 'tsx')
  assert.equal(langFor('src/vue/Demo.vue'), 'vue')
  assert.equal(langFor('src/svelte/Demo.svelte'), 'svelte')
  assert.equal(langFor('src/vanilla/Demo.ts'), 'ts')
  assert.throws(() => langFor('src/styles/demo.css'), /No highlighter language/)
})
