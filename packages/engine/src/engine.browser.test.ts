import { generateSlowPage } from '@inkbar/fixtures/generate-large'
import { fixtureUrl } from '@inkbar/fixtures/urls'
import { fontFiles, fontUrls } from '@inkbar/fonts'
import { afterEach, describe, expect, test } from 'vitest'

import wasm from '../vendor/inkbar-pdfium.wasm?url'

import { engineOver } from './engine.ts'
import { createEngine, type Engine, type EngineDocument } from './index.ts'
import { EngineCore } from './native/core.ts'
import { loadNative } from './native/module.ts'
import { serve, type WorkerScope } from './transport/worker-host.ts'
import { createWorkerTransport } from './transport/worker.ts'

import type * as Built from './index.ts'
import type { FromWorker, ToWorker } from './protocol.ts'

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
  expect(await doc.pageInfo(0)).toEqual({
    width: 612,
    height: 792,
    rotation: 0,
    box: { x: 0, y: 0, width: 612, height: 792 },
    userUnit: 1,
  })
  const page = await doc.renderPage(0)
  expect(page).toMatchObject({ width: 612, height: 792 })
  expect(page.data.some((v, i) => i % 4 !== 3 && v !== 255)).toBe(true)
  expect((await doc.save()).subarray(0, 5)).toEqual(PDF_MAGIC)
  expect((await doc.save({ mode: 'incremental' })).subarray(0, 5)).toEqual(PDF_MAGIC)
  await doc.close()
})

test('writes an annotation through the worker and leaves the caller its arrays', async () => {
  const engine = await start()
  const doc = await engine.open(await fixture('text-simple'))
  const bounds = { x: 200, y: 300, width: 100, height: 80 }
  const content = new TextEncoder().encode('0 0 1 rg 200 300 100 80 re f')
  const length = content.byteLength
  await doc.write({
    annotations: [
      {
        page: 0,
        annotation: {
          id: 'one',
          page: 0,
          rect: bounds,
          opacity: 1,
          type: 'square',
          width: 1,
        },
        appearance: { bounds, content },
        data: '{"id":"one"}',
      },
    ],
  })
  expect(content.byteLength).toBe(length) // copied, not transferred
  const saved = await doc.save()
  await doc.close()
  expect(new TextDecoder('latin1').decode(saved)).toContain('/INKB_Gloss')

  const again = await engine.open(saved)
  const page = await again.renderPage(0)
  // The centre of the bounds, in rows from the top of the 612 x 792 page.
  const at = ((792 - 340) * page.width + 250) * 4
  expect([...page.data.subarray(at, at + 4)]).toEqual([0, 0, 255, 255])
  await again.close()
})

test('page text crosses from the worker in buffers of its own', async () => {
  const engine = await start()
  const doc = await engine.open(await fixture('text-simple'))
  const text = await doc.pageText(0)
  expect(text.count).toBeGreaterThan(0)
  expect(String.fromCodePoint(...text.codes)).toContain('Page 1')
  expect(text.geometry.length).toBe(text.count * 15)
  expect(text.flags.length).toBe(text.count)
  expect(text.fonts.length).toBe(text.count)
  for (const font of text.fonts) expect(font).toBeLessThan(text.fontTable.length)
  // Not views on the module's memory: each buffer holds exactly its array.
  expect(text.codes.buffer.byteLength).toBe(text.count * 4)
  expect(text.geometry.buffer.byteLength).toBe(text.count * 15 * 4)
  expect(text.flags.buffer.byteLength).toBe(text.count)
  expect(text.fonts.buffer.byteLength).toBe(text.count * 2)
  await expect(doc.pageText(99)).rejects.toBeInstanceOf(RangeError)
  await engine.destroy()
})

