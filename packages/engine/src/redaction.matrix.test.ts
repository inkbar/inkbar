/*
 * Every fixture with regions, redacted through the engine and read back by readers that are not
 * PDFium: PDF.js for the text on each page and for the images and paths it paints, the file's
 * bytes with every stream inflated and every string decoded, and qpdf. The strict check, which is
 * PDFium, must also call every region clean. A fixture whose manifest entry says `refused` holds
 * content the apply leaves and the check sees: there the test asserts that the check fails.
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import {
  FIXTURE_NAMES,
  fixtureBytes,
  manifest,
  type FixtureName,
  type RedactionRegion as FixtureRegion,
} from '@inkbar/fixtures'
import { holdsText } from '@inkbar/fixtures/pdf-bytes'
import {
  qpdfAvailable,
  qpdfCheck,
  qpdfImages,
  qpdfQdf,
  requireQpdfInCi,
} from '@inkbar/fixtures/qpdf'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createEngine, EngineError, type Engine } from './index.ts'
import { mark, marksOf, quadOf, regionsOf } from './redaction/testing.ts'

import type { RedactionFindings } from './types.ts'

let engine: Engine

beforeAll(async () => {
  const wasm = await readFile(new URL('../vendor/inkbar-pdfium.wasm', import.meta.url))
  engine = await createEngine({ wasm, worker: false })
  requireQpdfInCi()
})

afterAll(async () => {
  await engine.destroy()
})

type Point = [number, number]
type Matrix = [number, number, number, number, number, number]

/** `m` applied first, then `ctm`, as a PDF `cm` composes. */
const compose = (m: readonly number[], ctm: Matrix): Matrix => {
  const [a, b, c, d, e, f] = m as Matrix
  const [A, B, C, D, E, F] = ctm
  return [
    a * A + b * C,
    a * B + b * D,
    c * A + d * C,
    c * B + d * D,
    e * A + f * C + E,
    e * B + f * D + F,
  ]
}

const apply = ([a, b, c, d, e, f]: Matrix, x: number, y: number): Point => [
  a * x + c * y + e,
  b * x + d * y + f,
]

/**
 * Whether `p` lies inside the quad with every edge moved `margin` inward (outward when it is
 * negative). The quad's corners are in Gloss order: top left, top right, bottom left, bottom
 * right.
 */
function insideQuad(quad: readonly number[], [x, y]: Point, margin: number): boolean {
  const [x1, y1, x2, y2, x3, y3, x4, y4] = quad as number[] as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const ring: Point[] = [
    [x1, y1],
    [x2, y2],
    [x4, y4],
    [x3, y3],
  ]
  let area = 0
  ring.forEach(([ax, ay], i) => {
    const [bx, by] = ring[(i + 1) % 4] as Point
    area += ax * by - bx * ay
  })
  const sign = Math.sign(area)
  return ring.every(([ax, ay], i) => {
    const [bx, by] = ring[(i + 1) % 4] as Point
    const length = Math.hypot(bx - ax, by - ay)
    return (sign * ((bx - ax) * (y - ay) - (by - ay) * (x - ax))) / length >= margin
  })
}

/** How far inside a region a painted point must be to count as under it, and outside to count as beside it. */
const MARGIN = 1

/** What the readers found on one page: its text, and painted points under and beside the regions. */
interface PageReading {
  text: string
  under: { image: number; drawing: number }
  beside: { image: number; drawing: number }
}

/** The part of PDF.js these readers use. */
interface PdfjsLib {
  OPS: Record<string, number>
  getDocument(options: object): {
    promise: Promise<PdfjsDocument>
    destroy(): Promise<void>
  }
}

interface PdfjsDocument {
  numPages: number
  getPage(number: number): Promise<PdfjsPage>
}

interface ObjectStore {
  get(id: string, callback: (value: unknown) => void): void
}

interface PdfjsPage {
  getTextContent(): Promise<{ items: ({ str: string } | object)[] }>
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>
  objs: ObjectStore
  commonObjs: ObjectStore
}

/** A decoded image as PDF.js hands it to its canvas. */
interface Decoded {
  width: number
  height: number
  /** 1: one bit a sample, 1 white; 2: RGB; 3: RGBA. Absent for a stencil mask. */
  kind?: number
  data: Uint8Array | Uint8ClampedArray
}

