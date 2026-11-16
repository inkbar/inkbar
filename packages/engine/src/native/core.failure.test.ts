import { readFile } from 'node:fs/promises'

import { fixtureBytes } from '@inkbar/fixtures'
import { beforeAll, expect, test, vi } from 'vitest'

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
  let trapped = false
  const trap = new WebAssembly.RuntimeError(message)
  const fn = new Proxy(native.fn, {
    get(target, key: keyof Native) {
      const real = target[key]
      return (...args: number[]) => {
        calls.push(key)
        // A second trap in cleanup would replace the first error.
        if (trapped) throw new WebAssembly.RuntimeError('second trap')
        if (key === name && ++count >= trapAt) {
          trapped = true
          throw trap
        }
        return real(...args)
      }
    },
  })
  return { native: withFunctions(native, fn), calls, trap }
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

test.each([
  ['open', 'FPDF_GetPageCount'],
  ['pageInfo', 'FPDF_GetPageWidthF'],
  ['render', 'FPDF_RenderPageBitmap'],
  ['save', 'INK_WriterSize'],
] as const)(
  'a trap in %s makes no native call afterwards and the caller sees the trap',
  async (operation, name) => {
    const { native, calls, trap } = await trapping(name)
    const core = new EngineCore(native)
    const id = operation === 'open' ? 0 : core.open(bytes).id
    const run = {
      open: () => core.open(bytes),
      pageInfo: () => core.pageInfo(id, 0),
      render: () => core.renderPage(id, 0, 1),
      save: () => core.save(id, 'rewrite'),
    }[operation]
    let error: unknown
    try {
      run()
    } catch (caught) {
      error = caught
    }
    expect(error).toMatchObject({ name: 'EngineError', code: 'engine-failure' })
    expect((error as Error).cause).toBe(trap)
    expect(calls.at(-1)).toBe(name)
    expect(core.stopped).toBe(true)
    expect(() => core.close(id)).not.toThrow()
    expect(() => core.destroy()).not.toThrow()
    expect(calls.at(-1)).toBe(name)
  }
)

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

test('a page count of zero is invalid-pdf and frees the copy', async () => {
  const native = await loadNative({ wasm })
  const freed: number[] = []
  const closed: number[] = []
  const fn: Native = {
    ...native.fn,
    FPDF_GetPageCount: () => 0,
    FPDF_CloseDocument: (doc) => (closed.push(doc), native.fn.FPDF_CloseDocument(doc)),
    free: (ptr) => (freed.push(ptr), native.fn.free(ptr)),
  }
  const core = new EngineCore(withFunctions(native, fn))
  expect(() => core.open(bytes)).toThrow(expect.objectContaining({ code: 'invalid-pdf' }))
  expect(closed).toHaveLength(1)
  expect(freed).toHaveLength(1)
  expect(core.openCount).toBe(0)
  core.destroy()
})

test('core and API use one message for a closed document', async () => {
  const native = await loadNative({ wasm })
  const core = new EngineCore(native)
  const { id } = core.open(bytes)
  core.close(id)
  expect(() => core.pageInfo(id, 0)).toThrow('The document is closed.')
  core.destroy()

  const engine = engineOver(
    new InThreadTransport(new EngineCore(await loadNative({ wasm })))
  )
  const doc = await engine.open(bytes)
  await doc.close()
  await expect(doc.pageInfo(0)).rejects.toThrow('The document is closed.')
  await engine.destroy()
})

/** A module whose `name` throws `error` instead of running. */
async function throwing(name: keyof Native, error: unknown) {
  const native = await loadNative({ wasm })
  return withFunctions(native, {
    ...native.fn,
    [name]: () => {
      throw error
    },
  })
}

test('a stack overflow in the module stops the engine as an engine-failure', async () => {
  const overflow = new RangeError('Maximum call stack size exceeded')
  const core = new EngineCore(await throwing('FPDF_RenderPageBitmap', overflow))
  const { id } = core.open(bytes)
  let error: unknown
  try {
    core.renderPage(id, 0, 1)
  } catch (caught) {
    error = caught
  }
  expect(error).toMatchObject({ name: 'EngineError', code: 'engine-failure' })
  expect((error as Error).cause).toBe(overflow)
  expect(core.stopped).toBe(true)
  expect(() => core.pageInfo(id, 0)).toThrow(STOPPED)
  core.destroy()
})

test('a bad page index and an oversized render are RangeErrors and leave the engine running', async () => {
  const core = new EngineCore(await loadNative({ wasm }))
  const { id } = core.open(bytes)
  expect(() => core.pageInfo(id, 9)).toThrow(RangeError)
  expect(() => core.renderPage(id, 0, 1000)).toThrow(RangeError)
  expect(() => core.renderPage(id, 0, 1000)).toThrow(
    'the rendered page would be too large'
  )
  expect(core.stopped).toBe(false)
  expect(core.pageInfo(id, 0).width).toBe(612)
  core.destroy()
})

test('a bitmap copy that JavaScript cannot allocate is out-of-memory and the engine keeps working', async () => {
  const core = new EngineCore(await loadNative({ wasm }))
  const { id } = core.open(bytes)
  const Real = Uint8ClampedArray
  vi.stubGlobal(
    'Uint8ClampedArray',
    class extends Real {
      constructor(length: number) {
        if (length > 1_000_000) throw new RangeError('Array buffer allocation failed')
        super(length)
      }
    }
  )
  try {
    expect(() => core.renderPage(id, 0, 1)).toThrow(
      expect.objectContaining({ code: 'out-of-memory' })
    )
  } finally {
    vi.unstubAllGlobals()
  }
  expect(core.stopped).toBe(false)
  expect(core.renderPage(id, 0, 1).width).toBe(612)
  core.destroy()
})

test('a trap while destroy closes a document still destroys the engine', async () => {
  const core = new EngineCore(
    await throwing('FPDF_CloseDocument', new WebAssembly.RuntimeError('unreachable'))
  )
  core.open(bytes)
  expect(() => core.destroy()).not.toThrow()
  expect(core.openCount).toBe(0)
  expect(() => core.open(bytes)).toThrow(
    expect.objectContaining({ code: 'engine-failure' })
  )
})
