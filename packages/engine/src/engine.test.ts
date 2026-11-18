import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { fixtureBytes } from '@inkbar/fixtures'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'

import { engineOver } from './engine.ts'
import { createEngine, EngineError, type Engine, type EngineDocument } from './index.ts'

import type { Request, Transport } from './protocol.ts'

const PDF_MAGIC = new TextEncoder().encode('%PDF-')

let wasm: Uint8Array
let bytes: Uint8Array
let engine: Engine
let doc: EngineDocument

beforeAll(async () => {
  wasm = await readFile(new URL('../vendor/inkbar-pdfium.wasm', import.meta.url))
  bytes = await fixtureBytes('text-simple')
})

beforeEach(async () => {
  engine = await createEngine({ wasm, worker: false })
  doc = await engine.open(bytes)
})

afterEach(async () => {
  await engine.destroy()
})

test('opens, inspects, renders, saves and closes', async () => {
  expect(doc.pageCount).toBe(3)
  expect(await doc.pageInfo(0)).toEqual({
    width: 612,
    height: 792,
    rotation: 0,
    box: { x: 0, y: 0, width: 612, height: 792 },
  })
  expect(await doc.renderPage(0, { scale: 2 })).toMatchObject({
    width: 1224,
    height: 1584,
  })
  expect((await doc.save()).subarray(0, 5)).toEqual(PDF_MAGIC)
  expect((await doc.save({ mode: 'incremental' })).subarray(0, 5)).toEqual(PDF_MAGIC)
  await doc.close()
})

test('a signal aborted before the call rejects with aborted', async () => {
  await expect(doc.renderPage(0, { signal: AbortSignal.abort() })).rejects.toMatchObject({
    code: 'aborted',
  })
  await expect(engine.open(bytes, { signal: AbortSignal.abort() })).rejects.toMatchObject(
    { code: 'aborted' }
  )
})

test('aborting a queued call rejects it and lets the running one finish', async () => {
  const c = new AbortController()
  const first = doc.renderPage(0, { scale: 4 })
  const second = doc.renderPage(0, { signal: c.signal })
  c.abort()
  await expect(second).rejects.toMatchObject({ code: 'aborted' })
  await expect(first).resolves.toMatchObject({ width: 2448 })
})

test('an aborted queued call is skipped and the call before it still resolves', async () => {
  const c = new AbortController()
  const call = doc.pageInfo(0)
  const aborted = doc.renderPage(0, { signal: c.signal })
  c.abort()
  await expect(aborted).rejects.toMatchObject({ code: 'aborted' })
  await expect(call).resolves.toMatchObject({ width: 612 })
})

test('calls resolve in the order they were made', async () => {
  const order: number[] = []
  const calls = [
    doc.renderPage(0, { scale: 3 }).then(() => order.push(0)),
    doc.pageInfo(1).then(() => order.push(1)),
    doc.save().then(() => order.push(2)),
  ]
  await Promise.all(calls)
  expect(order).toEqual([0, 1, 2])
})

test('a closed document rejects and a second close resolves', async () => {
  await doc.close()
  await expect(doc.pageInfo(0)).rejects.toMatchObject({ code: 'engine-failure' })
  await expect(doc.renderPage(0)).rejects.toMatchObject({ code: 'engine-failure' })
  await expect(doc.save()).rejects.toMatchObject({ code: 'engine-failure' })
  await expect(doc.close()).resolves.toBeUndefined()
})

test('destroy closes open documents and ends the engine', async () => {
  await engine.destroy()
  await expect(doc.pageInfo(0)).rejects.toMatchObject({ code: 'engine-failure' })
  await expect(doc.renderPage(0)).rejects.toMatchObject({ code: 'engine-failure' })
  await expect(doc.save()).rejects.toMatchObject({ code: 'engine-failure' })
  await expect(engine.open(bytes)).rejects.toMatchObject({ code: 'engine-failure' })
  await expect(doc.close()).resolves.toBeUndefined()
  await expect(engine.destroy()).resolves.toBeUndefined()
})

