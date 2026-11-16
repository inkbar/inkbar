import { readFile } from 'node:fs/promises'

import { fixtureBytes } from '@inkbar/fixtures'
import { beforeAll, expect, test } from 'vitest'

import { EngineCore } from '../native/core.ts'
import { loadNative } from '../native/module.ts'
import { withFunctions } from '../native/testing.ts'

import { serve, type WorkerScope } from './worker-host.ts'

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
  let notify = () => {}
  const scope: WorkerScope = {
    postMessage(message) {
      posted.push(message)
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
