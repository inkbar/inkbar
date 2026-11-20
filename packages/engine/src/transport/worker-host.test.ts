import { readFile } from 'node:fs/promises'

import { fixtureBytes } from '@inkbar/fixtures'
import { generateSlowPage } from '@inkbar/fixtures/generate-large'
import { beforeAll, expect, test } from 'vitest'

import { EngineCore } from '../native/core.ts'
import { loadNative } from '../native/module.ts'
import { withFunctions } from '../native/testing.ts'

import { serve, transferables, type WorkerScope } from './worker-host.ts'

import type { FromWorker, ToWorker } from '../protocol.ts'

let wasm: Uint8Array
let bytes: Uint8Array

beforeAll(async () => {
  wasm = await readFile(new URL('../../vendor/inkbar-pdfium.wasm', import.meta.url))
  bytes = await fixtureBytes('text-simple')
})

/** A worker scope that records what the host posts. */
function fakeScope() {
  const target = new EventTarget()
  const posted: FromWorker[] = []
  const transfers: (Transferable[] | undefined)[] = []
  let notify = () => {}
  const scope: WorkerScope = {
    postMessage(message, transfer) {
      posted.push(message)
      transfers.push(transfer)
      notify()
    },
    addEventListener: (
      type: string,
      listener: (event: MessageEvent<ToWorker>) => void
    ) => {
      target.addEventListener(type, listener as EventListener)
    },
  }
  return {
    scope,
    posted,
    transfers,
    send(message: ToWorker) {
      target.dispatchEvent(new MessageEvent('message', { data: message }))
    },
    /** Resolves once `count` messages have been posted. */
    until(count: number) {
      return new Promise<void>((resolve) => {
        notify = () => {
          if (posted.length >= count) resolve()
        }
        notify()
      })
    },
  }
}

test('a trap answers the call, then reports the worker as failed', async () => {
  const native = await loadNative({ wasm })
  const fake = fakeScope()
  serve(fake.scope, () =>
    Promise.resolve(
      new EngineCore(
        withFunctions(native, {
          ...native.fn,
          FPDF_GetPageCount: () => {
            throw new WebAssembly.RuntimeError('Aborted(OOM)')
          },
        })
      )
    )
  )
  fake.send({ type: 'init', wasm })
  await fake.until(1)
  expect(fake.posted[0]).toEqual({ type: 'ready' })
  fake.send({ id: 1, request: { op: 'open', bytes } })
  await fake.until(3)
  expect(fake.posted[1]).toMatchObject({
    id: 1,
    ok: false,
    error: { code: 'out-of-memory' },
  })
  expect(fake.posted[2]).toMatchObject({
    type: 'failed',
    error: {
      code: 'engine-failure',
      message: 'The engine stopped after an internal error; create a new engine.',
    },
  })
})

test('an ordinary error answers the call and keeps the worker', async () => {
  const fake = fakeScope()
  serve(fake.scope)
  fake.send({ type: 'init', wasm })
  await fake.until(1)
  fake.send({ id: 1, request: { op: 'open', bytes: new Uint8Array([1, 2, 3]) } })
  fake.send({ id: 2, request: { op: 'open', bytes } })
  await fake.until(3)
  expect(fake.posted[1]).toMatchObject({
    id: 1,
    ok: false,
    error: { code: 'invalid-pdf' },
  })
  expect(fake.posted[2]).toMatchObject({ id: 2, ok: true, value: { pageCount: 3 } })
  expect(
    fake.posted.some((message) => 'type' in message && message.type === 'failed')
  ).toBe(false)
})

test('an abort for the running render stops it, and the next request is answered', async () => {
  const fake = fakeScope()
  serve(fake.scope)
  fake.send({ type: 'init', wasm })
  await fake.until(1)
  fake.send({ id: 1, request: { op: 'open', bytes: await generateSlowPage() } })
  await fake.until(2)
  const doc = (fake.posted[1] as { value: { id: number } }).value.id
  fake.send({
    id: 2,
    request: { op: 'renderPage', doc, index: 0, options: { scale: 6 } },
  })
  // The abort arrives as its own message while the render runs.
  await new Promise((resolve) => setTimeout(resolve, 20))
  fake.send({ type: 'abort', id: 2 })
  await fake.until(3)
  const reply = fake.posted[2] as { ok: boolean; error?: unknown }
  expect(reply.ok).toBe(false)
  expect(reply).toEqual({
    id: 2,
    ok: false,
    error: { code: 'aborted', message: 'The call was aborted.' },
  })
  // An abort for a call that has already answered changes nothing.
  fake.send({ type: 'abort', id: 2 })
  fake.send({ id: 3, request: { op: 'pageInfo', doc, index: 0 } })
  await fake.until(4)
  expect(fake.posted[3]).toMatchObject({ id: 3, ok: true, value: { width: 612 } })
  expect(fake.posted).toHaveLength(4)
})

test('a rendered page hands over its own buffer, not engine memory', async () => {
  const fake = fakeScope()
  serve(fake.scope)
  fake.send({ type: 'init', wasm })
  await fake.until(1)
  fake.send({ id: 1, request: { op: 'open', bytes } })
  await fake.until(2)
  fake.send({ id: 2, request: { op: 'renderPage', doc: 1, index: 0, options: {} } })
  await fake.until(3)
  const reply = fake.posted[2] as { value: { data: Uint8ClampedArray } }
  const { buffer } = reply.value.data
  expect(fake.transfers[2]).toEqual([buffer])
  // Exactly the pixels: a view on the module's memory would have a far larger buffer.
  expect(buffer.byteLength).toBe(612 * 792 * 4)
})

test('only an array that spans its whole buffer is handed over', () => {
  const whole = new Uint8ClampedArray(16)
  expect(transferables({ width: 2, height: 2, data: whole })).toEqual([whole.buffer])
  expect(transferables(new Uint8Array(8))).toHaveLength(1)
  const memory = new ArrayBuffer(64)
  // A view on part of a larger buffer is copied when posted, so the buffer stays where it is.
  expect(transferables({ data: new Uint8ClampedArray(memory, 16, 16) })).toEqual([])
  expect(transferables(new Uint8Array(memory, 0, 8))).toEqual([])
  expect(transferables(new Uint8Array(memory, 8))).toEqual([])
  expect(transferables(undefined)).toEqual([])
})

test('the worker host gives the core the fallback fonts from the start-up message', async () => {
  const fake = fakeScope()
  const fonts = { japanese: 'https://fonts.test/jp.otf', default: new Uint8Array([1]) }
  let given: unknown
  serve(fake.scope, async (source, options) => {
    given = options
    return new EngineCore(await loadNative({ wasm: source }), options)
  })
  fake.send({ type: 'init', wasm, fallbackFonts: fonts })
  await fake.until(1)
  expect(fake.posted[0]).toEqual({ type: 'ready' })
  expect(given).toEqual({ fallbackFonts: fonts })
})
