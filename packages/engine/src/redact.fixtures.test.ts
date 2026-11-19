import { readFile } from 'node:fs/promises'

import { fixtureBytes, manifest, type FixtureName } from '@inkbar/fixtures'
import { holdsText } from '@inkbar/fixtures/pdf-bytes'
import { qpdfAvailable, qpdfCheck, requireQpdfInCi } from '@inkbar/fixtures/qpdf'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createEngine, EngineError, type Engine } from './index.ts'
import { EngineCore } from './native/core.ts'
import { loadNative } from './native/module.ts'
import { withFunctions } from './native/testing.ts'
import { ascii, boundsOf, mark, marksOf } from './redaction/testing.ts'

import type { Native } from './native/functions.ts'
import type { RedactInput, RedactResult, WriteAnnotation } from './types.ts'
import type { Annotation as GlossAnnotation, Quad } from 'gloss-format'

let engine: Engine
let wasm: Uint8Array
/** Every file a test saved, for the closing `qpdf --check`. */
const saves: { name: string; bytes: Uint8Array }[] = []

beforeAll(async () => {
  wasm = await readFile(new URL('../vendor/inkbar-pdfium.wasm', import.meta.url))
  engine = await createEngine({ wasm, worker: false })
  requireQpdfInCi()
})

afterAll(async () => {
  await engine.destroy()
})

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1')
/** A saved file with its /ID blanked: PDFium makes a new one on every save of these fixtures. */
const withoutId = (bytes: Uint8Array) =>
  latin1(bytes).replace(/\/ID\s*\[\s*<[0-9A-F]*>\s*<[0-9A-F]*>\s*\]/i, '/ID[]')

/**
 * Opens the fixture, redacts its regions as marks with `extra` added to the input, saves and
 * closes. The saved file is kept for qpdf.
 */
async function redacted(
  fixture: FixtureName,
  extra: Partial<RedactInput> = {}
): Promise<{ bytes: Uint8Array; result: RedactResult }> {
  const doc = await engine.open(await fixtureBytes(fixture))
  try {
    const result = await doc.redact({ marks: marksOf(fixture), ...extra })
    const bytes = await doc.save()
    saves.push({ name: fixture, bytes })
    return { bytes, result }
  } finally {
    await doc.close()
  }
}

/** The part of a PDF.js page these tests use. */
interface PdfjsPage {
  getTextContent(): Promise<{ items: ({ str: string } | object)[] }>
  getAnnotations(options?: {
    intent?: string
  }): Promise<{ subtype: string; fieldName?: string; id: string }[]>
  getOperatorList(options?: {
    annotationMode?: number
  }): Promise<{ fnArray: number[]; argsArray: unknown[] }>
  objs: { get(id: string, callback: (value: unknown) => void): void }
}

interface PdfjsDocument {
  numPages: number
  getPage(number: number): Promise<PdfjsPage>
  getFieldObjects(): Promise<Map<string, unknown> | null>
}

async function withPdfjs<T>(
  bytes: Uint8Array,
  use: (pdf: PdfjsDocument, lib: { OPS: Record<string, number> }) => Promise<T>,
  password?: string
): Promise<T> {
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = lib.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
    isOffscreenCanvasSupported: false,
    ...(password !== undefined && { password }),
  })
  try {
    return await use(await task.promise, lib)
  } finally {
    await task.destroy()
  }
}

/** The text PDF.js reads from each page. */
const pageTexts = (bytes: Uint8Array) =>
  withPdfjs(bytes, async (pdf) => {
    const texts: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent()
      texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(''))
    }
    return texts
  })

/** The annotations PDF.js reads from a page, by page index. */
const annotationsOf = (bytes: Uint8Array, page = 0) =>
  withPdfjs(bytes, async (pdf) =>
    (await pdf.getPage(page + 1)).getAnnotations({ intent: 'any' })
  )

/** Checks the secrets are gone and the kept text is there, by PDF.js and in the bytes. */
async function expectClean(fixture: FixtureName, bytes: Uint8Array) {
  const { secrets = [], keeps = [] } = manifest[fixture]
  const text = (await pageTexts(bytes)).join('\n')
  for (const word of keeps) expect(text, word).toContain(word)
  for (const word of secrets) {
    expect(text, word).not.toContain(word)
    expect(holdsText(bytes, word), word).toBe(false)
  }
}

