import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { fixtureBytes } from '@inkbar/fixtures'
import { generateSlowPage } from '@inkbar/fixtures/generate-large'
import { fontFiles, fontUrls } from '@inkbar/fonts'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import { engineOver } from './engine.ts'
import { keysOf } from './fonts.ts'
import {
  createEngine,
  EngineError,
  type Engine,
  type EngineDocument,
  type EngineOptions,
  type FontKey,
  type RenderedPage,
  type WriteInput,
} from './index.ts'
import { EngineCore } from './native/core.ts'
import { loadNative } from './native/module.ts'
import { withFunctions } from './native/testing.ts'
import { mark } from './redaction/testing.ts'
import { InThreadTransport } from './transport/in-thread.ts'

import type { Native } from './native/functions.ts'
import type { Request, Transport } from './protocol.ts'

const PDF_MAGIC = new TextEncoder().encode('%PDF-')

let wasm: Uint8Array
let bytes: Uint8Array
let engine: Engine
let doc: EngineDocument
/** A page that takes many slices to draw at scale 6, and its whole render at scale 1. */
let slow: Uint8Array
let slowReference: RenderedPage

beforeAll(async () => {
  wasm = await readFile(new URL('../vendor/inkbar-pdfium.wasm', import.meta.url))
  bytes = await fixtureBytes('text-simple')
  slow = await generateSlowPage()
  const fresh = await createEngine({ wasm, worker: false })
  slowReference = await (await fresh.open(slow)).renderPage(0)
  await fresh.destroy()
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
    userUnit: 1,
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

/**
 * How a render settled, in a few words: a failed expectation never prints a page of pixels.
 */
const outcome = (call: Promise<unknown>) =>
  call.then(
    (value) => `resolved ${JSON.stringify({ ...(value as object), data: undefined })}`,
    (reason: unknown) =>
      `${(reason as Error).name} ${String((reason as { code?: unknown }).code)}`
  )

const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const latin1 = (data: Uint8Array) => new TextDecoder('latin1').decode(data)
const withoutId = (data: Uint8Array) =>
  latin1(data).replace(/\/ID\s*\[\s*<[0-9A-F]*>\s*<[0-9A-F]*>\s*\]/i, '/ID[]')

test('aborting a running render stops it and leaves the engine usable', async () => {
  const slowDoc = await engine.open(slow)
  const before = await slowDoc.save({ mode: 'rewrite' })
  const c = new AbortController()
  const running = slowDoc.renderPage(0, { scale: 6, signal: c.signal })
  await later(20)
  c.abort()
  expect(await outcome(running)).toBe('EngineError aborted')
  await expect(slowDoc.pageInfo(0)).resolves.toMatchObject({ width: 612, height: 792 })
  const again = await slowDoc.renderPage(0)
  expect(again.data.length).toBe(slowReference.data.length)
  expect(again.data.every((v, i) => v === slowReference.data[i])).toBe(true)
  // A render, stopped or not, changes nothing a save writes.
  expect(withoutId(await slowDoc.save({ mode: 'rewrite' }))).toBe(withoutId(before))
})

test('a render queued behind an aborted one gets only its own pixels', async () => {
  const slowDoc = await engine.open(slow)
  const c = new AbortController()
  const first = slowDoc.renderPage(0, { scale: 6, signal: c.signal })
  const second = slowDoc.renderPage(0)
  await later(20)
  c.abort()
  expect(await outcome(first)).toBe('EngineError aborted')
  const page = await second
  expect(page).toMatchObject({ width: 612, height: 792 })
  expect(page.data.length).toBe(slowReference.data.length)
  expect(page.data.every((v, i) => v === slowReference.data[i])).toBe(true)
})

test('destroy stops a running render in the calling thread', async () => {
  const slowDoc = await engine.open(slow)
  const running = outcome(slowDoc.renderPage(0, { scale: 6 }))
  await later(20)
  await engine.destroy()
  expect(await running).toBe('EngineError aborted')
  await expect(slowDoc.pageInfo(0)).rejects.toMatchObject({ code: 'engine-failure' })
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

test('redact rejects, as write does, for input that cannot be copied', async () => {
  const input = { marks: [], extra: () => undefined } as never
  let redacting: Promise<unknown> | undefined
  let writing: Promise<unknown> | undefined
  expect(() => {
    redacting = doc.redact(input)
    writing = doc.write(input)
  }).not.toThrow()
  await expect(redacting).rejects.toThrow()
  await expect(writing).rejects.toThrow()
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

test('pageInfo reports the page user unit', async () => {
  const scaled = await engine.open(await fixtureBytes('userunit-2'))
  expect((await scaled.pageInfo(0)).userUnit).toBe(2)
  await scaled.close()
})

test('renderPage passes its options to the core without the signal', async () => {
  const requests: Request[] = []
  const fake: Transport = {
    call: <T>(request: Request) => {
      requests.push(request)
      return Promise.resolve((request.op === 'open' ? { id: 1, pageCount: 1 } : {}) as T)
    },
    destroy: () => Promise.resolve(),
  }
  const opened = await engineOver(fake).open(bytes)
  const region = { x: 1, y: 2, width: 3, height: 4 }
  const hide = [5]
  const signal = new AbortController().signal
  const call = opened.renderPage(0, {
    region,
    rotation: 90,
    hide,
    annotations: false,
    signal,
  })
  // The options are copied when the call is made.
  region.x = 100
  hide.push(6)
  await call
  expect(requests.at(-1)).toEqual({
    op: 'renderPage',
    doc: 1,
    index: 0,
    options: {
      region: { x: 1, y: 2, width: 3, height: 4 },
      rotation: 90,
      hide: [5],
      annotations: false,
    },
  })
})

test('renderPage draws a region at an exact size, turned', async () => {
  const page = await doc.renderPage(0, {
    region: { x: 0, y: 692, width: 100, height: 100 },
    size: { width: 30, height: 60 },
    rotation: 270,
  })
  expect(page).toMatchObject({ width: 30, height: 60 })
  expect(page.data).toHaveLength(30 * 60 * 4)
})

test.each([
  ['scale with size', { scale: 2, size: { width: 10, height: 10 } }],
  ['a region of no width', { region: { x: 0, y: 0, width: 0, height: 10 } }],
  ['a size that is not whole', { size: { width: 0.5, height: 1 } }],
  ['a rotation off the quarter turns', { rotation: 45 }],
  ['a hide list of non-numbers', { hide: ['7'] }],
])(
  'renderPage with %s rejects with a RangeError and the engine goes on',
  async (_, options) => {
    await expect(doc.renderPage(0, options as never)).rejects.toBeInstanceOf(RangeError)
    expect((await doc.renderPage(0)).width).toBe(612)
  }
)

describe('fallback fonts', () => {
  const FONT_DIR = dirname(
    createRequire(import.meta.url).resolve('@inkbar/fonts/files/NotoSans-Regular.ttf')
  )
  const fontPath = (key: FontKey) => join(FONT_DIR, fontFiles[key])
  /** Served by the stubbed fetch below from the package's files; any other name is a 404. */
  const FONT_HOST = 'https://fonts.test/'
  const ALL = fontUrls(FONT_HOST)
  /** The page's two lines of text in the unembedded font, in pixels at scale 1 on A4. */
  const TEXT_BAND = { left: 72, right: 400, top: 842 - 790, bottom: 842 - 690 }

  let requests: string[]
  /** Called before a stubbed fetch answers, so a test can hold it. */
  let beforeAnswer: (url: string, signal: AbortSignal | undefined) => Promise<void>

  beforeEach(() => {
    requests = []
    beforeAnswer = () => Promise.resolve()
    vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push(url)
      await beforeAnswer(url, init?.signal ?? undefined)
      init?.signal?.throwIfAborted()
      const key = (Object.keys(fontFiles) as FontKey[]).find(
        (k) => url === FONT_HOST + fontFiles[k]
      )
      if (!key) return new Response('not found', { status: 404 })
      return new Response(await readFile(fontPath(key)))
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Pixels in the text band darker than mid grey. */
  function inked(page: RenderedPage): number {
    let count = 0
    for (let y = TEXT_BAND.top; y < TEXT_BAND.bottom; y++)
      for (let x = TEXT_BAND.left; x < TEXT_BAND.right; x++)
        if ((page.data[(y * page.width + x) * 4] as number) < 128) count++
    return count
  }

  /**
   * An engine in this thread over a module whose registrations are recorded. `misses()` takes
   * the keys the font mapper missed since the last call, and fails when one was registered:
   * the keys a page needs and the keys the mapper asks for would then disagree.
   */
  async function fontEngine(fallbackFonts?: EngineOptions['fallbackFonts']) {
    const native = await loadNative({ wasm })
    const registered = new Set<FontKey>()
    const fn: Native = {
      ...native.fn,
      INK_Fonts_Register: (bit, data, size) => {
        const ok = native.fn.INK_Fonts_Register(bit, data, size)
        if (ok) for (const key of keysOf(bit)) registered.add(key)
        return ok
      },
    }
    const core = new EngineCore(
      withFunctions(native, fn),
      fallbackFonts && { fallbackFonts }
    )
    const fonts = engineOver(new InThreadTransport(core))
    const misses = () => {
      const missed = keysOf(native.fn.INK_Fonts_TakeMisses())
      expect(missed.filter((key) => registered.has(key))).toEqual([])
      return missed
    }
    return { engine: fonts, registered, misses }
  }

  test('a file that names no unembedded font fetches nothing', async () => {
    const { engine: fonts, misses } = await fontEngine(ALL)
    for (const name of ['text-simple', 'unembedded-arial'] as const) {
      const opened = await fonts.open(await fixtureBytes(name))
      const page = await opened.renderPage(0)
      expect(page.missingFonts).toEqual([])
      misses()
    }
    expect(requests).toEqual([])
    await fonts.destroy()
  })

  test('every render lists its missing fonts, empty when there are none', async () => {
    const page = await doc.renderPage(0)
    expect(page.missingFonts).toEqual([])
    const opened = await engine.open(await fixtureBytes('unembedded-japanese'))
    expect((await opened.renderPage(0)).missingFonts).toEqual(['japanese'])
  })

  test('a page fetches the font it needs once, and draws its text with it', async () => {
    const { engine: fonts, misses } = await fontEngine({ japanese: ALL.japanese })
    const opened = await fonts.open(await fixtureBytes('unembedded-japanese'))
    const first = await opened.renderPage(0)
    expect(first.missingFonts).toEqual([])
    expect(misses()).toEqual([])
    expect(requests).toEqual([ALL.japanese])
    const again = await opened.renderPage(0)
    expect(again.missingFonts).toEqual([])
    expect(again.data).toEqual(first.data)
    expect(requests).toHaveLength(1)

    // Without the font the two lines are not drawn as text.
    const bare = await fontEngine()
    const page = await (
      await bare.engine.open(await fixtureBytes('unembedded-japanese'))
    ).renderPage(0)
    expect(page.missingFonts).toEqual(['japanese'])
    expect(bare.misses()).toEqual(['japanese'])
    expect(inked(first)).toBeGreaterThan(500)
    expect(inked(first)).toBeGreaterThan(inked(page) * 4)
    await bare.engine.destroy()
    await fonts.destroy()
  })

  test('with no fallback fonts a page still renders and lists what it missed', async () => {
    const plain = await createEngine({ wasm, worker: false })
    const opened = await plain.open(await fixtureBytes('unembedded-japanese'))
    const page = await opened.renderPage(0)
    expect(page.missingFonts).toEqual(['japanese'])
    expect(page.width).toBe(595)
    expect(requests).toEqual([])
    await plain.destroy()
  })

  test('a source that 404s is fetched once and listed as missing', async () => {
    const { engine: fonts, misses } = await fontEngine({
      japanese: `${FONT_HOST}nothing-here.otf`,
    })
    const opened = await fonts.open(await fixtureBytes('unembedded-japanese'))
    expect((await opened.renderPage(0)).missingFonts).toEqual(['japanese'])
    expect(misses()).toEqual(['japanese'])
    const other = await fonts.open(await fixtureBytes('unembedded-japanese'))
    expect((await other.renderPage(0)).missingFonts).toEqual(['japanese'])
    misses()
    expect(requests).toHaveLength(1)
    await fonts.destroy()
  })

  test('bytes the engine cannot use as a font fail the key for good', async () => {
    const { engine: fonts } = await fontEngine({ korean: new Uint8Array() })
    const opened = await fonts.open(await fixtureBytes('unembedded-korean'))
    expect((await opened.renderPage(0)).missingFonts).toEqual(['korean'])
    expect((await opened.renderPage(0)).missingFonts).toEqual(['korean'])
    await fonts.destroy()
  })

  test('no later redraw changes a page: lazy fonts equal fonts given up front', async () => {
    const japaneseBytes = new Uint8Array(await readFile(fontPath('japanese')))
    const japaneseFile = await fixtureBytes('unembedded-japanese')

    // Up front: a fresh engine given the bytes, and the page needing them is the first call.
    const upFront = await createEngine({
      wasm,
      worker: false,
      fallbackFonts: { japanese: japaneseBytes },
    })
    const expected = await (await upFront.open(japaneseFile)).renderPage(0, { scale: 2 })
    await upFront.destroy()

    // Lazy: the document is opened and read, another page is drawn, then the font is fetched.
    const { engine: lazy, misses } = await fontEngine({ japanese: ALL.japanese })
    const opened = await lazy.open(japaneseFile)
    await opened.pageInfo(0)
    await (await lazy.open(bytes)).renderPage(0)
    expect(requests).toEqual([])
    const actual = await opened.renderPage(0, { scale: 2 })
    expect(requests).toEqual([ALL.japanese])
    misses()
    expect(actual.missingFonts).toEqual([])
    expect(actual.width).toBe(expected.width)
    expect(Buffer.from(actual.data).equals(Buffer.from(expected.data))).toBe(true)
    await lazy.destroy()
  })

  test.each(['unembedded-cyrillic', 'unembedded-greek'] as const)(
    '%s draws its text with the default font',
    async (name) => {
      const { engine: fonts, misses } = await fontEngine({ default: ALL.default })
      const page = await (await fonts.open(await fixtureBytes(name))).renderPage(0)
      expect(page.missingFonts).toEqual([])
      expect(misses()).toEqual([])
      expect(requests).toEqual([ALL.default])
      expect(inked(page)).toBeGreaterThan(500)
      await fonts.destroy()
    }
  )

  test('in Node a path or a file: URL is read from disk', async () => {
    const fromDisk = await createEngine({
      wasm,
      worker: false,
      fallbackFonts: {
        japanese: fontPath('japanese'),
        korean: pathToFileURL(fontPath('korean')),
      },
    })
    for (const name of ['unembedded-japanese', 'unembedded-korean'] as const) {
      const page = await (await fromDisk.open(await fixtureBytes(name))).renderPage(0)
      expect(page.missingFonts, name).toEqual([])
      expect(inked(page), name).toBeGreaterThan(500)
    }
    expect(requests).toEqual([])
    await fromDisk.destroy()
  })

  test('an abort during a slow font fetch rejects, and a later render fetches the font', async () => {
    let arrived: (() => void) | undefined
    const waiting = new Promise<void>((resolve) => {
      arrived = resolve
    })
    beforeAnswer = (_url, signal) =>
      new Promise((_resolve, reject) => {
        arrived?.()
        signal?.addEventListener('abort', () => {
          reject(new DOMException('The fetch was aborted.', 'AbortError'))
        })
      })
    const { engine: fonts, registered } = await fontEngine({ japanese: ALL.japanese })
    const opened = await fonts.open(await fixtureBytes('unembedded-japanese'))
    const controller = new AbortController()
    const running = opened.renderPage(0, { signal: controller.signal })
    await waiting
    const started = performance.now()
    controller.abort()
    await expect(running).rejects.toMatchObject({ code: 'aborted' })
    expect(performance.now() - started).toBeLessThan(100)
    expect(registered.size).toBe(0)

    beforeAnswer = () => Promise.resolve()
    const page = await opened.renderPage(0)
    expect(page.missingFonts).toEqual([])
    expect(inked(page)).toBeGreaterThan(500)
    expect(requests).toEqual([ALL.japanese, ALL.japanese])
    await fonts.destroy()
  })

  test('destroy during a font fetch resolves and rejects the render', async () => {
    let arrived: (() => void) | undefined
    const waiting = new Promise<void>((resolve) => {
      arrived = resolve
    })
    beforeAnswer = () =>
      new Promise(() => {
        arrived?.()
      })
    const slowFonts = await createEngine({
      wasm,
      worker: false,
      fallbackFonts: { japanese: ALL.japanese },
    })
    const opened = await slowFonts.open(await fixtureBytes('unembedded-japanese'))
    const running = opened.renderPage(0)
    await waiting
    await expect(slowFonts.destroy()).resolves.toBeUndefined()
    await expect(running).rejects.toMatchObject({ code: 'aborted' })
  })

  /** A square annotation on page 0, clear of the text band. */
  const square = (): WriteInput => {
    const bounds = { x: 400, y: 300, width: 100, height: 80 }
    return {
      annotations: [
        {
          page: 0,
          annotation: {
            id: 'square',
            page: 0,
            rect: bounds,
            opacity: 1,
            type: 'square',
            width: 1,
          },
          appearance: {
            bounds,
            content: new TextEncoder().encode('0 0 1 rg 400 300 100 80 re f'),
          },
          data: '{"id":"square"}',
        },
      ],
    }
  }

  test('a write fetches the fonts of the pages it loads, so a later render draws them', async () => {
    const japaneseFile = await fixtureBytes('unembedded-japanese')
    // Up front: the font is registered before the document the write goes to is loaded.
    const upFront = await createEngine({
      wasm,
      worker: false,
      fallbackFonts: { japanese: new Uint8Array(await readFile(fontPath('japanese'))) },
    })
    await (await upFront.open(japaneseFile)).renderPage(0)
    const reference = await upFront.open(japaneseFile)
    await reference.write(square())
    const expected = await reference.renderPage(0)
    await upFront.destroy()

    const { engine: lazy, misses } = await fontEngine({ japanese: ALL.japanese })
    const opened = await lazy.open(japaneseFile)
    await opened.write(square())
    expect(requests).toEqual([ALL.japanese])
    misses()
    const actual = await opened.renderPage(0)
    misses()
    expect(actual.missingFonts).toEqual([])
    expect(inked(actual)).toBeGreaterThan(500)
    expect(Buffer.from(actual.data).equals(Buffer.from(expected.data))).toBe(true)
    expect(requests).toHaveLength(1)
    await lazy.destroy()
  })

  test('with fallback fonts, redact then save gives the same bytes whether or not the page was drawn first', async () => {
    const japaneseFile = await fixtureBytes('unembedded-japanese')
    const marks = [mark('m1', { page: 0, quad: [72, 785, 130, 785, 72, 755, 130, 755] })]
    const redactAndSave = async (drawFirst: boolean) => {
      const { engine: fonts, misses } = await fontEngine({ japanese: ALL.japanese })
      const opened = await fonts.open(japaneseFile)
      if (drawFirst) await opened.renderPage(0)
      await opened.redact({ marks })
      misses()
      const saved = await opened.save()
      await fonts.destroy()
      return withoutId(saved)
    }
    const drawn = await redactAndSave(true)
    const notDrawn = await redactAndSave(false)
    expect(notDrawn).toBe(drawn)
    expect(requests).toEqual([ALL.japanese, ALL.japanese])
  })

  test('a write or redact on pages that need no font fetches nothing', async () => {
    const { engine: fonts } = await fontEngine(ALL)
    const opened = await fonts.open(bytes)
    await opened.write(square())
    const other = await fonts.open(bytes)
    await other.redact({
      marks: [mark('m1', { page: 0, quad: [72, 700, 130, 700, 72, 680, 130, 680] })],
    })
    expect(requests).toEqual([])
    await fonts.destroy()
  })

  test('destroy during the font fetch of a write resolves and rejects the write', async () => {
    let arrived: (() => void) | undefined
    const waiting = new Promise<void>((resolve) => {
      arrived = resolve
    })
    beforeAnswer = () =>
      new Promise(() => {
        arrived?.()
      })
    const slowFonts = await createEngine({
      wasm,
      worker: false,
      fallbackFonts: { japanese: ALL.japanese },
    })
    const opened = await slowFonts.open(await fixtureBytes('unembedded-japanese'))
    const writing = opened.write(square())
    await waiting
    await expect(slowFonts.destroy()).resolves.toBeUndefined()
    await expect(writing).rejects.toMatchObject({ code: 'aborted' })
  })

  test('a render that fetches a font does not change what save writes', async () => {
    const { engine: fonts } = await fontEngine({ japanese: ALL.japanese })
    const opened = await fonts.open(await fixtureBytes('unembedded-japanese'))
    const before = await opened.save({ mode: 'rewrite' })
    await opened.renderPage(0)
    expect(requests).toHaveLength(1)
    expect(withoutId(await opened.save({ mode: 'rewrite' }))).toBe(withoutId(before))
    await fonts.destroy()
  })
})