const require = createRequire(import.meta.url)
const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'))

async function withPdfjs<T>(
  bytes: Uint8Array,
  password: string | undefined,
  use: (pdf: PdfjsDocument, lib: PdfjsLib) => Promise<T>
): Promise<T> {
  const lib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsLib
  const task = lib.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    // The JPEG 2000 and JBIG2 decoders.
    wasmUrl: `${join(pdfjsRoot, 'wasm')}/`,
    ...(password !== undefined && { password }),
  })
  try {
    return await use(await task.promise, lib)
  } finally {
    await task.destroy()
  }
}

const fetchObject = (store: ObjectStore, id: string) =>
  new Promise<Decoded>((resolve) => {
    store.get(id, (value) => {
      resolve(value as Decoded)
    })
  })

/**
 * Whether sample `i` of a decoded image paints something other than paper: a dark or coloured
 * sample, or one a soft or explicit mask makes see-through. A redaction fills a hole with
 * opaque paper, and after JPEG compression that paper may be some levels off white.
 */
function painted(image: Decoded, i: number): boolean {
  const { data, width, kind } = image
  if (kind === undefined || kind === 1) {
    // One bit a sample: for an image 1 is white; for a stencil mask 1 is not painted.
    const stride = Math.ceil(width / 8)
    const row = Math.floor(i / width)
    const col = i % width
    return (((data[row * stride + (col >> 3)] as number) >> (7 - (col & 7))) & 1) === 0
  }
  const channels = kind === 2 ? 3 : 4
  const at = i * channels
  const darkest = Math.min(
    data[at] as number,
    data[at + 1] as number,
    data[at + 2] as number
  )
  return darkest < 160 || (channels === 4 && (data[at + 3] as number) < 200)
}

/** The page's regions, as fixture quads. */
const regionsOn = (regions: FixtureRegion[], page: number) =>
  regions.filter((r) => r.page === page).map((r) => r.quad)

/**
 * Counts `p` under a region or beside every region, or neither when it lies near an edge. With
 * `underOnly`, a point beside the regions is not counted.
 */
function tally(
  quads: number[][],
  p: Point,
  counts: { under: { [k: string]: number }; beside: { [k: string]: number } },
  kind: 'image' | 'drawing',
  underOnly = false
) {
  if (quads.some((q) => insideQuad(q, p, MARGIN))) counts.under[kind]! += 1
  else if (!underOnly && !quads.some((q) => insideQuad(q, p, -MARGIN)))
    counts.beside[kind]! += 1
}

/** The points of a PDF.js path, curves taken by their control points, as closed rings or lines. */
function flatten(data: ArrayLike<number>, ctm: Matrix): Point[][] {
  const runs: Point[][] = []
  let run: Point[] = []
  const sizes = [2, 2, 6, 4, 0]
  for (let at = 0; at < data.length;) {
    const code = data[at++] as number
    const size = sizes[code] ?? 0
    if (code === 0) {
      if (run.length) runs.push(run)
      run = []
    }
    for (let k = 0; k < size; k += 2)
      run.push(apply(ctm, data[at + k] as number, data[at + k + 1] as number))
    if (code === 4 && run.length) run.push(run[0] as Point)
    at += size
  }
  if (run.length) runs.push(run)
  return runs
}

/** Points along every segment of `runs`, at most 1 pt apart, ends included. */
function along(runs: Point[][]): Point[] {
  const points: Point[] = []
  for (const run of runs) {
    run.forEach((p, i) => {
      points.push(p)
      const next = run[i + 1]
      if (!next) return
      const steps = Math.ceil(Math.hypot(next[0] - p[0], next[1] - p[1]))
      for (let s = 1; s < steps; s++)
        points.push([
          p[0] + ((next[0] - p[0]) * s) / steps,
          p[1] + ((next[1] - p[1]) * s) / steps,
        ])
    })
  }
  return points
}