test('removes the text under a mark and keeps the text beside it', async () => {
  const { bytes, result } = await redacted('redact-text')
  expect(result.pages).toEqual([{ page: 0, marks: 1, annotationsRemoved: 0 }])
  await expectClean('redact-text', bytes)
  if (qpdfAvailable) expect(await qpdfCheck(bytes)).toEqual({ ok: true })
})

/** The samples of each image the first page paints, as PDF.js decodes them. */
const pageImages = (bytes: Uint8Array) =>
  withPdfjs(bytes, async (pdf, lib) => {
    const page = await pdf.getPage(1)
    const list = await page.getOperatorList()
    const ids = list.fnArray.flatMap((op, i) =>
      op === lib.OPS.paintImageXObject ? [(list.argsArray[i] as [string])[0]] : []
    )
    return Promise.all(
      ids.map(
        (id) =>
          new Promise<{ width: number; height: number; data: Uint8Array }>((resolve) => {
            page.objs.get(id, (image) => {
              resolve(image as { width: number; height: number; data: Uint8Array })
            })
          })
      )
    )
  })

test('blanks the image samples under a mark', async () => {
  const red = (image: { width: number; height: number; data: Uint8Array }) => {
    const channels = image.data.length / (image.width * image.height)
    const columns: number[] = []
    for (let i = 0; i < image.width * image.height; i++) {
      const [r, g, b] = image.data.subarray(i * channels, i * channels + 3)
      if ((r as number) > 200 && (g as number) < 60 && (b as number) < 60)
        columns.push(i % image.width)
    }
    return columns
  }
  const [before] = await pageImages(await fixtureBytes('redact-image-flate'))
  expect(before && red(before).length).toBe(110)
  const { bytes } = await redacted('redact-image-flate')
  const [after] = await pageImages(bytes)
  expect(after).toBeDefined()
  const image = after as NonNullable<typeof after>
  // The fixture is red in its left half and in its last column; the mark covers the left half.
  const left = red(image).filter((column) => column < image.width / 2)
  expect(left).toEqual([])
  const kept = red(image)
  expect(kept.length).toBe(image.height)
  expect(new Set(kept)).toEqual(new Set([image.width - 1]))
})

type Point = [number, number]

/**
 * The points of every path the first page draws in its own content, in user space. Paths
 * inside form XObjects, such as an applied mark's overlay, are left out.
 */
const pagePaths = (bytes: Uint8Array) =>
  withPdfjs(bytes, async (pdf, lib) => {
    const page = await pdf.getPage(1)
    const list = await page.getOperatorList()
    const paths: Point[][] = []
    let ctm = [1, 0, 0, 1, 0, 0]
    const stack: number[][] = []
    let forms = 0
    const apply = (x: number, y: number): Point => [
      (ctm[0] as number) * x + (ctm[2] as number) * y + (ctm[4] as number),
      (ctm[1] as number) * x + (ctm[3] as number) * y + (ctm[5] as number),
    ]
    list.fnArray.forEach((op, i) => {
      const args = list.argsArray[i] as unknown[]
      if (op === lib.OPS.paintFormXObjectBegin) forms++
      else if (op === lib.OPS.paintFormXObjectEnd) forms--
      else if (forms > 0) return
      else if (op === lib.OPS.save) stack.push(ctm)
      else if (op === lib.OPS.restore) ctm = stack.pop() ?? ctm
      else if (op === lib.OPS.transform) {
        const [a, b, c, d, e, f] = args as number[]
        const [A, B, C, D, E, F] = ctm as [number, number, number, number, number, number]
        ctm = [
          (a as number) * A + (b as number) * C,
          (a as number) * B + (b as number) * D,
          (c as number) * A + (d as number) * C,
          (c as number) * B + (d as number) * D,
          (e as number) * A + (f as number) * C + E,
          (e as number) * B + (f as number) * D + F,
        ]
      } else if (op === lib.OPS.constructPath) {
        const [data] = args[1] as [ArrayLike<number> | null]
        if (!data) return
        const points: Point[] = []
        const sizes = [2, 2, 6, 4, 0]
        for (let at = 0; at < data.length;) {
          const code = data[at++] as number
          const size = sizes[code] ?? 0
          for (let k = 0; k < size; k += 2)
            points.push(apply(data[at + k] as number, data[at + k + 1] as number))
          at += size
        }
        paths.push(points)
      }
    })
    return paths
  })