test('render options cross to the worker', async () => {
  const engine = await start()
  const doc = await engine.open(await fixture('text-simple'))
  const whole = await doc.renderPage(0, { scale: 2, rotation: 90 })
  const part = await doc.renderPage(0, {
    region: { x: 72, y: 500, width: 200, height: 150 },
    scale: 2,
    rotation: 90,
    hide: [1],
    signal: new AbortController().signal,
  })
  expect(part).toMatchObject({ width: 300, height: 400 })
  // Turned a quarter, the region's top-left corner is at (500, 72) points.
  const row = part.width * 4
  for (let y = 0; y < part.height; y++) {
    const from = ((72 * 2 + y) * whole.width + 500 * 2) * 4
    expect(part.data.subarray(y * row, (y + 1) * row)).toEqual(
      whole.data.subarray(from, from + row)
    )
  }
  await expect(
    doc.renderPage(0, { scale: 1, size: { width: 1, height: 1 } })
  ).rejects.toBeInstanceOf(RangeError)
  await engine.destroy()
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
  // A write that fails on one annotation says which, in the error's own field.
  await expect(
    doc.write({
      annotations: [
        {
          page: 0,
          annotation: {
            id: 'bare',
            type: 'square',
            page: 0,
            rect: { x: 10, y: 10, width: 10, height: 10 },
            color: '#000000',
            opacity: 1,
            createdAt: '2026-11-17T09:30:00Z',
            modifiedAt: '2026-11-17T09:30:00Z',
            width: 1,
          },
          data: '{}',
        },
      ],
    })
  ).rejects.toMatchObject({ code: 'write-failed', annotation: 'bare' })
  // A redaction the engine refuses names its page, the reason and the marks.
  const hatch = await engine.open(await fixture('redact-drawing-hatch'))
  await expect(
    hatch.redact({
      marks: [
        {
          page: 0,
          annotation: {
            id: 'over-hatch',
            type: 'redact',
            page: 0,
            rect: { x: 110, y: 110, width: 80, height: 80 },
            opacity: 1,
          },
          appearance: {
            bounds: { x: 110, y: 110, width: 80, height: 80 },
            content: new TextEncoder().encode('0 g 110 110 80 80 re f'),
          },
          data: '{}',
        },
      ],
    })
  ).rejects.toMatchObject({
    code: 'redaction-failed',
    page: 0,
    reason: 'unremovable-content',
    marks: ['over-hatch'],
    kinds: ['pattern'],
  })
})

test('redacts through the worker', async () => {
  const engine = await start()
  const doc = await engine.open(await fixture('redact-text'))
  const rect = { x: 45, y: 190, width: 170, height: 35 }
  const result = await doc.redact({
    marks: [
      {
        page: 0,
        annotation: { id: 'mark', type: 'redact', page: 0, rect, opacity: 1 },
        appearance: {
          bounds: rect,
          content: new TextEncoder().encode('0 g 45 190 170 35 re f'),
        },
        data: '{}',
      },
    ],
  })
  expect(result.pages).toEqual([{ page: 0, marks: 1, annotationsRemoved: 0 }])
  expect(result.sanitised.metadata).toBe(true)
  await expect(doc.save({ mode: 'incremental' })).rejects.toBeInstanceOf(RangeError)
  expect((await doc.save()).length).toBeGreaterThan(0)
})

