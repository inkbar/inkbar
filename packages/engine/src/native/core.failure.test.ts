import { readFile } from 'node:fs/promises'

import { fixtureBytes } from '@inkbar/fixtures'
import { beforeAll, expect, test } from 'vitest'

import { engineOver } from '../engine.ts'
import { InThreadTransport } from '../transport/in-thread.ts'

import { EngineCore } from './core.ts'
import { loadNative } from './module.ts'
import { withFunctions } from './testing.ts'

import type { Native } from './functions.ts'

const STOPPED = 'The engine stopped after an internal error; create a new engine.'

let wasm: Uint8Array
let bytes: Uint8Array

beforeAll(async () => {
  wasm = await readFile(new URL('../../vendor/inkbar-pdfium.wasm', import.meta.url))
  bytes = await fixtureBytes('text-simple')
})

/** A fresh module whose `name` traps from its `trapAt`-th call on, and a log of the calls made. */
async function trapping(name: keyof Native, message = 'unreachable', trapAt = 1) {
  const native = await loadNative({ wasm })
  const calls: string[] = []
  let count = 0
  const fn = new Proxy(native.fn, {
    get(target, key: keyof Native) {
      const real = target[key]
      return (...args: number[]) => {
        calls.push(key)
        if (key === name && ++count >= trapAt) throw new WebAssembly.RuntimeError(message)
        return real(...args)
      }
    },
  })
  return { native: withFunctions(native, fn), calls }
}

test('a trap is an engine-failure with the trap as its cause', async () => {
  const { native } = await trapping('FPDF_GetPageCount')
  const core = new EngineCore(native)
  let error: unknown
  try {
    core.open(bytes)
  } catch (caught) {
    error = caught
  }
  expect(error).toMatchObject({ name: 'EngineError', code: 'engine-failure' })
  expect((error as Error).cause).toBeInstanceOf(WebAssembly.RuntimeError)
})

test.each(['Aborted(OOM)', 'Cannot enlarge memory arrays to size 16777216 bytes'])(
  'an allocation abort (%s) is out-of-memory',
  async (message) => {
    const { native } = await trapping('FPDF_LoadMemDocument64', message)
    const core = new EngineCore(native)
    expect(() => core.open(bytes)).toThrow(
      expect.objectContaining({ code: 'out-of-memory' })
    )
  }
)

test('after a trap every call fails and nothing reaches the module', async () => {
  const { native, calls } = await trapping('FPDF_RenderPageBitmap')
  const core = new EngineCore(native)
  const { id } = core.open(bytes)
  expect(() => core.renderPage(id, 0, 1)).toThrow(
    expect.objectContaining({ code: 'engine-failure' })
  )
  calls.length = 0
  for (const call of [
    () => core.open(bytes),
    () => core.pageInfo(id, 0),
    () => core.renderPage(id, 0, 1),
    () => core.save(id, 'rewrite'),
  ])
    expect(call).toThrow(
      expect.objectContaining({ code: 'engine-failure', message: STOPPED })
    )
  expect(() => core.close(id)).not.toThrow()
  expect(() => core.destroy()).not.toThrow()
  expect(calls).toEqual([])
})

test('in the calling thread a trap rejects with a typed error and stops the engine', async () => {
  const { native } = await trapping('FPDF_GetPageWidthF')
  const engine = engineOver(new InThreadTransport(new EngineCore(native)))
  const doc = await engine.open(bytes)
  await expect(doc.pageInfo(0)).rejects.toMatchObject({
    name: 'EngineError',
    code: 'engine-failure',
  })
  await expect(engine.open(bytes)).rejects.toMatchObject({
    code: 'engine-failure',
    message: STOPPED,
  })
  await expect(doc.renderPage(0)).rejects.toMatchObject({ message: STOPPED })
  await expect(doc.close()).resolves.toBeUndefined()
  await expect(engine.destroy()).resolves.toBeUndefined()
})

test('open after destroy is an engine-failure', async () => {
  const core = new EngineCore(await loadNative({ wasm }))
  core.destroy()
  expect(() => core.open(bytes)).toThrow(
    expect.objectContaining({ code: 'engine-failure' })
  )
})