test('cuts a path under a mark', async () => {
  const region = boundsOf(manifest['redact-path'].regions?.[0]?.quad ?? [])
  const inside = ([x, y]: Point) =>
    x > region.x + 0.5 &&
    x < region.x + region.width - 0.5 &&
    y > region.y + 0.5 &&
    y < region.y + region.height - 0.5
  const before = (await pagePaths(await fixtureBytes('redact-path'))).flat()
  expect(before.some(inside)).toBe(true)
  const { bytes } = await redacted('redact-path')
  const after = await pagePaths(bytes)
  expect(after.flat().filter(inside)).toEqual([])
  // The star's points outside the mark remain: its top point is at (150, 210).
  expect(
    after.flat().some(([x, y]) => Math.abs(x - 150) < 1 && Math.abs(y - 210) < 1)
  ).toBe(true)
  // The square beside the mark is whole.
  const square = after.find((points) =>
    points.some(([x, y]) => Math.abs(x - 260) < 0.01 && Math.abs(y - 120) < 0.01)
  )
  expect(square).toBeDefined()
  expect(
    square?.some(([x, y]) => Math.abs(x - 320) < 0.01 && Math.abs(y - 180) < 0.01)
  ).toBe(true)
})

test('removes annotations a mark overlaps and reports the count', async () => {
  const { bytes, result } = await redacted('redact-annotations')
  // The stamp, the widget and the note, and the note's pop-up, which goes with it.
  expect(result.pages).toEqual([{ page: 0, marks: 1, annotationsRemoved: 4 }])
  const left = await annotationsOf(bytes)
  expect(left.map((a) => [a.subtype, a.fieldName])).toEqual([['Widget', 'kept']])
  const fields = await withPdfjs(bytes, async (pdf) => [
    ...((await pdf.getFieldObjects())?.keys() ?? []),
  ])
  expect(fields).toEqual(['kept'])
  await expectClean('redact-annotations', bytes)
})

test("leaves another program's mark and counts it", async () => {
  const { bytes, result } = await redacted('redact-foreign-mark')
  expect(result.foreignMarks).toBe(1)
  expect(result.pages).toEqual([{ page: 0, marks: 1, annotationsRemoved: 0 }])
  await expectClean('redact-foreign-mark', bytes)
  const [, second] = await pageTexts(bytes)
  expect(second).toContain('SECRET-GAMMA')
  expect((await annotationsOf(bytes, 1)).map((a) => a.subtype)).toEqual(['Redact'])
})

test("leaves an opaque overlay in the mark's place", async () => {
  const { bytes } = await redacted('redact-text')
  expect(latin1(bytes).match(/\/INKB_Overlay\s+true/g)).toHaveLength(1)
  expect(await annotationsOf(bytes)).toEqual([])
  const forms = await withPdfjs(bytes, async (pdf, lib) => {
    const list = await (await pdf.getPage(1)).getOperatorList()
    return list.fnArray.filter((op) => op === lib.OPS.paintFormXObjectBegin).length
  })
  expect(forms).toBe(1)
})

/** A square over the region of redact-text, as an annotation to write after the apply. */
function squareOverMark(): WriteAnnotation {
  const rect = { x: 60, y: 195, width: 40, height: 20 }
  return {
    page: 0,
    annotation: {
      id: 'square-1',
      type: 'square',
      page: 0,
      rect,
      color: '#0000ff',
      opacity: 1,
      width: 1,
    } satisfies GlossAnnotation,
    appearance: { bounds: rect, content: ascii('0 0 1 RG 60.5 195.5 39 19 re S') },
    data: '{"id":"square-1"}',
  }
}

test('writes the other annotations after the apply', async () => {
  const { bytes, result } = await redacted('redact-text', {
    annotations: [squareOverMark()],
  })
  expect(result.pages).toEqual([{ page: 0, marks: 1, annotationsRemoved: 0 }])
  expect((await annotationsOf(bytes)).map((a) => a.subtype)).toEqual(['Square'])
  await expectClean('redact-text', bytes)
})

test('skips a form value whose field a mark removed', async () => {
  const { bytes, result } = await redacted('redact-annotations', {
    fields: { hidden: { value: 'NEW-HIDDEN' }, kept: { value: 'NEW-KEPT' } },
  })
  expect(result.fieldsSkipped).toEqual(['hidden'])
  const values = await withPdfjs(bytes, async (pdf) => {
    const objects = (await pdf.getFieldObjects()) as Map<string, { value: unknown }[]>
    return Object.fromEntries([...objects].map(([name, [first]]) => [name, first?.value]))
  })
  expect(values).toEqual({ kept: 'NEW-KEPT' })
  expect(holdsText(bytes, 'NEW-HIDDEN')).toBe(false)
  // A name the opened file never had is refused, as `write` refuses it.
  const doc = await engine.open(await fixtureBytes('redact-annotations'))
  try {
    await expect(
      doc.redact({
        marks: marksOf('redact-annotations'),
        fields: { missing: { value: 'x' } },
      })
    ).rejects.toMatchObject({ code: 'write-failed' })
  } finally {
    await doc.close()
  }
})

