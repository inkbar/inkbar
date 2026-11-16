import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

import { expect, test } from 'vitest'

import { FUNCTIONS } from './functions.ts'
import { loadNative } from './module.ts'

const exported = readFileSync(
  new URL('../../vendor/exports.txt', import.meta.url),
  'utf8'
)
  .trim()
  .split('\n')
const wasmPath = new URL('../../vendor/inkbar-pdfium.wasm', import.meta.url)

test('every function the engine binds is in the binary', () => {
  expect(Object.keys(FUNCTIONS).filter((n) => !exported.includes(n))).toEqual([])
})

test('the binary exports nothing the engine does not bind', () => {
  expect(exported.filter((n) => !(n in FUNCTIONS))).toEqual([])
})

test('loadNative binds every function', async () => {
  const native = await loadNative({ wasm: await readFile(wasmPath) })
  for (const name of Object.keys(FUNCTIONS))
    expect(typeof native.fn[name as keyof typeof FUNCTIONS]).toBe('function')
})

test('loadNative rejects bytes that are not WebAssembly', async () => {
  await expect(loadNative({ wasm: new Uint8Array([1, 2, 3]) })).rejects.toMatchObject({
    code: 'engine-failure',
  })
})