/** Whether `p` lies inside the rings with the non-zero or even-odd rule. */
function insideRings(runs: Point[][], [x, y]: Point, evenOdd: boolean): boolean {
  let winding = 0
  let crossings = 0
  for (const run of runs) {
    const ring = run.length && run[0] !== run.at(-1) ? [...run, run[0] as Point] : run
    for (let i = 0; i + 1 < ring.length; i++) {
      const [ax, ay] = ring[i] as Point
      const [bx, by] = ring[i + 1] as Point
      if (ay <= y !== by <= y) {
        const cx = ax + ((y - ay) * (bx - ax)) / (by - ay)
        if (cx > x) {
          crossings++
          winding += by > ay ? 1 : -1
        }
      }
    }
  }
  return evenOdd ? crossings % 2 === 1 : winding !== 0
}

/** Points 2 pt apart inside the regions, each at least MARGIN inside its region. */
function inside(quads: number[][]): Point[] {
  const points: Point[] = []
  for (const quad of quads) {
    const xs = quad.filter((_, i) => i % 2 === 0)
    const ys = quad.filter((_, i) => i % 2 === 1)
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 2)
      for (let y = Math.min(...ys); y <= Math.max(...ys); y += 2)
        if (insideQuad(quad, [x, y], MARGIN)) points.push([x, y])
  }
  return points
}

/** Black is an applied mark's overlay, white is paper: neither is content to these readers. */
const BLACK = new Set(['#000000', 'rgb(0, 0, 0)', '#ffffff', 'rgb(255, 255, 255)'])

/** An operator list as PDF.js gives one, for a page or inside a tiling pattern. */
interface OperatorList {
  fnArray: number[]
  argsArray: unknown[]
}

/**
 * What one page paints under and beside its regions, by its PDF.js operator list: each image
 * sample (by the centre of its cell) that is not paper, points along every path filled or
 * stroked in a colour other than black or white (an applied mark's overlay is black), and points 2 pt
 * apart inside the clip of every shading. A path filled with a tiling pattern also paints what
 * the pattern's cell draws, read once at the cell's own place and counted only under a region,
 * since a cell's place says nothing about what the pattern paints beside it. Text is left to the
 * text reader.
 *
 * A filled path also counts points 2 pt apart inside each region that lie inside it, by its fill
 * rule and its clips, so a fill that covers a region without an edge in it is seen there; after
 * an apply such a fill must have a hole where the region is. Points inside a fill count only
 * under a region, so the count beside the regions stays the count of outlines.
 *
 * It reads a pattern's cell once, at its own place, without tiling it. That suits these
 * fixtures, which give a pattern one cell where the content matters, and a hatch, whose cell
 * repeats what stays in view. It would miss a pattern whose content reaches a region only in a
 * repeated cell. Text inside a cell or a soft mask group is not read as page text either: the
 * byte reader covers those.
 */
