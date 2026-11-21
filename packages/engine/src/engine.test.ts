import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { fixtureBytes, manifest } from '@inkbar/fixtures'
import { generateSlowPage } from '@inkbar/fixtures/generate-large'
import { fontFiles, fontUrls } from '@inkbar/fonts'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import { engineOver } from './engine.ts'
import { FONT_FETCH_TIMEOUT_MS, keysOf } from './fonts.ts'
import {
  createEngine,
  EngineError,
  TEXT_GEOMETRY_STRIDE,
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

test('render options that are not an object, or cannot be copied, reject', async () => {
  await expect(doc.renderPage(0, null as never)).rejects.toThrow(RangeError)
  await expect(
    doc.renderPage(0, { region: () => undefined } as never)
  ).rejects.toMatchObject({ name: 'DataCloneError' })
  // The engine still draws.
  expect(await doc.renderPage(0)).toMatchObject({ width: 612, height: 792 })
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

describe('pageText', () => {
  test('gives a page its characters, boxes and fonts', async () => {
    const text = await doc.pageText(0)
    expect(text.count).toBeGreaterThan(0)
    expect(String.fromCodePoint(...text.codes)).toContain('Page 1')
    expect(text.codes.length).toBe(text.count)
    expect(text.geometry.length).toBe(text.count * TEXT_GEOMETRY_STRIDE)
    expect(TEXT_GEOMETRY_STRIDE).toBe(15)
    expect(text.flags.length).toBe(text.count)
    expect(text.fonts.length).toBe(text.count)
    for (const font of text.fonts) expect(font).toBeLessThan(text.fontTable.length)
    expect(text.fontTable[0]?.name).toContain('Helvetica')
    expect(text.fontTable[0]).toMatchObject({
      fixedPitch: false,
      serif: false,
      italic: false,
      bold: false,
      vertical: false,
    })
  })

  test('a page index outside the document rejects with a RangeError', async () => {
    await expect(doc.pageText(99)).rejects.toBeInstanceOf(RangeError)
    await expect(doc.pageText(-1)).rejects.toBeInstanceOf(RangeError)
    await expect(doc.pageText(0.5)).rejects.toBeInstanceOf(RangeError)
  })

  test('a page with no text gives four empty arrays', async () => {
    const blank = await engine.open(await fixtureBytes('scanned-no-text'))
    const text = await blank.pageText(0)
    expect(text.count).toBe(0)
    expect(text.codes).toHaveLength(0)
    expect(text.geometry).toHaveLength(0)
    expect(text.flags).toHaveLength(0)
    expect(text.fonts).toHaveLength(0)
  })

  test('a closed document rejects', async () => {
    await doc.close()
    await expect(doc.pageText(0)).rejects.toMatchObject({ code: 'engine-failure' })
  })

  test('a signal aborted before the call, or while the read waits, rejects as a render does', async () => {
    const read = vi.spyOn(EngineCore.prototype, 'pageText')
    try {
      const render = await doc
        .renderPage(0, { signal: AbortSignal.abort() })
        .catch((error: unknown) => error)
      await expect(doc.pageText(0, { signal: AbortSignal.abort() })).rejects.toEqual(
        render
      )
      const c = new AbortController()
      const first = doc.renderPage(0, { scale: 4 })
      const queued = doc.pageText(0, { signal: c.signal })
      c.abort()
      await expect(queued).rejects.toEqual(render)
      await expect(first).resolves.toMatchObject({ width: 2448 })
      // Neither read ran.
      expect(read).not.toHaveBeenCalled()
      // A signal that is not aborted changes nothing.
      expect(await doc.pageText(0, { signal: new AbortController().signal })).toEqual(
        await doc.pageText(0)
      )
    } finally {
      read.mockRestore()
    }
  })

  test('options that are not an object reject with a RangeError', async () => {
    await expect(doc.pageText(0, null as never)).rejects.toBeInstanceOf(RangeError)
    await expect(doc.pageText(0, 1 as never)).rejects.toBeInstanceOf(RangeError)
  })
})

describe('links, outline and named destinations', () => {
  const utf8 = (text: string) => new TextEncoder().encode(text)

  test("pageLinks gives every annotation and the links with the file's facts", async () => {
    const linked = await engine.open(await fixtureBytes('links'))
    const { annotations, links } = await linked.pageLinks(0)
    // The manifest gives only the file's total, so the pages' counts must add up to it.
    const total = manifest.links.annotations?.Link
    expect(total).toBeDefined()
    const rest = await Promise.all(
      Array.from({ length: manifest.links.pages - 1 }, (_, i) => linked.pageLinks(i + 1))
    )
    expect(links.length + rest.reduce((sum, page) => sum + page.links.length, 0)).toBe(
      total
    )
    expect(annotations.every((a) => a.subtype === 'Link')).toBe(true)
    expect(links).toHaveLength(annotations.length)
    expect(links[0]).toMatchObject({
      index: 0,
      rect: { x: 68, y: 696, width: 70, height: 18 },
      destination: { page: 1, fit: 'XYZ', args: [72, 600, null, null] },
    })
    const uri = links.find((l) => l.action?.uri !== undefined && l.quads === undefined)
    expect(uri?.action).toEqual({ kind: 'URI', uri: utf8('https://example.com/a') })
    const wrapped = links.find((l) => l.quads !== undefined)
    expect(wrapped?.quads).toHaveLength(16)
    expect(wrapped?.action?.uri).toEqual(utf8('https://example.com/wrapped'))
  })

  test('a javascript: link is a URI the engine passes on as bytes', async () => {
    const linked = await engine.open(await fixtureBytes('links'))
    const { links } = await linked.pageLinks(0)
    expect(links.map((l) => l.action?.kind)).toEqual(
      expect.arrayContaining(['URI', 'Named', 'GoToR', 'Launch'])
    )
    expect(links.map((l) => l.action?.uri)).toContainEqual(utf8('javascript:alert(1)'))
  })

  test('a page index outside the document rejects with a RangeError', async () => {
    await expect(doc.pageLinks(99)).rejects.toBeInstanceOf(RangeError)
    await expect(doc.pageLinks(-1)).rejects.toBeInstanceOf(RangeError)
    await expect(doc.pageLinks(0.5)).rejects.toBeInstanceOf(RangeError)
  })

  test('a page with no annotations gives two empty arrays', async () => {
    expect(await doc.pageLinks(0)).toEqual({ annotations: [], links: [] })
  })

  test('outline nests the items and keeps the flags, counts and actions', async () => {
    const outlined = await engine.open(await fixtureBytes('outline'))
    const { items, truncated } = await outlined.outline()
    expect(truncated).toBe(false)
    const shape = (list: typeof items): unknown[] =>
      list.map((i) => (i.children.length ? [i.title, shape(i.children)] : i.title))
    expect(shape(items)).toEqual([
      'Cover',
      ['Part One', ['Chapter 1', 'Chapter 2']],
      ['Part Two', ['Section A', 'Section B']],
      'Appendix',
      'Website',
      'Next page',
      'Broken',
    ])
    const part = items.find((i) => i.title === 'Part One')
    expect(part).toMatchObject({ bold: true, italic: false, count: -2 })
    const website = items.find((i) => i.title === 'Website')
    expect(website?.action).toEqual({
      kind: 'URI',
      uri: utf8('https://example.com/outline'),
    })
    expect(items.find((i) => i.title === 'Next page')?.action).toEqual({
      kind: 'Named',
      name: 'NextPage',
    })
    // A destination to the catalog names no page of the file: the page comes through as -1.
    expect(items.find((i) => i.title === 'Broken')?.destination).toMatchObject({
      page: -1,
    })
    const sectionB = items[2]?.children[1]
    expect(sectionB).toMatchObject({ italic: true, bold: false })
    expect(items[0]?.destination).toEqual({
      page: 0,
      fit: 'XYZ',
      args: [null, 700, null, null],
    })
  })

  test('a document with no outline gives no items', async () => {
    expect(await doc.outline()).toEqual({ items: [], truncated: false })
  })

  test('namedDestination resolves a name and gives undefined for one the file lacks', async () => {
    const outlined = await engine.open(await fixtureBytes('outline'))
    expect(await outlined.namedDestination(utf8('chapter-2'))).toEqual({
      page: 1,
      fit: 'XYZ',
      args: [72, 500, null, null],
    })
    expect(await outlined.namedDestination(utf8('appendix'))).toMatchObject({
      page: 4,
      fit: 'Fit',
    })
    expect(await outlined.namedDestination(utf8('nope'))).toBeUndefined()
    expect(await outlined.namedDestination(new Uint8Array(0))).toBeUndefined()
  })

  test('a name that is not bytes rejects with a RangeError', async () => {
    await expect(
      doc.namedDestination('x' as unknown as Uint8Array)
    ).rejects.toBeInstanceOf(RangeError)
  })

  test('a closed document rejects', async () => {
    await doc.close()
    await expect(doc.pageLinks(0)).rejects.toMatchObject({ code: 'engine-failure' })
    await expect(doc.outline()).rejects.toMatchObject({ code: 'engine-failure' })
    await expect(doc.namedDestination(utf8('x'))).rejects.toMatchObject({
      code: 'engine-failure',
    })
  })
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

/**
 * A two-page file: page 0 has one Latin line in Helvetica at the top, and page 1 is the page of
 * `japanese` (the `unembedded-japanese` fixture), whose objects it reuses as they are.
 */
function twoPages(japanese: Uint8Array): Uint8Array {
  const text = latin1(japanese)
  const body = (n: number) => {
    const match = new RegExp(`\\n${n} 0 obj\\n([\\s\\S]*?)\\nendobj`).exec(text)
    if (!match?.[1]) throw new Error(`object ${n} not found`)
    return match[1]
  }
  const content = 'BT /F1 24 Tf 72 760 Td (Latin line under the mark) Tj ET\n'
  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [10 0 R 3 0 R] /Count 2 >>',
    body(3),
    body(4),
    body(5),
    body(6),
    body(7),
    body(8),
    body(9),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 11 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let out = '%PDF-1.7\n'
  const offsets: number[] = []
  bodies.forEach((b, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${b}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(out, 'latin1'))
}

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
    const pageNeeds = vi.fn(native.fn.INK_Fonts_PageNeeds)
    const fn: Native = {
      ...native.fn,
      INK_Fonts_Register: (bit, data, size) => {
        const ok = native.fn.INK_Fonts_Register(bit, data, size)
        if (ok) for (const key of keysOf(bit)) registered.add(key)
        return ok
      },
      INK_Fonts_PageNeeds: pageNeeds,
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
    return { engine: fonts, registered, misses, pageNeeds }
  }

  test.each([
    ['without fallback fonts', undefined],
    ['with fallback fonts', { japanese: ALL.japanese }],
  ] as const)(
    'render, write and redact work where AbortSignal.any does not exist, %s',
    async (_, sources) => {
      const any = Object.getOwnPropertyDescriptor(AbortSignal, 'any')
      Reflect.deleteProperty(AbortSignal, 'any')
      try {
        expect('any' in AbortSignal).toBe(false)
        const { engine: fonts } = await fontEngine(sources)
        const file = await fixtureBytes('unembedded-japanese')
        const opened = await fonts.open(file)
        const page = await opened.renderPage(0, { signal: new AbortController().signal })
        expect(page.missingFonts).toEqual(sources ? [] : ['japanese'])
        await opened.write(square())
        const other = await fonts.open(file)
        await other.redact({
          marks: [mark('m1', { page: 0, quad: [72, 785, 130, 785, 72, 755, 130, 755] })],
        })
        expect((await other.save()).subarray(0, 5)).toEqual(PDF_MAGIC)
        await fonts.destroy()
      } finally {
        if (any) Object.defineProperty(AbortSignal, 'any', any)
      }
    }
  )

  test('with no fallback fonts, write and redact do not read which fonts a page needs', async () => {
    const { engine: fonts, pageNeeds } = await fontEngine()
    const file = await fixtureBytes('unembedded-japanese-field')
    const opened = await fonts.open(file)
    await opened.write({ ...square(), fields: { f: { value: '日本語' } } })
    const other = await fonts.open(await fixtureBytes('unembedded-japanese'))
    await other.redact({
      marks: [mark('m1', { page: 0, quad: [72, 785, 130, 785, 72, 755, 130, 755] })],
    })
    expect(pageNeeds).not.toHaveBeenCalled()
    // A render still lists what the page missed.
    const fresh = await fonts.open(await fixtureBytes('unembedded-japanese'))
    expect((await fresh.renderPage(0)).missingFonts).toEqual(['japanese'])
    expect(pageNeeds).toHaveBeenCalled()
    expect(requests).toEqual([])
    await fonts.destroy()
  })

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
    controller.abort()
    // The fetch answers only by rejecting on abort, so a rejection shows the abort reached it.
    await expect(running).rejects.toMatchObject({ code: 'aborted' })
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

  test('filling a field whose font is unembedded saves the same bytes whatever came first', async () => {
    // The field's /DA names the page's unembedded Japanese font through the form's /DR, and the
    // text written into its appearance depends on whether that font is registered.
    const file = await fixtureBytes('unembedded-japanese-field')
    const fill = { fields: { f: { value: '日本語' } } }
    const filled = async (drawFirst: boolean) => {
      const {
        engine: fonts,
        misses,
        registered,
      } = await fontEngine({
        japanese: ALL.japanese,
      })
      const opened = await fonts.open(file)
      if (drawFirst) await opened.renderPage(0)
      await opened.write(fill)
      expect(registered.has('japanese')).toBe(true)
      misses()
      const saved = await opened.save({ mode: 'rewrite' })
      await fonts.destroy()
      return withoutId(saved)
    }
    const drawn = await filled(true)
    const notDrawn = await filled(false)
    expect(notDrawn).toBe(drawn)
    expect(requests).toEqual([ALL.japanese, ALL.japanese])
  })

  test('a redact fetches the fonts of pages without marks before it applies', async () => {
    // Page 0 holds the mark over Latin text; only page 1 names the unembedded font.
    const japanese = await fixtureBytes('unembedded-japanese')
    const file = twoPages(japanese)
    const marks = [mark('m1', { page: 0, quad: [72, 785, 300, 785, 72, 755, 300, 755] })]
    const redacted = async (drawFirst: boolean) => {
      const {
        engine: fonts,
        misses,
        registered,
      } = await fontEngine({
        japanese: ALL.japanese,
      })
      const opened = await fonts.open(file)
      expect(opened.pageCount).toBe(2)
      if (drawFirst) await opened.renderPage(1)
      await opened.redact({ marks })
      // Registered before the apply loaded page 1: no miss for it.
      expect(registered.has('japanese')).toBe(true)
      expect(misses()).toEqual([])
      const saved = await opened.save()
      await fonts.destroy()
      return withoutId(saved)
    }
    const notDrawn = await redacted(false)
    expect(requests).toEqual([ALL.japanese])
    expect(notDrawn).toBe(await redacted(true))
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

  test('a font fetch that never answers holds a write for the bound only, and is tried again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      let arrived: (() => void) | undefined
      const waiting = new Promise<void>((resolve) => {
        arrived = resolve
      })
      beforeAnswer = () =>
        new Promise(() => {
          arrived?.()
        })
      const { engine: fonts, registered } = await fontEngine({ japanese: ALL.japanese })
      const opened = await fonts.open(await fixtureBytes('unembedded-japanese'))
      let written = false
      const writing = opened.write(square()).then(() => {
        written = true
      })
      await waiting
      await vi.advanceTimersByTimeAsync(FONT_FETCH_TIMEOUT_MS - 1)
      expect(written).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await writing
      expect(registered.size).toBe(0)
      // Not remembered as failed: the next call that needs the font fetches it again.
      beforeAnswer = () => Promise.resolve()
      const page = await opened.renderPage(0)
      expect(page.missingFonts).toEqual([])
      expect(requests).toEqual([ALL.japanese, ALL.japanese])
      await fonts.destroy()
    } finally {
      vi.useRealTimers()
    }
  })

  test('a render whose font fetch runs out lists the font as missing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      beforeAnswer = () => new Promise(() => {})
      const { engine: fonts } = await fontEngine({ japanese: ALL.japanese })
      const opened = await fonts.open(await fixtureBytes('unembedded-japanese'))
      const drawing = opened.renderPage(0)
      await vi.waitFor(() => {
        expect(requests).toHaveLength(1)
      })
      await vi.advanceTimersByTimeAsync(FONT_FETCH_TIMEOUT_MS)
      expect((await drawing).missingFonts).toEqual(['japanese'])
      await fonts.destroy()
    } finally {
      vi.useRealTimers()
    }
  })

  test('a text read fetches the font its page needs first, so a later render draws it', async () => {
    const japaneseFile = await fixtureBytes('unembedded-japanese')
    // Drawn first, as the engine draws a page with its fonts.
    const reference = await fontEngine({ japanese: ALL.japanese })
    const expected = await (await reference.engine.open(japaneseFile)).renderPage(0)
    await reference.engine.destroy()
    requests = []

    const { engine: fonts, misses } = await fontEngine({ japanese: ALL.japanese })
    const opened = await fonts.open(japaneseFile)
    const text = await opened.pageText(0)
    expect(text.count).toBeGreaterThan(0)
    expect(requests).toEqual([ALL.japanese])
    expect(misses()).toEqual([])
    const page = await opened.renderPage(0)
    expect(page.missingFonts).toEqual([])
    expect(inked(page)).toBeGreaterThan(500)
    expect(Buffer.from(page.data).equals(Buffer.from(expected.data))).toBe(true)
    expect(requests).toHaveLength(1)
    await fonts.destroy()
  })

  test('a text read and a render started together fetch the font once and draw it', async () => {
    const { engine: fonts, misses } = await fontEngine({ japanese: ALL.japanese })
    const opened = await fonts.open(await fixtureBytes('unembedded-japanese'))
    const [text, page] = await Promise.all([opened.pageText(0), opened.renderPage(0)])
    expect(text.count).toBeGreaterThan(0)
    expect(page.missingFonts).toEqual([])
    expect(inked(page)).toBeGreaterThan(500)
    expect(misses()).toEqual([])
    expect(requests).toEqual([ALL.japanese])
    await fonts.destroy()
  })

  test('a text read reads the same characters as one with the font given up front', async () => {
    const japaneseFile = await fixtureBytes('unembedded-japanese')
    const upFront = await createEngine({
      wasm,
      worker: false,
      fallbackFonts: { japanese: new Uint8Array(await readFile(fontPath('japanese'))) },
    })
    await (await upFront.open(japaneseFile)).renderPage(0)
    const expected = await (await upFront.open(japaneseFile)).pageText(0)
    await upFront.destroy()

    const { engine: lazy } = await fontEngine({ japanese: ALL.japanese })
    const actual = await (await lazy.open(japaneseFile)).pageText(0)
    expect(actual).toEqual(expected)
    await lazy.destroy()
  })

  test('a text read whose font cannot be fetched still gives the text, as a render still draws', async () => {
    const japaneseFile = await fixtureBytes('unembedded-japanese')
    const bare = await fontEngine()
    const without = await (await bare.engine.open(japaneseFile)).pageText(0)
    await bare.engine.destroy()

    const { engine: fonts, misses } = await fontEngine({
      japanese: `${FONT_HOST}nothing-here.otf`,
    })
    const opened = await fonts.open(japaneseFile)
    expect(await opened.pageText(0)).toEqual(without)
    // The read itself asked for the font, before anything was drawn.
    expect(requests).toEqual([`${FONT_HOST}nothing-here.otf`])
    expect(misses()).toEqual(['japanese'])
    expect((await opened.renderPage(0)).missingFonts).toEqual(['japanese'])
    misses()
    expect(requests).toHaveLength(1)
    await fonts.destroy()
  })

  test('an abort during the font fetch of a text read rejects it, and a later read fetches the font', async () => {
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
    const running = opened.pageText(0, { signal: controller.signal })
    await waiting
    controller.abort()
    // The fetch answers only by rejecting on abort, so a rejection shows the abort reached it.
    await expect(running).rejects.toMatchObject({ code: 'aborted' })
    expect(registered.size).toBe(0)

    beforeAnswer = () => Promise.resolve()
    expect((await opened.pageText(0)).count).toBeGreaterThan(0)
    expect(registered.has('japanese')).toBe(true)
    expect(requests).toEqual([ALL.japanese, ALL.japanese])
    await fonts.destroy()
  })

  test('destroy during the font fetch of a text read resolves and rejects the read', async () => {
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
    const reading = opened.pageText(0)
    await waiting
    await expect(slowFonts.destroy()).resolves.toBeUndefined()
    await expect(reading).rejects.toMatchObject({ code: 'aborted' })
  })

  test('links, the outline and named destinations load no font', async () => {
    const { engine: fonts, misses } = await fontEngine({ japanese: ALL.japanese })
    const opened = await fonts.open(await fixtureBytes('unembedded-japanese'))
    await opened.pageLinks(0)
    await opened.outline()
    await opened.namedDestination(new TextEncoder().encode('nowhere'))
    // Nothing fetched, and the font mapper was not asked for the page's font.
    expect(requests).toEqual([])
    expect(misses()).toEqual([])
    // So nothing stands in for it when the page is drawn.
    const page = await opened.renderPage(0)
    expect(inked(page)).toBeGreaterThan(500)
    await fonts.destroy()
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