test('skips a mark with no area and one outside the page', async () => {
  const flat = mark('flat', { page: 0, quad: [50, 200, 200, 200, 50, 200, 200, 200] })
  const away = mark('away', {
    page: 0,
    quad: [1000, 1100, 1100, 1100, 1000, 1000, 1100, 1000],
  })
  const doc = await engine.open(await fixtureBytes('redact-text'))
  try {
    const result = await doc.redact({ marks: [flat, away] })
    expect(result.pages).toEqual([])
    const bytes = await doc.save()
    expect(await annotationsOf(bytes)).toEqual([])
    expect((await pageTexts(bytes))[0]).toContain('SECRET-ALPHA')
  } finally {
    await doc.close()
  }
})

test('redacts a mark with no quads by its rectangle, not its appearance bounds', async () => {
  const [over] = marksOf('redact-text') as [WriteAnnotation]
  const { quads: _, ...annotation } = over.annotation
  // The appearance reaches across KEEP-BETA; only the rectangle may say what is removed.
  const bounds = { x: 40, y: 185, width: 350, height: 45 }
  const wide: WriteAnnotation = {
    ...over,
    annotation: annotation as GlossAnnotation,
    appearance: { bounds, content: ascii('0 g 40 185 350 45 re f') },
  }
  const doc = await engine.open(await fixtureBytes('redact-text'))
  try {
    const result = await doc.redact({ marks: [wide] })
    expect(result.pages).toEqual([{ page: 0, marks: 1, annotationsRemoved: 0 }])
    await expectClean('redact-text', await doc.save())
  } finally {
    await doc.close()
  }
})

/** The file's one word, Encrypted, runs from x 72 to 135 on the baseline y 700. */
const earlierMark = () =>
  mark('earlier', { page: 0, quad: [70, 715, 95, 715, 70, 695, 95, 695] })

/** `encrypted-aes` saved with one Inkbar mark only, so the mark comes back locked. */
async function withEarlierMark(): Promise<Uint8Array> {
  const first = await engine.open(await fixtureBytes('encrypted-aes'), {
    password: 'inkbar',
  })
  try {
    await first.write({ annotations: [earlierMark()] })
    return await first.save()
  } finally {
    await first.close()
  }
}

test("applies Inkbar's own earlier marks in an encrypted file", async () => {
  const password = 'inkbar'
  const marked = await withEarlierMark()
  const doc = await engine.open(marked, { password })
  try {
    const result = await doc.redact({ marks: [] })
    expect(result.ownLockedMarks).toBe(1)
    expect(result.foreignMarks).toBe(0)
    expect(result.pages).toEqual([{ page: 0, marks: 1, annotationsRemoved: 0 }])
    // The region it applied, read from the mark before the apply removed it.
    expect(result.ownLockedRegions).toEqual([
      { page: 0, quads: (earlierMark().annotation as { quads: unknown }).quads },
    ])
    const bytes = await doc.save()
    const text = await withPdfjs(
      bytes,
      async (pdf) => {
        const content = await (await pdf.getPage(1)).getTextContent()
        return content.items.map((item) => ('str' in item ? item.str : '')).join('')
      },
      password
    )
    expect(text).not.toContain('Enc')
    expect(text).toContain('pted')
  } finally {
    await doc.close()
  }
})

test('reports no earlier regions for a file without earlier marks', async () => {
  const { result } = await redacted('redact-text')
  expect(result.ownLockedRegions).toEqual([])
  const doc = await engine.open(await fixtureBytes('encrypted-aes'), {
    password: 'inkbar',
  })
  try {
    const plain = await doc.redact({ marks: [] })
    expect(plain.ownLockedRegions).toEqual([])
  } finally {
    await doc.close()
  }
})

