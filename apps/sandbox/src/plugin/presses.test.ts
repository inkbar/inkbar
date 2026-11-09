import assert from 'node:assert/strict'
import { test } from 'node:test'

import { writable, type InkDocument } from '@inkbar/core'
import { createPluginHost } from '@inkbar/core/dom'

import { pressesPlugin } from './presses.ts'

/** The plugin in a real host, as a viewer runs it, with what it logs. */
function setUp() {
  const logged: [string, unknown][] = []
  const document = writable<InkDocument | null>(null)
  const host = createPluginHost({
    plugins: [pressesPlugin({ log: (name, payload) => logged.push([name, payload]) })],
    document,
    history: () => document.get()!.history,
    activated: writable<string | null>(null),
    setActivated() {},
    root: writable<HTMLElement | null>(null),
  })
  return { host, logged }
}

void test('rounds the logged point to one decimal', () => {
  const { host, logged } = setUp()
  host.emitPress('press', {
    page: 2,
    point: { x: 72.04999, y: 300.96 },
    pointerType: 'mouse',
  })
  assert.deepEqual(logged, [
    ['onPress', { page: 2, point: { x: 72, y: 301 }, pointerType: 'mouse' }],
  ])
  host.destroy()
})

void test('logs onLongPress for a long press', () => {
  const { host, logged } = setUp()
  host.emitPress('long-press', {
    page: 0,
    point: { x: 10.26, y: 20.44 },
    pointerType: 'touch',
  })
  assert.deepEqual(logged, [
    ['onLongPress', { page: 0, point: { x: 10.3, y: 20.4 }, pointerType: 'touch' }],
  ])
  host.destroy()
})
