import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatPayload, formatTime } from './events.ts'

void test('a string payload shows as it is', () => {
  assert.equal(formatPayload('draw'), 'draw')
})

void test('any other payload shows as JSON', () => {
  assert.equal(formatPayload({ pages: 4 }), '{"pages":4}')
  assert.equal(formatPayload(3), '3')
  assert.equal(formatPayload(undefined), 'undefined')
})

void test('a long payload is cut to 300 characters', () => {
  const text = formatPayload('x'.repeat(500))
  assert.equal(text.length, 300)
  assert.ok(text.endsWith('…'))
})

void test('a payload JSON cannot write still shows', () => {
  const loop: { self?: unknown } = {}
  loop.self = loop
  assert.equal(formatPayload(loop), '[object Object]')
})

void test('times are HH:MM:SS', () => {
  assert.equal(formatTime(new Date(2026, 10, 4, 9, 5, 7)), '09:05:07')
})