test('earlier marks whose regions cannot be read name the page', async () => {
  const marked = await withEarlierMark()
  const native = await loadNative({ wasm })
  const failing: Native = { ...native.fn, INK_Redact_OwnLockedQuads: () => -1 }
  const core = new EngineCore(withFunctions(native, failing))
  const { id } = core.open(marked, { password: 'inkbar' })
  let error: unknown
  try {
    core.redact(id, { marks: [] })
  } catch (caught) {
    error = caught
  }
  expect(error).toBeInstanceOf(EngineError)
  expect(error).toMatchObject({ code: 'redaction-failed', page: 0 })
  core.destroy()
})

test('earlier marks applied with no regions to check fail the page', async () => {
  const marked = await withEarlierMark()
  const native = await loadNative({ wasm })
  // The fork reads no quads from the earlier mark, yet applies it.
  const blind: Native = { ...native.fn, INK_Redact_OwnLockedQuads: () => 0 }
  const core = new EngineCore(withFunctions(native, blind))
  const { id } = core.open(marked, { password: 'inkbar' })
  let error: unknown
  try {
    core.redact(id, { marks: [] })
  } catch (caught) {
    error = caught
  }
  expect(error).toBeInstanceOf(EngineError)
  expect(error).toMatchObject({
    code: 'redaction-failed',
    page: 0,
    reason: 'could-not-inspect',
  })
  expect(core.stopped).toBe(false)
  core.destroy()
})

test('sanitises', async () => {
  expect(latin1(await fixtureBytes('redact-text'))).toContain('/Info')
  const { bytes, result } = await redacted('redact-text')
  expect(result.sanitised).toEqual({
    metadata: true,
    attachments: 0,
    scripts: false,
    thumbnails: false,
    privateData: false,
  })
  expect(holdsText(bytes, '/Info')).toBe(false)
  expect(holdsText(bytes, 'Redaction fixture')).toBe(false)
  expect(result.hiddenLayers).toBe(false)
  expect(result.signed).toBe(false)
})

test('refuses an incremental save after a redact', async () => {
  const doc = await engine.open(await fixtureBytes('redact-text'))
  try {
    await doc.redact({ marks: marksOf('redact-text') })
    await expect(doc.save({ mode: 'incremental' })).rejects.toBeInstanceOf(RangeError)
    // With no mode it rewrites.
    const bytes = await doc.save()
    expect(latin1(bytes).match(/%%EOF/g)).toHaveLength(1)
  } finally {
    await doc.close()
  }
})

test('reopens the document after a failed redact', async () => {
  const source = await fixtureBytes('redact-drawing-hatch')
  const untouched = await engine.open(source)
  const expected = withoutId(await untouched.save())
  await untouched.close()

  const doc = await engine.open(source)
  try {
    // A mark in an empty corner applies; the next, over the hatch, is refused.
    await doc.redact({
      marks: [mark('corner', { page: 0, quad: [10, 30, 30, 30, 10, 10, 30, 10] })],
    })
    const error: unknown = await doc
      .redact({ marks: marksOf('redact-drawing-hatch') })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(EngineError)
    expect(error).toMatchObject({
      code: 'redaction-failed',
      page: 0,
      reason: 'unremovable-content',
      marks: ['mark-1'],
    })
    expect(withoutId(await doc.save())).toBe(expected)
  } finally {
    await doc.close()
  }
})

test('a page whose marks cannot be applied names the page and leaves the document as opened', async () => {
  const native = await loadNative({ wasm })
  const failing: Native = { ...native.fn, INK_Redact_ApplyPage: () => -1 }
  const core = new EngineCore(withFunctions(native, failing))
  const source = await fixtureBytes('redact-text')
  const { id } = core.open(source)
  const expected = withoutId(core.save(id, undefined))
  let error: unknown
  try {
    core.redact(id, { marks: marksOf('redact-text') })
  } catch (caught) {
    error = caught
  }
  expect(error).toBeInstanceOf(EngineError)
  expect(error).toMatchObject({ code: 'redaction-failed', page: 0 })
  expect((error as EngineError).annotation).toBeUndefined()
  expect(withoutId(core.save(id, undefined))).toBe(expected)
  core.destroy()
})

test('refuses a write after a redact', async () => {
  const doc = await engine.open(await fixtureBytes('redact-text'))
  try {
    await doc.redact({ marks: marksOf('redact-text') })
    const refused: unknown = await doc
      .write({ annotations: [squareOverMark()] })
      .catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(RangeError)
    expect((refused as Error).message).toMatch(/new document/)
    const bytes = await doc.save()
    await expectClean('redact-text', bytes)
    expect(await annotationsOf(bytes)).toEqual([])
  } finally {
    await doc.close()
  }
})