async function paintedOn(
  page: PdfjsPage,
  lib: PdfjsLib,
  quads: number[][]
): Promise<Omit<PageReading, 'text'>> {
  const { OPS } = lib
  const counts = { under: { image: 0, drawing: 0 }, beside: { image: 0, drawing: 0 } }
  const fills = new Set([
    OPS.fill,
    OPS.eoFill,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ])
  const strokes = new Set([
    OPS.stroke,
    OPS.closeStroke,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ])
  const evenOddFills = new Set([OPS.eoFill, OPS.eoFillStroke, OPS.closeEOFillStroke])
  const store = (id: string) => (id.startsWith('g_') ? page.commonObjs : page.objs)
  const coloured = (colour: unknown) =>
    colour !== 'transparent' && !BLACK.has(colour as string)

  interface State {
    ctm: Matrix
    /** The matrix a pattern's own matrix starts from: the content stream's default space. */
    base: Matrix
    /** A colour string, or a pattern's PDF.js description. */
    fill: unknown
    stroke: unknown
    clips: { runs: Point[][]; evenOdd: boolean }[]
  }

  const walk = async (list: OperatorList, start: Matrix, depth: number) => {
    if (depth > 8) throw new Error('patterns nested too deep for these readers')
    let state: State = {
      ctm: start,
      base: start,
      fill: '#000000',
      stroke: '#000000',
      clips: [],
    }
    const stack: State[] = []
    const push = () => stack.push({ ...state, clips: [...state.clips] })
    const pop = () => {
      state = stack.pop() ?? state
    }
    let pendingClip: boolean | undefined

    const image = (decoded: Decoded) => {
      const { width, height } = decoded
      for (let i = 0; i < width * height; i++) {
        if (!painted(decoded, i)) continue
        const col = i % width
        const row = Math.floor(i / width)
        // Row 0 is the top of the unit square the image fills.
        tally(
          quads,
          apply(state.ctm, (col + 0.5) / width, 1 - (row + 0.5) / height),
          counts,
          'image',
          depth > 0
        )
      }
    }
    const pattern = async (colour: unknown) => {
      if (!Array.isArray(colour) || colour[0] !== 'TilingPattern') return
      const [, , cell, matrix] = colour as [
        string,
        unknown,
        OperatorList,
        number[] | null,
      ]
      await walk(cell, matrix ? compose(matrix, state.base) : state.base, depth + 1)
    }

    for (const [index, op] of list.fnArray.entries()) {
      const args = list.argsArray[index] as unknown[]
      switch (op) {
        case OPS.save:
          push()
          break
        case OPS.restore:
          pop()
          break
        case OPS.transform:
          state.ctm = compose(args as number[], state.ctm)
          break
        case OPS.paintFormXObjectBegin:
          push()
          if (args[0]) state.ctm = compose(args[0] as number[], state.ctm)
          state.base = state.ctm
          break
        case OPS.paintFormXObjectEnd:
        case OPS.endAnnotation:
          pop()
          break
        case OPS.beginAnnotation: {
          push()
          const [, , transform, matrix] = args as [unknown, unknown, number[], number[]]
          const ctm = compose(matrix, compose(transform, state.ctm))
          state = { ctm, base: ctm, fill: '#000000', stroke: '#000000', clips: [] }
          break
        }
        case OPS.setFillRGBColor:
        case OPS.setFillColorN:
          state.fill = op === OPS.setFillColorN ? args : args[0]
          break
        case OPS.setStrokeRGBColor:
        case OPS.setStrokeColorN:
          state.stroke = op === OPS.setStrokeColorN ? args : args[0]
          break
        case OPS.setFillTransparent:
          state.fill = 'transparent'
          break
        case OPS.setStrokeTransparent:
          state.stroke = 'transparent'
          break
        case OPS.clip:
        case OPS.eoClip:
          pendingClip = op === OPS.eoClip
          break
        case OPS.constructPath: {
          const [paint, [data]] = args as [number, [ArrayLike<number> | null]]
          const runs = data ? flatten(data, state.ctm) : []
          if (pendingClip !== undefined) {
            state.clips.push({ runs, evenOdd: pendingClip })
            pendingClip = undefined
          }
          const filled = fills.has(paint) && coloured(state.fill)
          const stroked = strokes.has(paint) && coloured(state.stroke)
          if (filled || stroked)
            for (const p of along(runs)) tally(quads, p, counts, 'drawing', depth > 0)
          if (filled) {
            const evenOdd = evenOddFills.has(paint)
            for (const p of inside(quads))
              if (
                insideRings(runs, p, evenOdd) &&
                state.clips.every((c) => insideRings(c.runs, p, c.evenOdd))
              )
                tally(quads, p, counts, 'drawing', true)
          }
          if (filled) await pattern(state.fill)
          if (stroked) await pattern(state.stroke)
          break
        }
        case OPS.shadingFill: {
          const all = state.clips.flatMap((c) => c.runs.flat())
          if (!all.length)
            throw new Error('a shading without a clip: these readers do not bound it')
          const xs = all.map(([x]) => x)
          const ys = all.map(([, y]) => y)
          for (let x = Math.min(...xs); x <= Math.max(...xs); x += 2)
            for (let y = Math.min(...ys); y <= Math.max(...ys); y += 2)
              if (state.clips.every((c) => insideRings(c.runs, [x, y], c.evenOdd)))
                tally(quads, [x, y], counts, 'drawing', depth > 0)
          break
        }
        case OPS.paintImageXObject:
          image(await fetchObject(store(args[0] as string), args[0] as string))
          break
        case OPS.paintInlineImageXObject:
          image(args[0] as Decoded)
          break
        case OPS.paintImageMaskXObject: {
          const mask = args[0] as Decoded & { data: Uint8Array | string }
          const decoded =
            typeof mask.data === 'string'
              ? await fetchObject(store(mask.data), mask.data)
              : mask
          // A stencil paints in the fill colour; black stencils are not used by these fixtures.
          const { kind: _, ...stencil } = decoded
          image(stencil)
          break
        }
        case OPS.paintImageMaskXObjectGroup:
        case OPS.paintInlineImageXObjectGroup:
        case OPS.paintImageXObjectRepeat:
        case OPS.paintImageMaskXObjectRepeat:
        case OPS.paintSolidColorImageMask:
          throw new Error(`operator ${op}: these readers do not read it`)
        default:
          break
      }
    }
  }

  await walk(await page.getOperatorList(), [1, 0, 0, 1, 0, 0], 0)
  return counts
}

