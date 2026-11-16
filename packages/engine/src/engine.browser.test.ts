import { fixtureUrl } from '@inkbar/fixtures/urls'
import { afterEach, expect, test } from 'vitest'

import wasm from '../vendor/inkbar-pdfium.wasm?url'

import { createEngine, type Engine, type EngineDocument } from './index.ts'
import { createWorkerTransport } from './transport/worker.ts'

import type * as Built from './index.ts'

const PDF_MAGIC = new TextEncoder().encode('%PDF-')

// Source runs name the worker script and the wasm; the built package's defaults are tested below.
const worker = new URL('./worker.ts', import.meta.url)

async function fixture(name: Parameters<typeof fixtureUrl>[0]): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(fixtureUrl(name))).arrayBuffer())
}

const engines: Engine[] = []
async function start(options: Parameters<typeof createEngine>[0] = { worker, wasm }) {
  const engine = await createEngine(options)
  engines.push(engine)
  return engine
}

afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.destroy()))
})

test('runs in a worker: open, inspect, render, save', async () => {
  const engine = await start()
  const bytes = await fixture('text-simple')
  const length = bytes.byteLength
  const doc = await engine.open(bytes)
  expect(bytes.byteLength).toBe(length) // not detached
  expect(doc.pageCount).toBe(3)
  expect(await doc.pageInfo(0)).toEqual({ width: 612, height: 792, rotation: 0 })
  const page = await doc.renderPage(0)
  expect(page).toMatchObject({ width: 612, height: 792 })
  expect(page.data.some((v, i) => i % 4 !== 3 && v !== 255)).toBe(true)
  expect((await doc.save()).subarray(0, 5)).toEqual(PDF_MAGIC)
  expect((await doc.save({ mode: 'incremental' })).subarray(0, 5)).toEqual(PDF_MAGIC)
  await doc.close()
})

test('rendering does not block the page', async () => {
  const engine = await start()
  const doc = await engine.open(await fixture('text-simple'))
  let ticks = 0
  const timer = setInterval(() => ticks++, 5)
  try {
    await doc.renderPage(0, { scale: 6 })
  } finally {
    clearInterval(timer)
  }
  expect(ticks).toBeGreaterThan(0)
})

test('error codes cross the worker boundary', async () => {
  const engine = await start()
  const encrypted = await fixture('encrypted-aes')
  await expect(engine.open(encrypted)).rejects.toMatchObject({
    name: 'EngineError',
    code: 'password-required',
  })
  await expect(engine.open(encrypted, { password: 'nope' })).rejects.toMatchObject({
    code: 'password-incorrect',
  })
  const doc: EngineDocument = await engine.open(encrypted, { password: 'inkbar' })
  expect(doc.pageCount).toBe(1)
  await expect(doc.pageInfo(9)).rejects.toBeInstanceOf(RangeError)
  await expect(doc.renderPage(0, { scale: -1 })).rejects.toBeInstanceOf(RangeError)
  await expect(engine.open(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
    code: 'invalid-pdf',
  })
})

test('aborting a queued call rejects it and lets the running one finish', async () => {
  const engine = await start()
  const doc = await engine.open(await fixture('text-simple'))
  const c = new AbortController()
  const first = doc.renderPage(0, { scale: 4 })
  const second = doc.renderPage(0, { signal: c.signal })
  c.abort()
  await expect(second).rejects.toMatchObject({ code: 'aborted' })
  await expect(first).resolves.toMatchObject({ width: 2448 })
  await expect(doc.renderPage(0, { signal: AbortSignal.abort() })).rejects.toMatchObject({
    code: 'aborted',
  })
})

test('destroy terminates the worker and rejects later calls', async () => {
  const engine = await start()
  const doc = await engine.open(await fixture('text-simple'))
  const queued = [doc.renderPage(0, { scale: 4 }), doc.renderPage(0)]
  await new Promise((resolve) => setTimeout(resolve, 0)) // the first call is now running
  const settled = Promise.allSettled(queued)
  await engine.destroy()
  const [running, waiting] = await settled
  expect(running).toMatchObject({ status: 'fulfilled', value: { width: 2448 } })
  expect(waiting).toMatchObject({ status: 'rejected', reason: { code: 'aborted' } })
  await expect(doc.pageInfo(0)).rejects.toMatchObject({ code: 'engine-failure' })
  await expect(engine.open(await fixture('text-simple'))).rejects.toMatchObject({
    code: 'engine-failure',
  })
})

test('a wasm URL that 404s rejects createEngine and names the URL', async () => {
  const error: unknown = await createEngine({ worker, wasm: '/missing.wasm' }).catch(
    (reason: unknown) => reason
  )
  expect(error).toMatchObject({ code: 'engine-failure' })
  expect((error as Error).message).toContain('/missing.wasm')
})

test('HTML served in place of the wasm rejects createEngine and names the URL', async () => {
  const url = '/engine-test/html-instead-of.wasm'
  const error: unknown = await createEngine({ worker, wasm: url }).catch(
    (reason: unknown) => reason
  )
  expect(error).toMatchObject({ code: 'engine-failure' })
  expect((error as Error).message).toContain(url)
})

/** Records the workers `createEngine` makes and which of them were terminated. */
function trackWorkers() {
  const Original = globalThis.Worker
  const terminated: Worker[] = []
  const created: Worker[] = []
  globalThis.Worker = class extends Original {
    constructor(...args: ConstructorParameters<typeof Worker>) {
      super(...args)
      created.push(this)
      const terminate = this.terminate.bind(this)
      this.terminate = () => {
        terminated.push(this)
        terminate()
      }
    }
  }
  return {
    created,
    terminated,
    restore() {
      globalThis.Worker = Original
    },
  }
}