test('destroy rejects queued calls with aborted', async () => {
  const queued = [doc.renderPage(0, { scale: 4 }), doc.renderPage(0)]
  const destroyed = engine.destroy()
  await Promise.all(
    queued.map((call) => expect(call).rejects.toMatchObject({ code: 'aborted' }))
  )
  await expect(destroyed).resolves.toBeUndefined()
})

test('a close queued when destroy runs resolves', async () => {
  const queued = doc.pageInfo(0)
  const closing = doc.close()
  const destroyed = engine.destroy()
  await expect(queued).rejects.toMatchObject({ code: 'aborted' })
  await expect(closing).resolves.toBeUndefined()
  await expect(destroyed).resolves.toBeUndefined()
})

test('a close that fails for another reason after destroy still rejects', async () => {
  let failClose!: () => void
  const fake = engineOver({
    call: (request) =>
      request.op === 'open'
        ? Promise.resolve({ id: 1, pageCount: 1 } as never)
        : new Promise<never>((_, reject) => {
            failClose = () => reject(new EngineError('engine-failure', 'boom'))
          }),
    destroy: () => Promise.resolve(),
  })
  const opened = await fake.open(bytes)
  const closing = opened.close()
  await fake.destroy()
  failClose()
  await expect(closing).rejects.toMatchObject({ code: 'engine-failure', message: 'boom' })
})

test('a default worker that cannot be constructed is named in the error', async () => {
  vi.stubGlobal(
    'Worker',
    class {
      constructor() {
        throw new Error('blocked')
      }
    }
  )
  try {
    const error: unknown = await createEngine({ wasm }).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ code: 'engine-failure' })
    expect((error as Error).message).toMatch(/worker\.mjs/)
  } finally {
    vi.unstubAllGlobals()
  }
})

test('after destroy no call reaches the transport', async () => {
  const seen: Request[] = []
  const transport: Transport = {
    call: (request) => {
      seen.push(request)
      return Promise.resolve({ id: 1, pageCount: 1 } as never)
    },
    destroy: () => Promise.resolve(),
  }
  const fake = engineOver(transport)
  const opened = await fake.open(bytes)
  await fake.destroy()
  seen.length = 0
  await expect(fake.open(bytes)).rejects.toMatchObject({ code: 'engine-failure' })
  await expect(opened.pageInfo(0)).rejects.toMatchObject({ code: 'engine-failure' })
  await expect(opened.close()).resolves.toBeUndefined()
  expect(seen).toEqual([])
})

test('open copies the bytes when called, not when it runs', async () => {
  const mine = (await fixtureBytes('text-simple')).slice()
  const pending = engine.open(mine)
  mine.fill(0)
  expect((await pending).pageCount).toBe(3)
})

test('a second destroy waits for the first', async () => {
  let finish!: () => void
  const slow = new Promise<void>((resolve) => (finish = resolve))
  const fake = engineOver({
    call: () => Promise.resolve(undefined as never),
    destroy: () => slow,
  })
  let secondDone = false
  const first = fake.destroy()
  const second = fake.destroy().then(() => (secondDone = true))
  await new Promise((resolve) => setTimeout(resolve, 5))
  expect(secondDone).toBe(false)
  finish()
  await Promise.all([first, second])
  expect(secondDone).toBe(true)
})

test('the caller keeps its bytes', async () => {
  const mine = (await fixtureBytes('text-simple')).slice()
  const copy = await engine.open(mine)
  expect(mine.byteLength).toBeGreaterThan(0)
  mine.fill(0)
  expect((await copy.pageInfo(0)).width).toBe(612)
})

/** Silences Emscripten's own report of a failed load, which the rejection already carries. */
function quietLoad() {
  return vi.spyOn(console, 'error').mockImplementation(() => {})
}