describe('checkRedaction', () => {
  test('runs in a worker', async () => {
    const inWorker = await start()
    const inThread = await start({ wasm, worker: false })
    const bytes = await fixture('bad-black-box')
    const length = bytes.byteLength
    const region = {
      page: 0,
      quads: [
        {
          p1: { x: 45, y: 225 },
          p2: { x: 215, y: 225 },
          p3: { x: 45, y: 190 },
          p4: { x: 215, y: 190 },
        },
      ],
    }
    for (const options of [{}, { regions: [region] }]) {
      const found = await inWorker.checkRedaction(bytes, options)
      expect(bytes.byteLength).toBe(length) // copied, not transferred
      expect(found.candidates).toEqual([
        expect.objectContaining({ text: 'present', verdict: 'content-remains' }),
      ])
      expect(found).toEqual(await inThread.checkRedaction(bytes, options))
    }
    await expect(
      inWorker.checkRedaction(bytes, { regions: [{ ...region, page: 3 }] })
    ).rejects.toBeInstanceOf(RangeError)
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

test('a text read aborted while it waits in the worker queue rejects as a render does', async () => {
  const engine = await start()
  const doc = await engine.open(await fixture('text-simple'))
  const c = new AbortController()
  const first = doc.renderPage(0, { scale: 4 })
  const queued = doc.pageText(0, { signal: c.signal })
  c.abort()
  await expect(queued).rejects.toMatchObject({
    code: 'aborted',
    message: 'The call was aborted.',
  })
  await expect(first).resolves.toMatchObject({ width: 2448 })
  await expect(doc.pageText(0, { signal: AbortSignal.abort() })).rejects.toMatchObject({
    code: 'aborted',
  })
  expect((await doc.pageText(0, { signal: new AbortController().signal })).count).toBe(
    (await doc.pageText(0)).count
  )
  await engine.destroy()
})

/**
 * How a render settled, in a few words: a failed expectation never prints a page of pixels.
 */
const outcome = (call: Promise<unknown>) =>
  call.then(
    (value) => `resolved ${JSON.stringify({ ...(value as object), data: undefined })}`,
    (reason: unknown) =>
      `${(reason as Error).name} ${String((reason as { code?: unknown }).code)}`
  )

test('aborting a running render in the worker rejects it promptly', async () => {
  const engine = await start()
  const doc = await engine.open(await generateSlowPage())
  const reference = await doc.renderPage(0)
  const times: number[] = []
  for (let run = 0; run < 3; run++) {
    const c = new AbortController()
    const running = doc.renderPage(0, { scale: 6, signal: c.signal })
    // A generous start, so the render is well under way on a loaded machine.
    await new Promise((resolve) => setTimeout(resolve, 200))
    const at = performance.now()
    c.abort()
    expect(await outcome(running)).toBe('EngineError aborted')
    times.push(performance.now() - at)
  }
  console.info(`abort to rejection: ${times.map((t) => t.toFixed(1)).join(', ')} ms`)
  expect(Math.max(...times)).toBeLessThan(100)
  // The engine keeps working and draws the same page again.
  const again = await doc.renderPage(0)
  expect(again.data.length).toBe(reference.data.length)
  expect(again.data.every((v, i) => v === reference.data[i])).toBe(true)
})

test('rendered pixels move from the worker to the page', async () => {
  const engine = await start()
  const doc = await engine.open(await fixture('text-simple'))
  const page = await doc.renderPage(0)
  expect(page.data.buffer.byteLength).toBe(612 * 792 * 4)
})

test('the worker host gives up its copy of the pixels when it posts them', async () => {
  // The host answers over a real channel, so the transfer is the browser's own.
  const { port1, port2 } = new MessageChannel()
  const sent: FromWorker[] = []
  const scope: WorkerScope = {
    postMessage(message, transfer) {
      sent.push(message)
      port2.postMessage(message, transfer ?? [])
    },
    addEventListener: (
      type: string,
      listener: (event: MessageEvent<ToWorker>) => void
    ) => {
      port2.addEventListener(type, listener as EventListener)
    },
  }
  let core: EngineCore | undefined
  serve(
    scope,
    async (source) => (core = new EngineCore(await loadNative({ wasm: source })))
  )
  port2.start()
  const replies: FromWorker[] = []
  const next = () =>
    new Promise<FromWorker>((resolve) => {
      port1.onmessage = (event: MessageEvent<FromWorker>) => {
        replies.push(event.data)
        resolve(event.data)
      }
    })
  let reply = next()
  port1.postMessage({
    type: 'init',
    wasm: new URL(wasm, location.href).href,
  } satisfies ToWorker)
  expect(await reply).toEqual({ type: 'ready' })
  reply = next()
  port1.postMessage({
    id: 1,
    request: { op: 'open', bytes: await fixture('text-simple') },
  } satisfies ToWorker)
  const opened = (await reply) as { value: { id: number } }
  reply = next()
  port1.postMessage({
    id: 2,
    request: { op: 'renderPage', doc: opened.value.id, index: 0, options: {} },
  } satisfies ToWorker)
  const rendered = (await reply) as { value: { data: Uint8ClampedArray } }
  expect(rendered.value.data.buffer.byteLength).toBe(612 * 792 * 4)
  // The host's own array is detached: its buffer moved rather than being copied.
  const own = (sent[2] as { value: { data: Uint8ClampedArray } }).value.data
  expect(own.buffer.byteLength).toBe(0)
  // Frees the document and the host's engine.
  reply = next()
  port1.postMessage({
    id: 3,
    request: { op: 'close', doc: opened.value.id },
  } satisfies ToWorker)
  expect(await reply).toMatchObject({ id: 3, ok: true })
  core?.destroy()
  port1.close()
})

test('destroy terminates the worker and rejects later calls', async () => {
  const engine = await start()
  const doc = await engine.open(await generateSlowPage())
  const queued = [doc.renderPage(0, { scale: 6 }), doc.renderPage(0)]
  await new Promise((resolve) => setTimeout(resolve, 50)) // the first call is now running
  const settled = Promise.allSettled(queued)
  await engine.destroy()
  const [running, waiting] = await settled
  // Destroy stops a running render, as an abort does.
  expect(running?.status).toBe('rejected')
  expect(running).toMatchObject({ reason: { code: 'aborted' } })
  expect(waiting).toMatchObject({ status: 'rejected', reason: { code: 'aborted' } })
  await expect(doc.pageInfo(0)).rejects.toMatchObject({ code: 'engine-failure' })
  await expect(engine.open(await fixture('text-simple'))).rejects.toMatchObject({
    code: 'engine-failure',
  })
})

test('destroy stops a worker whose running call outlasts the bound', async () => {
  const real = new Worker(worker, { type: 'module' })
  let terminated = false
  const terminate = real.terminate.bind(real)
  real.terminate = () => {
    terminated = true
    terminate()
  }
  const engine = engineOver(
    await createWorkerTransport(real, wasm, { destroyTimeout: 1 })
  )
  const doc = await engine.open(await fixture('text-simple'))
  const running = doc.renderPage(0, { scale: 8 }).catch((reason: unknown) => reason)
  await new Promise((resolve) => setTimeout(resolve, 0)) // the render is now running
  const queued = doc.pageInfo(0).catch((reason: unknown) => reason)
  await engine.destroy()
  expect(terminated).toBe(true)
  expect(await running).toMatchObject({ name: 'EngineError', code: 'aborted' })
  expect(await queued).toMatchObject({ code: 'aborted' })
  await expect(doc.pageInfo(0)).rejects.toMatchObject({ code: 'engine-failure' })
  await expect(doc.close()).resolves.toBeUndefined()
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
  expect(await doc.pageInfo(0)).toEqual({
    width: 612,
    height: 792,
    rotation: 0,
    box: { x: 0, y: 0, width: 612, height: 792 },
    userUnit: 1,
  })
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
  expect(await doc.pageInfo(2)).toMatchObject({ width: 612, height: 792, rotation: 0 })
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

describe('fallback fonts', () => {
  /**
   * A path segment of this run's own: every font URL here holds it, so requests from other
   * browsers sharing the test server's log are left out.
   */
  const run = `run-${crypto.randomUUID()}`
  const base = `/${run}/inkbar-fonts/`
  /** The paths this run has asked the test server for under `/inkbar-fonts/`, in order. */
  const fontLog = async () =>
    ((await (await fetch('/inkbar-fonts-log')).json()) as string[]).filter((path) =>
      path.includes(`/${run}/`)
    )
  /** The font requests made while `work` runs. */
  async function fontRequests(work: () => Promise<void>): Promise<string[]> {
    const before = (await fontLog()).length
    await work()
    return (await fontLog()).slice(before)
  }
  /** Pixels darker than mid grey in the page's two lines of unembedded text, at scale 1 on A4. */
  function inked(page: { width: number; data: Uint8ClampedArray }): number {
    let count = 0
    for (let y = 842 - 790; y < 842 - 690; y++)
      for (let x = 72; x < 400; x++)
        if ((page.data[(y * page.width + x) * 4] as number) < 128) count++
    return count
  }

  test('a worker fetches a font from a relative URL resolved against the page, once', async () => {
    // Relative to the page, not to the worker script, whose base differs.
    const sources = fontUrls(`${run}/inkbar-fonts/`)
    const expected = new URL(sources.japanese, location.href).pathname
    const engine = await start({ worker, wasm, fallbackFonts: sources })
    const bytes = await fixture('unembedded-japanese')
    let pages: Awaited<ReturnType<EngineDocument['renderPage']>>[] = []
    const requested = await fontRequests(async () => {
      const doc = await engine.open(bytes)
      pages = [await doc.renderPage(0), await doc.renderPage(0)]
    })
    expect(requested).toEqual([expected])
    for (const page of pages) {
      expect(page.missingFonts).toEqual([])
      expect(inked(page)).toBeGreaterThan(500)
    }
  })

  test('in the page thread too, and a file that needs no font fetches none', async () => {
    const engine = await start({
      worker: false,
      wasm,
      fallbackFonts: fontUrls(base),
    })
    const plain = await fontRequests(async () => {
      for (const name of ['text-simple', 'unembedded-arial'] as const)
        expect(
          (await (await engine.open(await fixture(name))).renderPage(0)).missingFonts
        ).toEqual([])
    })
    expect(plain).toEqual([])
    const korean = await fontRequests(async () => {
      const page = await (
        await engine.open(await fixture('unembedded-korean'))
      ).renderPage(0)
      expect(page.missingFonts).toEqual([])
      expect(inked(page)).toBeGreaterThan(500)
    })
    expect(korean).toEqual([`${base}${fontFiles.korean}`])
  })

  test('in a worker, a text read fetches the font its page needs before a render, once', async () => {
    const engine = await start({ worker, wasm, fallbackFonts: fontUrls(base) })
    const bytes = await fixture('unembedded-japanese')
    let page: Awaited<ReturnType<EngineDocument['renderPage']>> | undefined
    const requested = await fontRequests(async () => {
      const doc = await engine.open(bytes)
      const other = await engine.open(bytes)
      expect((await doc.pageText(0)).count).toBeGreaterThan(0)
      page = await doc.renderPage(0)
      // Started together, as a viewer's text layer and page do.
      const [text, together] = await Promise.all([other.pageText(0), other.renderPage(0)])
      expect(text.count).toBeGreaterThan(0)
      expect(together.missingFonts).toEqual([])
      expect(inked(together)).toBeGreaterThan(500)
    })
    expect(requested).toEqual([`${base}${fontFiles.japanese}`])
    expect(page!.missingFonts).toEqual([])
    expect(inked(page!)).toBeGreaterThan(500)
  })

  test('a font that 404s is listed as missing and not requested again', async () => {
    const engine = await start({
      worker,
      wasm,
      fallbackFonts: { japanese: `${base}nothing-here.otf` },
    })
    const bytes = await fixture('unembedded-japanese')
    const requested = await fontRequests(async () => {
      const doc = await engine.open(bytes)
      expect((await doc.renderPage(0)).missingFonts).toEqual(['japanese'])
      expect((await doc.renderPage(0)).missingFonts).toEqual(['japanese'])
    })
    expect(requested).toEqual([`${base}nothing-here.otf`])
  })

  test('aborting a render during its font fetch in the worker rejects it promptly', async () => {
    const engine = await start({
      worker,
      wasm,
      fallbackFonts: { japanese: `${base}hang/${fontFiles.japanese}` },
    })
    const doc = await engine.open(await fixture('unembedded-japanese'))
    const before = (await fontLog()).length
    const controller = new AbortController()
    const running = doc.renderPage(0, { signal: controller.signal })
    await expect
      .poll(async () => (await fontLog()).length, { timeout: 10_000 })
      .toBeGreaterThan(before)
    controller.abort()
    // The server never answers, so a rejection shows the abort reached the fetch.
    await expect(running).rejects.toMatchObject({ code: 'aborted' })
    // Not failed: the next render asks again.
    const again = doc.renderPage(0)
    await expect
      .poll(async () => (await fontLog()).length, { timeout: 10_000 })
      .toBeGreaterThan(before + 1)
    await engine.destroy()
    // The worker's own answer, not the one destroy gives a call still running at its bound.
    await expect(again).rejects.toMatchObject({
      code: 'aborted',
      message: 'The call was aborted.',
    })
  })

  test('aborting a text read during its font fetch in the worker rejects it', async () => {
    const engine = await start({
      worker,
      wasm,
      fallbackFonts: { japanese: `${base}hang/${fontFiles.japanese}` },
    })
    const doc = await engine.open(await fixture('unembedded-japanese'))
    const before = (await fontLog()).length
    const controller = new AbortController()
    const reading = doc.pageText(0, { signal: controller.signal })
    await expect
      .poll(async () => (await fontLog()).length, { timeout: 10_000 })
      .toBeGreaterThan(before)
    controller.abort()
    // The server never answers, so a rejection shows the abort reached the fetch.
    await expect(reading).rejects.toMatchObject({
      code: 'aborted',
      message: 'The call was aborted.',
    })
    await engine.destroy()
  })

  test('destroy during the font fetch of a text read in the worker stops the fetch', async () => {
    const engine = await start({
      worker,
      wasm,
      fallbackFonts: { japanese: `${base}hang/${fontFiles.japanese}` },
    })
    const doc = await engine.open(await fixture('unembedded-japanese'))
    const before = (await fontLog()).length
    const reading = doc.pageText(0)
    await expect
      .poll(async () => (await fontLog()).length, { timeout: 10_000 })
      .toBeGreaterThan(before)
    await engine.destroy()
    await expect(reading).rejects.toMatchObject({
      code: 'aborted',
      message: 'The call was aborted.',
    })
  })

  test('destroy during the font fetch of a write in the worker stops the fetch', async () => {
    const engine = await start({
      worker,
      wasm,
      fallbackFonts: { japanese: `${base}hang/${fontFiles.japanese}` },
    })
    const doc = await engine.open(await fixture('unembedded-japanese-field'))
    const before = (await fontLog()).length
    const writing = doc.write({ fields: { f: { value: '日本語' } } })
    await expect
      .poll(async () => (await fontLog()).length, { timeout: 10_000 })
      .toBeGreaterThan(before)
    await engine.destroy()
    await expect(writing).rejects.toMatchObject({
      code: 'aborted',
      message: 'The call was aborted.',
    })
  })
})
