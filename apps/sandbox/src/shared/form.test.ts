import assert from 'node:assert/strict'
import { test } from 'node:test'

import { changedFields } from './form.ts'

void test('changedFields lists the fields whose value changed, sorted', () => {
  const before = { name: 'A', agree: 'Off', plan: 'monthly', gone: 'x' }
  const after = { name: 'B', agree: 'Yes', plan: 'monthly', added: 'y' }
  assert.deepEqual(changedFields(before, after), ['added', 'agree', 'gone', 'name'])
})

void test('changedFields is empty when nothing changed', () => {
  assert.deepEqual(changedFields({ a: 'x', b: ['1'] }, { a: 'x', b: ['1'] }), [])
})