test('a wasm path that does not exist rejects with engine-failure naming it', async () => {
  using _ = quietLoad()
  await expect(
    createEngine({ wasm: new URL('file:///nope/missing.wasm'), worker: false })
  ).rejects.toMatchObject({
    code: 'engine-failure',
    message: expect.stringContaining('missing.wasm') as unknown,
  })
})

test('an HTML file in place of the wasm rejects with engine-failure naming it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'engine-html-'))
  try {
    const file = join(dir, 'inkbar-pdfium.wasm')
    await writeFile(file, '<!doctype html><title>Not found</title>')
    const url = pathToFileURL(file)
    using _ = quietLoad()
    await expect(createEngine({ wasm: url, worker: false })).rejects.toMatchObject({
      code: 'engine-failure',
      message: expect.stringContaining(url.href) as unknown,
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a file: URL for the wasm loads the engine', async () => {
  const url = new URL('../vendor/inkbar-pdfium.wasm', import.meta.url)
  const fromUrl = await createEngine({ wasm: url, worker: false })
  try {
    expect((await fromUrl.open(bytes)).pageCount).toBe(3)
  } finally {
    await fromUrl.destroy()
  }
})

test('error codes survive the public API', async () => {
  const encrypted = await fixtureBytes('encrypted-aes')
  await expect(engine.open(encrypted)).rejects.toMatchObject({
    code: 'password-required',
  })
  await expect(engine.open(encrypted, { password: 'wrong' })).rejects.toMatchObject({
    code: 'password-incorrect',
  })
  // An empty password counts as none, so the document still asks for one.
  await expect(engine.open(encrypted, { password: '' })).rejects.toMatchObject({
    code: 'password-required',
  })
  expect(
    (await engine.open(encrypted, { password: 'inkbar' })).pageCount
  ).toBeGreaterThan(0)
  await expect(engine.open(new Uint8Array(0))).rejects.toMatchObject({
    code: 'invalid-pdf',
  })
})

test('the public types name no PDFium symbol', async () => {
  for (const file of ['index.ts', 'types.ts', 'engine.ts', 'errors.ts']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8')
    expect(source, file).not.toMatch(/\b(FPDF|EPDF|INK_)/)
  }
  const index = await readFile(new URL('index.ts', import.meta.url), 'utf8')
  expect(index).not.toContain('native/')
})

test('open copies a Buffer, so changing it afterwards does not change the document', async () => {
  const buffer = Buffer.from(bytes)
  const opened = engine.open(buffer)
  buffer.fill(0)
  expect((await opened).pageCount).toBe(3)
})

test('pageInfo reports the page box at the crop box origin', async () => {
  const cropped = await engine.open(await fixtureBytes('cropbox-offset'))
  const info = await cropped.pageInfo(0)
  expect(info.box).toEqual({ x: 50, y: 50, width: info.width, height: info.height })
  expect(info).toMatchObject({ width: 500, height: 700 })
  await cropped.close()
})

test('rendering without annotations changes only the annotation', async () => {
  // The fixture's Square sits at user space [100 100 200 160] inside a crop box at (50, 50).
  const cropped = await engine.open(await fixtureBytes('cropbox-offset'))
  const withAnnotations = await cropped.renderPage(0)
  expect(await cropped.renderPage(0, { annotations: true })).toEqual(withAnnotations)
  const without = await cropped.renderPage(0, { annotations: false })
  expect(without).toMatchObject({ width: withAnnotations.width })
  const { width, height } = withAnnotations
  const left = 100 - 50
  const right = 200 - 50
  const top = height - (160 - 50)
  const bottom = height - (100 - 50)
  let inside = 0
  let outside = 0
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      const same = [0, 1, 2].every(
        (k) => withAnnotations.data[at + k] === without.data[at + k]
      )
      if (same) continue
      if (x >= left - 2 && x <= right + 2 && y >= top - 2 && y <= bottom + 2) inside++
      else outside++
    }
  expect(inside).toBeGreaterThan(0)
  expect(outside).toBe(0)
  await cropped.close()
})