test('allows a second redact', async () => {
  const doc = await engine.open(await fixtureBytes('redact-text'))
  try {
    await doc.redact({ marks: marksOf('redact-text') })
    const result = await doc.redact({ marks: marksOf('redact-text') })
    expect(result.pages).toEqual([{ page: 0, marks: 1, annotationsRemoved: 0 }])
    await expect(doc.save({ mode: 'incremental' })).rejects.toBeInstanceOf(RangeError)
    await expectClean('redact-text', await doc.save())
  } finally {
    await doc.close()
  }
})

test('rewrites a signed file', async () => {
  const source = await fixtureBytes('signed')
  // The opened file's one revision ends with its own cross-reference offset; a rewrite of the
  // redacted document puts its cross-reference elsewhere.
  const startxref = /startxref\s+\d+\s+%%EOF/.exec(latin1(source))?.[0]
  expect(startxref).toBeDefined()
  const doc = await engine.open(source)
  try {
    const result = await doc.redact({
      marks: [
        mark('signed-mark', { page: 0, quad: [72, 760, 300, 760, 72, 700, 300, 700] }),
      ],
    })
    expect(result.signed).toBe(true)
    const bytes = await doc.save()
    const text = latin1(bytes)
    expect(text.match(/%%EOF/g)).toHaveLength(1)
    expect(text).not.toContain(startxref)
    expect(text.startsWith(latin1(source.subarray(0, source.length - 20)))).toBe(false)
    saves.push({ name: 'signed', bytes })
  } finally {
    await doc.close()
  }
})

test('reports hidden layers', async () => {
  const { bytes, result } = await redacted('redact-hidden-layer')
  expect(result.hiddenLayers).toBe(true)
  expect(result.sanitised.metadata).toBe(false)
  await expectClean('redact-hidden-layer', bytes)
})

test('a report it cannot read rejects with redaction-failed and keeps the engine', async () => {
  const native = await loadNative({ wasm })
  const report = (text: string) => {
    const bytes = new TextEncoder().encode(`${text}\0`)
    const pointer = native.fn.malloc(bytes.length)
    native.HEAPU8.set(bytes, pointer)
    return pointer
  }
  const fn: Native = { ...native.fn, INK_Inspect_File: () => report('{not json') }
  const core = new EngineCore(withFunctions(native, fn))
  const { id } = core.open(await fixtureBytes('redact-text'))
  let error: unknown
  try {
    core.redact(id, { marks: marksOf('redact-text') })
  } catch (caught) {
    error = caught
  }
  expect(error).toMatchObject({ name: 'EngineError', code: 'redaction-failed' })
  expect(core.stopped).toBe(false)
  expect(core.save(id, undefined).length).toBeGreaterThan(0)
  core.destroy()
})

test('missing or malformed input is a RangeError and keeps the engine', async () => {
  const native = await loadNative({ wasm })
  const core = new EngineCore(native)
  const { id } = core.open(await fixtureBytes('redact-text'))
  for (const input of [
    undefined,
    null,
    {},
    { marks: 'x' },
    { marks: [], remove: 3 },
    { marks: [], annotations: {} },
    { marks: [], fields: 'x' },
    { marks: [null] },
  ])
    expect(() => core.redact(id, input as never), JSON.stringify(input)).toThrow(
      RangeError
    )
  expect(core.stopped).toBe(false)
  core.destroy()
})

