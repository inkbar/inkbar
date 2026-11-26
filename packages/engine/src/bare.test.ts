import { readFile } from 'node:fs/promises'

import { fixtureBytes } from '@inkbar/fixtures'
import { expect, test } from 'vitest'

import { createEngine, type BareEngineOptions } from './bare.ts'

const wasm = await readFile(new URL('../vendor/inkbar-pdfium.wasm', import.meta.url))

test('the bare entry opens a document with the given wasm and no worker', async () => {
  const engine = await createEngine({ wasm, worker: false })
  try {
    const doc = await engine.open(await fixtureBytes('text-simple'))
    expect(doc.pageCount).toBe(3)
  } finally {
    await engine.destroy()
  }
})

test('the bare entry names the option that is missing', async () => {
  const missingWasm = createEngine({ worker: false } as unknown as BareEngineOptions)
  await expect(missingWasm).rejects.toThrow(TypeError)
  await expect(missingWasm).rejects.toThrow(/wasm/)
  const missingWorker = createEngine({ wasm } as unknown as BareEngineOptions)
  await expect(missingWorker).rejects.toThrow(TypeError)
  await expect(missingWorker).rejects.toThrow(/worker/)
})

test('the bare entry ignores a worker URL where there is no Worker global', async () => {
  const engine = await createEngine({ wasm, worker: '/unused/worker.mjs' })
  try {
    expect((await engine.open(await fixtureBytes('text-simple'))).pageCount).toBe(3)
  } finally {
    await engine.destroy()
  }
})