/** What the readers find on every page of `bytes`. */
const readPages = (bytes: Uint8Array, regions: FixtureRegion[], password?: string) =>
  withPdfjs(bytes, password, async (pdf, lib) => {
    const pages: PageReading[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      pages.push({
        text: content.items.map((item) => ('str' in item ? item.str : '')).join(''),
        ...(await paintedOn(page, lib, regionsOn(regions, i - 1))),
      })
    }
    return pages
  })

const sum = (pages: PageReading[], side: 'under' | 'beside', kind: 'image' | 'drawing') =>
  pages.reduce((total, page) => total + page[side][kind], 0)

/** Every fixture with regions to redact. */
const rows = FIXTURE_NAMES.filter((name) => manifest[name].regions?.length)

/** Opens the fixture, redacts its regions, saves and closes. */
async function redacted(name: FixtureName): Promise<Uint8Array> {
  const { password } = manifest[name]
  const doc = await engine.open(await fixtureBytes(name), password ? { password } : {})
  try {
    await doc.redact({ marks: marksOf(name) })
    return await doc.save()
  } finally {
    await doc.close()
  }
}

/** The strict check of the fixture's regions on `bytes`, or the check-failed error. */
async function strictCheck(
  name: FixtureName,
  bytes: Uint8Array
): Promise<RedactionFindings | EngineError> {
  const { password } = manifest[name]
  return engine
    .checkRedaction(bytes, { regions: regionsOf(name), ...(password && { password }) })
    .catch((error: unknown) => {
      if (error instanceof EngineError && error.code === 'check-failed') return error
      throw error
    })
}

/**
 * Everything the file holds as text, as the bytes reader sees it. An encrypted file is read as
 * qpdf decrypts it, with the objects nothing refers to, which qpdf would otherwise drop.
 */
async function plainBytes(bytes: Uint8Array, password?: string): Promise<Uint8Array> {
  if (password === undefined) return bytes
  return new Uint8Array(
    Buffer.from(await qpdfQdf(bytes, { password, unreferenced: true }), 'latin1')
  )
}

const redactable = rows.filter((name) => manifest[name].refused === undefined)
const refused = rows.filter((name) => manifest[name].refused !== undefined)

describe('the fixtures', () => {
  test.each(rows)(
    '%s has content under its regions for the readers to find',
    async (name) => {
      const { secrets = [], regions = [], password, gone = [] } = manifest[name]
      const source = await fixtureBytes(name)
      const pages = await readPages(source, regions, password)
      const plain = await plainBytes(source, password)
      const marked = new Set(regions.map((r) => r.page))
      const found =
        secrets.some(
          (word) =>
            holdsText(plain, word) ||
            pages.some((p, i) => marked.has(i) && p.text.includes(word))
        ) ||
        sum(pages, 'under', 'image') > 0 ||
        sum(pages, 'under', 'drawing') > 0
      expect(found).toBe(true)
      for (const word of gone) expect(holdsText(plain, word), word).toBe(true)
    }
  )
})

test('the bytes reader sees an object nothing refers to in an encrypted file', async () => {
  // redact-file-encrypted holds a content stream drawing ORPHAN-OMEGA that no page uses.
  const source = await fixtureBytes('redact-file-encrypted')
  expect(holdsText(await plainBytes(source, 'inkbar'), 'ORPHAN-OMEGA')).toBe(true)
  // Without asking for them, qpdf leaves such objects out, and the word with them.
  const dropped = await qpdfQdf(source, { password: 'inkbar' })
  expect(holdsText(Buffer.from(dropped, 'latin1'), 'ORPHAN-OMEGA')).toBe(false)
})