test('a mark with no appearance, or with quads or a rect it cannot use, is a RangeError and keeps the engine', async () => {
  const [good] = marksOf('redact-text') as [WriteAnnotation]
  const { quads: _, ...noQuads } = good.annotation
  const corner = { x: 1, y: 2 }
  const quad = { p1: corner, p2: corner, p3: corner, p4: corner }
  const bad: [string, unknown][] = [
    ['no appearance', { ...good, appearance: undefined }],
    ['an appearance that is not an object', { ...good, appearance: 'x' }],
    ['quads that are not a list', { ...good, annotation: { ...noQuads, quads: 'x' } }],
    ['a quad that is not an object', { ...good, annotation: { ...noQuads, quads: [1] } }],
    [
      'a quad without a corner',
      { ...good, annotation: { ...noQuads, quads: [{ ...quad, p4: undefined }] } },
    ],
    [
      'a quad with a number that is not finite',
      {
        ...good,
        annotation: { ...noQuads, quads: [{ ...quad, p2: { x: Infinity, y: 2 } }] },
      },
    ],
    [
      'a quad with a corner that is not a number',
      { ...good, annotation: { ...noQuads, quads: [{ ...quad, p3: { x: '1', y: 2 } }] } },
    ],
    ['no quads and no rect', { ...good, annotation: { ...noQuads, rect: undefined } }],
    [
      'an annotation that is not a redaction, with quads and no rect',
      { ...good, annotation: { ...good.annotation, type: 'highlight', rect: undefined } },
    ],
    [
      'an annotation of no known type',
      { ...good, annotation: { ...good.annotation, type: 'nonsense' } },
    ],
    [
      'empty quads and a rect that is not finite',
      {
        ...good,
        annotation: {
          ...noQuads,
          quads: [],
          rect: { x: 0, y: 0, width: NaN, height: 1 },
        },
      },
    ],
    [
      'no quads and a rect with a side missing',
      { ...good, annotation: { ...noQuads, rect: { x: 0, y: 0, width: 10 } } },
    ],
  ]
  const own = await createEngine({ wasm, worker: false })
  try {
    for (const [what, item] of bad) {
      const doc = await own.open(await fixtureBytes('redact-text'))
      try {
        const error: unknown = await doc
          .redact({ marks: [item as WriteAnnotation] })
          .catch((e: unknown) => e)
        expect(error, what).toBeInstanceOf(RangeError)
      } finally {
        await doc.close()
      }
    }
    // The engine still opens and redacts another document.
    const doc = await own.open(await fixtureBytes('redact-text'))
    try {
      const result = await doc.redact({ marks: marksOf('redact-text') })
      expect(result.pages).toEqual([{ page: 0, marks: 1, annotationsRemoved: 0 }])
      await expectClean('redact-text', await doc.save())
    } finally {
      await doc.close()
    }
  } finally {
    await own.destroy()
  }
})

