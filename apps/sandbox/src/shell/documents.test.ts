import assert from 'node:assert/strict'
import { test } from 'node:test'

import { documentSource } from './documents.ts'

void test('document source respects the base', () => {
  assert.deepEqual(documentSource('form', '/sandbox/'), {
    url: '/sandbox/documents/form.pdf',
    key: 'form',
  })
})