test('a worker script that 404s rejects createEngine, names the URL and terminates it', async () => {
  const tracked = trackWorkers()
  try {
    const error: unknown = await createEngine({ worker: '/no-such-worker.mjs' }).catch(
      (reason: unknown) => reason
    )
    expect(error).toMatchObject({ code: 'engine-failure' })
    expect((error as Error).message).toContain('/no-such-worker.mjs')
    expect(tracked.created).toHaveLength(1)
    expect(tracked.terminated).toEqual(tracked.created)
  } finally {
    tracked.restore()
  }
})

test('a worker that never answers rejects after the start-up bound and is terminated', async () => {
  const url = URL.createObjectURL(new Blob([''], { type: 'text/javascript' }))
  const silent = new Worker(url, { type: 'module' })
  let terminated = false
  const terminate = silent.terminate.bind(silent)
  silent.terminate = () => {
    terminated = true
    terminate()
  }
  try {
    const error: unknown = await createWorkerTransport(silent, wasm, {
      url,
      startTimeout: 300,
    }).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ code: 'engine-failure' })
    expect((error as Error).message).toContain('did not start in time')
    expect((error as Error).message).toContain(url)
    expect(terminated).toBe(true)
  } finally {
    URL.revokeObjectURL(url)
  }
})

test('a malformed wasm URL rejects createEngine and terminates the worker', async () => {
  const tracked = trackWorkers()
  try {
    const error: unknown = await createEngine({ worker, wasm: 'http://' }).catch(
      (reason: unknown) => reason
    )
    expect(error).toMatchObject({ code: 'engine-failure' })
    expect((error as Error).message).toContain('http://')
    expect(tracked.terminated).toEqual(tracked.created)
    expect(tracked.created).toHaveLength(1)
  } finally {
    tracked.restore()
  }
})

test('a worker error rejects every pending call and terminates the worker', async () => {
  const real = new Worker(worker, { type: 'module' })
  let terminated = false
  const terminate = real.terminate.bind(real)
  real.terminate = () => {
    terminated = true
    terminate()
  }
  const engine = await start({ worker: real, wasm })
  const doc = await engine.open(await fixture('text-simple'))
  const pending = [doc.renderPage(0, { scale: 4 }), doc.pageInfo(0), doc.pageInfo(1)]
  real.dispatchEvent(new ErrorEvent('error', { message: 'boom' }))
  const results = await Promise.allSettled(pending)
  for (const result of results) {
    expect(result).toMatchObject({
      status: 'rejected',
      reason: { code: 'engine-failure' },
    })
  }
  expect(terminated).toBe(true)
  await expect(doc.pageInfo(0)).rejects.toMatchObject({ code: 'engine-failure' })
})

test('worker: false runs in the page thread', async () => {
  const engine = await start({ worker: false, wasm })
  const doc = await engine.open(await fixture('text-simple'))
  expect(await doc.pageInfo(0)).toEqual({ width: 612, height: 792, rotation: 0 })
  expect((await doc.renderPage(0)).width).toBe(612)
})

// The built package, served as a host would serve it: default worker and wasm.
const builtUrl = '/engine-dist/index.mjs'
const loadBuilt = async () => (await import(/* @vite-ignore */ builtUrl)) as typeof Built

function observeResources() {
  const urls: string[] = []
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) urls.push(entry.name)
  })
  observer.observe({ type: 'resource' })
  return {
    stop() {
      for (const entry of observer.takeRecords()) urls.push(entry.name)
      observer.disconnect()
      return urls
    },
  }
}

test('the built package finds its worker and wasm by default', async () => {
  const { createEngine: createBuilt } = await loadBuilt()
  const engine = await createBuilt()
  engines.push(engine)
  const doc = await engine.open(await fixture('text-simple'))
  expect(await doc.pageInfo(2)).toEqual({ width: 612, height: 792, rotation: 0 })
  expect((await doc.renderPage(0)).width).toBe(612)
})

// Requests made inside the worker do not appear in the page's performance entries, so the wasm
// fetch is not seen there. The `worker: false` engine below runs the same loading code in the page
// and covers it.
test('the engine requests nothing but its wasm and worker', async () => {
  const { createEngine: createBuilt } = await loadBuilt()
  const fixtures = new Set<string>()
  const watcher = observeResources()
  const bytes = await (async () => {
    fixtures.add(new URL(fixtureUrl('text-simple'), location.href).href)
    return fixture('text-simple')
  })()
  const engine = await createBuilt()
  engines.push(engine)
  const doc = await engine.open(bytes)
  await doc.renderPage(0)
  // In the page thread the wasm fetch is visible here too.
  const inPage = await createBuilt({
    worker: false,
    wasm: new URL('/engine-dist/inkbar-pdfium.wasm', location.href),
  })
  engines.push(inPage)
  await (await inPage.open(bytes)).renderPage(0)
  const urls = watcher.stop()

  expect(urls.some((url) => url.endsWith('/engine-dist/worker.mjs'))).toBe(true)
  expect(urls.some((url) => url.endsWith('.wasm'))).toBe(true)
  for (const url of urls) {
    const parsed = new URL(url)
    expect(parsed.origin).toBe(location.origin)
    const allowed =
      fixtures.has(parsed.href) ||
      (parsed.pathname.startsWith('/engine-dist/') &&
        /\.(mjs|wasm)$/.test(parsed.pathname))
    expect(allowed, url).toBe(true)
  }
})