describe.runIf(redactable.length)('redacted', () => {
  test.each(redactable)(
    '%s: the readers find nothing under the regions',
    async (name) => {
      const {
        secrets = [],
        keeps = [],
        regions = [],
        password,
        gone = [],
      } = manifest[name]
      const before = await readPages(await fixtureBytes(name), regions, password)
      const bytes = await redacted(name)

      // The strict check, which is PDFium, calls every region clean.
      const findings = await strictCheck(name, bytes)
      expect(findings).not.toBeInstanceOf(EngineError)
      const { candidates } = findings as RedactionFindings
      expect(candidates).toHaveLength(regions.length)
      for (const candidate of candidates)
        expect(candidate).toMatchObject({ verdict: 'clean' })

      // PDF.js: no secret on a page with a region, every kept string somewhere, nothing else.
      const after = await readPages(bytes, regions, password)
      const marked = new Set(regions.map((r) => r.page))
      after.forEach((page, i) => {
        if (marked.has(i))
          for (const word of secrets)
            expect(page.text, `page ${i}: ${word}`).not.toContain(word)
      })
      const text = after.map((p) => p.text).join('\n')
      for (const word of keeps) expect(text, word).toContain(word)
      const rest = keeps.reduce((left, word) => left.replaceAll(word, ''), text)
      expect(rest.replace(/[^A-Za-z0-9]/g, '')).toBe('')

      // Nothing painted under a region; what was painted beside them still is.
      expect(sum(after, 'under', 'image')).toBe(0)
      expect(sum(after, 'under', 'drawing')).toBe(0)
      for (const kind of ['image', 'drawing'] as const)
        expect(sum(after, 'beside', kind), kind).toBeGreaterThanOrEqual(
          Math.floor(sum(before, 'beside', kind) * 0.9)
        )

      // The bytes: no secret that is not also kept elsewhere, and no copy sanitising removes.
      const plain = await plainBytes(bytes, password)
      for (const word of secrets)
        if (!keeps.some((kept) => kept.includes(word)))
          expect(holdsText(plain, word), word).toBe(false)
      for (const word of gone) expect(holdsText(plain, word), word).toBe(false)

      if (qpdfAvailable) {
        expect(await qpdfCheck(bytes, password)).toEqual({ ok: true })
        // Every image left in the file, used or not: each must be one a page shows. Where the
        // images painted nothing beside the regions, every image left must be blank: one value.
        const painted = sum(before, 'under', 'image') + sum(before, 'beside', 'image')
        if (painted > 0) {
          const images = await qpdfImages(bytes, password)
          expect(images.filter((i) => !i.onPage).map((i) => i.ref)).toEqual([])
          if (sum(before, 'beside', 'image') === 0) {
            const source = await qpdfImages(await fixtureBytes(name), password)
            expect(source.some((i) => !flat(i.samples))).toBe(true)
            for (const image of images) expect(flat(image.samples), image.ref).toBe(true)
          }
        }
      }
    }
  )
})

/** Whether an image's samples are known and all one value. */
const flat = (samples: Uint8Array | undefined) =>
  samples !== undefined && samples.length > 0 && samples.every((b) => b === samples[0])

test.runIf(qpdfAvailable)('the image reader lists an image no page shows', async () => {
  // redact-copy-thumbnail's /Thumb is an image in the file that no page paints.
  const thumb = await qpdfImages(await fixtureBytes('redact-copy-thumbnail'))
  expect(thumb.map((i) => i.onPage)).toEqual([false])
  expect(flat(thumb[0]?.samples)).toBe(false)
  // An image a page shows, its soft mask, and a stencil, which qpdf's own page list leaves out.
  for (const [name, count] of [
    ['redact-image-smask', 2],
    ['redact-image-stencil', 1],
    ['redact-image-jpeg', 1],
  ] as const) {
    const images = await qpdfImages(await fixtureBytes(name))
    expect(
      images.map((i) => i.onPage),
      name
    ).toEqual(Array(count).fill(true))
    expect(
      images.every((i) => i.samples !== undefined),
      name
    ).toBe(true)
  }
})