test('a mark with a quad that has no area beside a quad over text fails closed', async () => {
  const [over] = marksOf('redact-text') as [WriteAnnotation]
  const annotation = over.annotation as GlossAnnotation & { quads: Quad[] }
  const [first] = annotation.quads as [Quad]
  // A line along the bottom edge of the region: no area.
  const flat: Quad = { p1: first.p3, p2: first.p4, p3: first.p3, p4: first.p4 }
  const several: WriteAnnotation = {
    ...over,
    annotation: { ...annotation, quads: [flat, first] },
  }
  const doc = await engine.open(await fixtureBytes('redact-text'))
  try {
    // The fork cannot look under a quad with no area, so the apply refuses and changes nothing.
    const error: unknown = await doc.redact({ marks: [several] }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(EngineError)
    expect(error).toMatchObject({
      code: 'redaction-failed',
      page: 0,
      reason: 'could-not-inspect',
    })
    expect((await pageTexts(await doc.save()))[0]).toContain('SECRET-ALPHA')
  } finally {
    await doc.close()
  }
  // The same mark without the flat quad applies.
  const { bytes } = await redacted('redact-text', {
    marks: [{ ...over, annotation: { ...annotation, quads: [first] } }],
  })
  await expectClean('redact-text', bytes)
})

describe.runIf(qpdfAvailable)('qpdf', () => {
  test('accepts every file the tests saved', async () => {
    expect(saves.length).toBeGreaterThan(0)
    for (const { name, bytes } of saves)
      expect(await qpdfCheck(bytes), name).toEqual({ ok: true })
  })
})

describe('refuses a mark over content the apply cannot remove', () => {
  /** The bytes a save gives of `fixture` as opened, with nothing done to it. */
  async function untouched(fixture: FixtureName): Promise<string> {
    const doc = await engine.open(await fixtureBytes(fixture))
    try {
      return withoutId(await doc.save())
    } finally {
      await doc.close()
    }
  }

  test.each<[FixtureName, string[]]>([
    ['redact-drawing-pattern-past-mark', ['pattern']],
    ['redact-drawing-hatch', ['pattern']],
    ['redact-drawing-pattern-side', ['pattern']],
    ['redact-drawing-mesh', ['shading']],
    ['redact-drawing-function-shading', ['shading']],
    ['redact-drawing-mesh-pattern', ['shading']],
    ['redact-mask-group-past-mark', ['mask-group']],
    ['redact-text-pattern', ['pattern']],
    ['redact-drawing-sampled-axial', ['shading']],
    // The carrier lies wholly under the mark, so an apply would drop it with its only use; the
    // engine refuses all the same, since it cannot show nothing else keeps it in the file.
    ['redact-drawing-pattern', ['pattern']],
    ['check-pattern-text', ['pattern']],
    ['redact-mask-group-under-mark', ['mask-group']],
    ['redact-drawing-mesh-under-mark', ['shading']],
  ])('%s, and changes nothing', async (fixture, kinds) => {
    const expected = await untouched(fixture)
    const doc = await engine.open(await fixtureBytes(fixture))
    try {
      const error: unknown = await doc
        .redact({ marks: marksOf(fixture) })
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(EngineError)
      expect(error).toMatchObject({
        code: 'redaction-failed',
        reason: 'unremovable-content',
        page: 0,
        marks: ['mark-1'],
        kinds,
      })
      expect(withoutId(await doc.save())).toBe(expected)
    } finally {
      await doc.close()
    }
  })

  test('names only the marks over such content', async () => {
    const [overPattern] = marksOf('redact-drawing-hatch') as [WriteAnnotation]
    // Below the hatched band, over nothing the apply cannot remove.
    const plain = mark('plain', { page: 0, quad: [20, 90, 380, 90, 20, 30, 380, 30] })
    const error: unknown = await (async () => {
      const doc = await engine.open(await fixtureBytes('redact-drawing-hatch'))
      try {
        return await doc.redact({ marks: [plain, overPattern] })
      } catch (e) {
        return e
      } finally {
        await doc.close()
      }
    })()
    expect(error).toMatchObject({
      code: 'redaction-failed',
      reason: 'unremovable-content',
      marks: ['mark-1'],
      kinds: ['pattern'],
    })
  })

  test.each<FixtureName>(['redact-text', 'redact-image-flate', 'redact-path'])(
    'still redacts %s',
    async (fixture) => {
      const { result } = await redacted(fixture)
      expect(result.pages).toEqual([{ page: 0, marks: 1, annotationsRemoved: 0 }])
    }
  )

  /** `redact` on a core whose INK_Redact_Unremovable answers `answer`. */
  async function withAnswer(answer: (fn: Native) => number) {
    const native = await loadNative({ wasm })
    const fn: Native = { ...native.fn, INK_Redact_Unremovable: () => answer(native.fn) }
    const core = new EngineCore(withFunctions(native, fn))
    const source = await fixtureBytes('redact-text')
    const { id } = core.open(source)
    const expected = withoutId(core.save(id, undefined))
    let error: unknown
    try {
      core.redact(id, { marks: marksOf('redact-text') })
    } catch (caught) {
      error = caught
    }
    const after = withoutId(core.save(id, undefined))
    core.destroy()
    return { error, unchanged: after === expected }
  }

  const report = (native: { fn: Native; HEAPU8: Uint8Array }, text: string) => {
    const bytes = new TextEncoder().encode(`${text}\0`)
    const pointer = native.fn.malloc(bytes.length)
    native.HEAPU8.set(bytes, pointer)
    return pointer
  }

  test('a page it could not look at is could-not-inspect', async () => {
    const { error, unchanged } = await withAnswer(() => 0)
    expect(error).toMatchObject({
      code: 'redaction-failed',
      reason: 'could-not-inspect',
      page: 0,
    })
    expect(unchanged).toBe(true)
  })

  test.each([
    ['not JSON', '{nope'],
    ['no regions', '{}'],
    ['too few regions', '{"regions":[]}'],
    [
      'a count that is not a count',
      '{"regions":[{"index":0,"patterns":-1,"shadings":0,"maskGroups":0,"glyphs":0}]}',
    ],
    [
      'an index out of order',
      '{"regions":[{"index":1,"patterns":0,"shadings":0,"maskGroups":0,"glyphs":0}]}',
    ],
  ])('a report with %s is could-not-inspect', async (_, text) => {
    const native = await loadNative({ wasm })
    const fn: Native = {
      ...native.fn,
      INK_Redact_Unremovable: () =>
        report({ fn: native.fn, HEAPU8: native.HEAPU8 }, text),
    }
    const core = new EngineCore(withFunctions(native, fn))
    const { id } = core.open(await fixtureBytes('redact-text'))
    let error: unknown
    try {
      core.redact(id, { marks: marksOf('redact-text') })
    } catch (caught) {
      error = caught
    }
    expect(error).toMatchObject({
      code: 'redaction-failed',
      reason: 'could-not-inspect',
      page: 0,
    })
    expect(core.stopped).toBe(false)
    core.destroy()
  })
})
