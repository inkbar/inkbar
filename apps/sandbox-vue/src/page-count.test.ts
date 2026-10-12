import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clampPageCount } from './page-count.ts'

void test('clampPageCount', () => {
  assert.equal(clampPageCount(null), 0)
  assert.equal(clampPageCount('1000'), 1000)
  assert.equal(clampPageCount('12.9'), 12)
  assert.equal(clampPageCount('0'), 1)
  assert.equal(clampPageCount('-5'), 1)
  assert.equal(clampPageCount('1e309'), 1)
  assert.equal(clampPageCount('abc'), 1)
  assert.equal(clampPageCount('1e6'), 5000)
})