test('the image used twice still paints all of itself on the unmarked page', async () => {
  const name = 'redact-image-shared'
  const regions = manifest[name].regions ?? []
  const [, before] = await readPages(await fixtureBytes(name), regions)
  const [, after] = await readPages(await redacted(name), regions)
  // Page 2 has no region, so everything it paints counts as beside one.
  expect(before?.beside.image).toBeGreaterThan(0)
  expect(after?.beside.image).toBe(before?.beside.image)
})

test('a redacted encrypted file still needs its password', async () => {
  const bytes = await redacted('redact-file-encrypted')
  await expect(
    withPdfjs(bytes, undefined, (pdf) => Promise.resolve(pdf.numPages))
  ).rejects.toMatchObject({
    name: 'PasswordException',
  })
  expect(await withPdfjs(bytes, 'inkbar', (pdf) => Promise.resolve(pdf.numPages))).toBe(1)
})

/**
 * For each refused fixture: the field the strict check reports, and what an independent reader
 * still finds in the saved file, which shows the refusal is needed. `secrets`: the byte reader
 * finds every secret. `drawing`: PDF.js paints drawing under a region (from a pattern's cell).
 * A string: the byte reader finds it. PDF.js reads neither a pattern's cell, a mask group nor an
 * annotation's appearance as page text, so with no secret in the page text after the apply, a
 * text finding comes from the pattern, the group or the loupe.
 */
const refusedBy: Partial<
  Record<FixtureName, { field: 'text' | 'image' | 'drawing'; remains: string }>
> = {
  'redact-text-pattern': { field: 'text', remains: 'secrets' },
  'redact-annotation-loupe': { field: 'text', remains: 'secrets' },
  'redact-drawing-pattern-past-mark': { field: 'drawing', remains: 'drawing' },
  'redact-drawing-pattern-side': { field: 'drawing', remains: 'drawing' },
  'redact-drawing-mesh': { field: 'drawing', remains: '/ShadingType 4' },
  'redact-drawing-function-shading': { field: 'drawing', remains: '/ShadingType 1' },
  'redact-drawing-mesh-pattern': { field: 'drawing', remains: '/ShadingType 4' },
  'redact-mask-group-past-mark': { field: 'text', remains: 'secrets' },
}

describe.runIf(refused.length)('refused', () => {
  test.each(refused)(
    '%s: the strict check fails, so the action refuses',
    async (name) => {
      const { secrets = [], regions = [], password } = manifest[name]
      const bytes = await redacted(name)
      const findings = await strictCheck(name, bytes)
      expect(findings).not.toBeInstanceOf(EngineError)
      const expected = refusedBy[name]
      expect(expected, 'refusedBy says what the check reports').toBeDefined()
      const { field, remains } = expected as NonNullable<typeof expected>
      expect((findings as RedactionFindings).candidates).toContainEqual(
        expect.objectContaining({ [field]: 'present', verdict: 'content-remains' })
      )
      const marked = new Set(regions.map((r) => r.page))
      const after = await readPages(bytes, regions, password)
      after.forEach((page, i) => {
        if (marked.has(i))
          for (const word of secrets)
            expect(page.text, `page ${i}: ${word}`).not.toContain(word)
      })
      // The content is still in the saved file.
      const plain = await plainBytes(bytes, password)
      if (remains === 'secrets') {
        expect(secrets.length).toBeGreaterThan(0)
        for (const word of secrets) expect(holdsText(plain, word), word).toBe(true)
      } else if (remains === 'drawing')
        expect(sum(after, 'under', 'drawing')).toBeGreaterThan(0)
      else expect(holdsText(plain, remains), remains).toBe(true)
    }
  )
})

/** The first image the first page paints, as PDF.js decodes it. */
const firstImage = (bytes: Uint8Array) =>
  withPdfjs(bytes, undefined, async (pdf, lib) => {
    const page = await pdf.getPage(1)
    const list = await page.getOperatorList()
    const at = list.fnArray.indexOf(lib.OPS.paintImageXObject as number)
    const [id] = list.argsArray[at] as [string]
    return fetchObject(page.objs, id)
  })

test('a turned mark over an image blanks the samples in its bounding box on the page', async () => {
  // A band 6 pt wide from (125, 190) down to (215, 100), turned 45 degrees, over the first page of
  // redact-image-shared: 64 by 32 samples over x 100..292, y 100..196, green in samples 36 to 59
  // across (x 208..280), 4 to 27 down (y 112..184). The band passes below the green; its bounding
  // box, x 122.9..217.1, reaches sample 39.
  const quad = [127.12, 192.12, 217.12, 102.12, 122.88, 187.88, 212.88, 97.88]
  const band = mark('band', { page: 0, quad })
  const greenColumns = (image: Decoded) => {
    const columns = new Set<number>()
    const channels = image.kind === 2 ? 3 : 4
    for (let i = 0; i < image.width * image.height; i++) {
      const [r, g, b] = image.data.subarray(i * channels, i * channels + 3)
      if ((r as number) < 60 && (g as number) > 120 && (b as number) < 60)
        columns.add(i % image.width)
    }
    return [...columns].sort((a, b) => a - b)
  }
  const span = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const source = await fixtureBytes('redact-image-shared')
  expect(greenColumns(await firstImage(source))).toEqual(span(36, 59))
  const doc = await engine.open(source)
  let bytes: Uint8Array
  try {
    await doc.redact({ marks: [band] })
    bytes = await doc.save()
  } finally {
    await doc.close()
  }
  // Samples 36 to 39 lie beside the band and inside its bounding box: they are blanked too.
  expect(greenColumns(await firstImage(bytes))).toEqual(span(40, 59))
  const findings = await engine.checkRedaction(bytes, {
    regions: [{ page: 0, quads: [quadOf(quad)] }],
  })
  expect(findings.candidates).toEqual([expect.objectContaining({ verdict: 'clean' })])
})

/**
 * A known limit of the check's second text test: it reads PDFium's text-extraction boxes, which
 * are upright on the page, so a turned glyph's box reaches past the glyph. Kept turned text close
 * to a turned mark's edge is then counted, and the action refuses though the apply kept the text
 * correctly. In redact-text-rotated, KEEP-GAMMA runs on the turned baseline 40 pt above
 * SECRET-ALPHA's (20 pt Helvetica): a mark whose top edge is 10 pt below that baseline is refused,
 * one 12 pt below it is not.
 */
test('kept turned text 10 pt from a turned mark is refused, and 12 pt from it is not', async () => {
  const at = (x: number, y: number) => ({
    x: 60 + 0.866025 * x - 0.5 * y,
    y: 120 + 0.5 * x + 0.866025 * y,
  })
  // The region of the fixture, in the turned text space, with its top edge at `top`.
  const quad = (top: number) => [
    ...Object.values(at(-5, top)),
    ...Object.values(at(158, top)),
    ...Object.values(at(-5, -6)),
    ...Object.values(at(158, -6)),
  ]
  const results = []
  for (const top of [30, 28]) {
    const doc = await engine.open(await fixtureBytes('redact-text-rotated'))
    let bytes: Uint8Array
    try {
      await doc.redact({ marks: [mark('near', { page: 0, quad: quad(top) })] })
      bytes = await doc.save()
    } finally {
      await doc.close()
    }
    const [page] = await readPages(bytes, [])
    expect(page?.text, `top ${top}`).toContain('KEEP-GAMMA')
    expect(page?.text, `top ${top}`).not.toContain('SECRET')
    const findings = await engine.checkRedaction(bytes, {
      regions: [{ page: 0, quads: [quadOf(quad(top))] }],
    })
    results.push(findings.candidates.map((c) => [c.text, c.verdict]))
  }
  expect(results).toEqual([[['present', 'content-remains']], [['none', 'clean']]])
})

test('the tiling pattern refusal is the text inside the pattern', async () => {
  const findings = await strictCheck(
    'redact-text-pattern',
    await redacted('redact-text-pattern')
  )
  expect(findings).toMatchObject({
    candidates: [{ kind: 'region', text: 'present', verdict: 'content-remains' }],
  })
})
