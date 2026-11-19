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
import { ascii, boundsOf, mark, marksOf, quadOf, regionsOf } from './redaction/testing.ts'

import type { RedactionFindings, WriteAnnotation } from './types.ts'
import type { Annotation as GlossAnnotation } from 'gloss-format'

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

/**
 * What a page paints, by kind: image samples, paths in the page's own content and forms, what a
 * tiling pattern's cell draws, and shadings (painted with `sh` or filling a path as a pattern).
 * Two kinds count the same paths again by what paints them: `patterned`, a path filled or stroked
 * with a tiling or shading pattern, and `masked`, a path painted under a soft mask.
 */
type Kind = 'image' | 'drawing' | 'cell' | 'shading' | 'patterned' | 'masked'
type Counts = Record<Kind, number>
const zero = (): Counts => ({
  image: 0,
  drawing: 0,
  cell: 0,
  shading: 0,
  patterned: 0,
  masked: 0,
})

/** What the readers found on one page: its text, and painted points under and beside the regions. */
/** A run of page text as PDF.js reads it, with the corners of its box on the page. */
interface TextItem {
  str: string
  corners: Point[]
}

interface PageReading {
  text: string
  items: TextItem[]
  under: Counts
  beside: Counts
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
  counts: { under: Counts; beside: Counts },
  kind: Kind,
  underOnly = false
) {
  if (quads.some((q) => insideQuad(q, p, MARGIN))) counts.under[kind] += 1
  else if (!underOnly && !quads.some((q) => insideQuad(q, p, -MARGIN)))
    counts.beside[kind] += 1
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

const BLACK = new Set(['#000000', 'rgb(0, 0, 0)'])

/**
 * The boxes an applied mark's overlay fills: its appearance bounds, the region's bounding box
 * grown by 3 pt on every side (see `mark` in redaction/testing.ts), as left, bottom, right, top.
 */
const overlayBoxes = (quads: number[][]) =>
  quads.map((quad) => {
    const { x, y, width, height } = boundsOf(quad)
    return [x - 3, y - 3, x + width + 3, y + height + 3]
  })

/**
 * Whether a path is an applied mark's overlay: filled black, and its points span exactly one of
 * `boxes`. Only that is left out; any other black drawing counts. Genuine black content that
 * fills exactly a mark's appearance box would be left out too; no fixture has any.
 */
function isOverlay(runs: Point[][], fill: unknown, boxes: number[][]): boolean {
  if (!BLACK.has(fill as string)) return false
  const points = runs.flat()
  if (!points.length) return false
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const span = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  return boxes.some((box) =>
    box.every((v, i) => Math.abs(v - (span[i] as number)) < 0.05)
  )
}

/**
 * The miter tips of a stroked path's corners: at each corner where two segments meet at an angle
 * theta, a mitred join reaches 1 / sin(theta / 2) times half the line width from the vertex along
 * the outward bisector, drawn when that ratio is within the miter limit. Points 1 pt apart from
 * each vertex out to its tip.
 */
function miterPoints(runs: Point[][], halfWidth: number, limit: number): Point[] {
  const points: Point[] = []
  const unit = ([x, y]: Point): Point => {
    const length = Math.hypot(x, y)
    return length ? [x / length, y / length] : [0, 0]
  }
  for (const run of runs) {
    const closed =
      run.length > 3 && run[0]?.[0] === run.at(-1)?.[0] && run[0]?.[1] === run.at(-1)?.[1]
    const ring = closed ? run.slice(0, -1) : run
    ring.forEach((vertex, i) => {
      if (!closed && (i === 0 || i === ring.length - 1)) return
      const prev = ring[(i - 1 + ring.length) % ring.length] as Point
      const next = ring[(i + 1) % ring.length] as Point
      const u = unit([prev[0] - vertex[0], prev[1] - vertex[1]])
      const v = unit([next[0] - vertex[0], next[1] - vertex[1]])
      const cos = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))
      const theta = Math.acos(cos)
      if (theta < 1e-6 || theta > Math.PI - 1e-6) return
      const ratio = 1 / Math.sin(theta / 2)
      if (ratio > limit) return
      const inward = unit([u[0] + v[0], u[1] + v[1]])
      const reach = halfWidth * ratio
      for (let d = 0; d <= reach; d += 1)
        points.push([vertex[0] - inward[0] * d, vertex[1] - inward[1] * d])
      points.push([vertex[0] - inward[0] * reach, vertex[1] - inward[1] * reach])
    })
  }
  return points
}

/** An operator list as PDF.js gives one, for a page or inside a tiling pattern. */
interface OperatorList {
  fnArray: number[]
  argsArray: unknown[]
}

/**
 * What one page paints under and beside its regions, by its PDF.js operator list: each image
 * sample (by the centre of its cell) that is not paper (`image`), points along every path filled
 * or stroked (`drawing`), the miter tips of a stroke's mitred corners included, and
 * points 2 pt apart inside the clip of every `sh` (`shading`). A path filled with a tiling pattern
 * also paints what the pattern's cell draws (`cell`), read once at the cell's own place and
 * counted only under a region, since a cell's place says nothing about what the pattern paints
 * beside it. A path filled with a shading pattern counts the points inside it as `shading`. Text
 * is left to the text reader, and the content of a soft mask's group is skipped: a group masks,
 * it does not paint. The byte reader covers text a group holds, and the image reader
 * (`qpdfImages`, run on every redacted row) covers an image in one; nothing here reads a group's
 * paths.
 *
 * An applied mark's overlay, a black fill spanning exactly the mark's appearance bounds, is left
 * out; any other black drawing counts.
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
): Promise<Omit<PageReading, 'text' | 'items'>> {
  const { OPS } = lib
  const counts = { under: zero(), beside: zero() }
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
  const coloured = (colour: unknown) => colour !== 'transparent'
  const overlays = overlayBoxes(quads)

  interface State {
    ctm: Matrix
    /** The matrix a pattern's own matrix starts from: the content stream's default space. */
    base: Matrix
    /** A colour string, or a pattern's PDF.js description. */
    fill: unknown
    stroke: unknown
    clips: { runs: Point[][]; evenOdd: boolean }[]
    lineWidth: number
    join: number
    miterLimit: number
    /** Whether a soft mask is set. */
    masked: boolean
  }

  const walk = async (list: OperatorList, start: Matrix, depth: number) => {
    if (depth > 8) throw new Error('patterns nested too deep for these readers')
    let state: State = {
      ctm: start,
      base: start,
      fill: '#000000',
      stroke: '#000000',
      clips: [],
      lineWidth: 1,
      join: 0,
      miterLimit: 10,
      masked: false,
    }
    const stack: State[] = []
    const push = () => stack.push({ ...state, clips: [...state.clips] })
    const pop = () => {
      state = stack.pop() ?? state
    }
    let pendingClip: boolean | undefined
    /** How deep inside soft mask groups the walk is: their content is skipped. */
    let maskGroups = 0
    const drawn: Kind = depth > 0 ? 'cell' : 'drawing'

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
      if (op === OPS.beginGroup || op === OPS.endGroup) {
        if ((args[0] as { smask?: unknown } | undefined)?.smask)
          maskGroups += op === OPS.beginGroup ? 1 : -1
        continue
      }
      if (maskGroups > 0) continue
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
          state = {
            ctm,
            base: ctm,
            fill: '#000000',
            stroke: '#000000',
            clips: [],
            lineWidth: 1,
            join: 0,
            miterLimit: 10,
            masked: false,
          }
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
        case OPS.setGState:
          for (const [key, value] of args[0] as [string, unknown][])
            if (key === 'SMask') state.masked = Boolean(value)
          break
        case OPS.setLineWidth:
          state.lineWidth = args[0] as number
          break
        case OPS.setLineJoin:
          state.join = args[0] as number
          break
        case OPS.setMiterLimit:
          state.miterLimit = args[0] as number
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
          if (fills.has(paint) && isOverlay(runs, state.fill, overlays)) break
          const filled = fills.has(paint) && coloured(state.fill)
          const stroked = strokes.has(paint) && coloured(state.stroke)
          if (stroked && state.join === 0) {
            const [a, b, c, d] = state.ctm
            const half =
              (Math.abs(state.lineWidth) * Math.sqrt(Math.abs(a * d - b * c))) / 2
            for (const p of miterPoints(runs, half, state.miterLimit))
              tally(quads, p, counts, drawn, depth > 0)
          }
          const carrier = (colour: unknown) =>
            Array.isArray(colour) &&
            (colour[0] === 'TilingPattern' || colour[0] === 'Shading')
          const patterned =
            (filled && carrier(state.fill)) || (stroked && carrier(state.stroke))
          const masked = state.masked && (filled || stroked)
          if (filled || stroked)
            for (const p of along(runs)) {
              tally(quads, p, counts, drawn, depth > 0)
              if (patterned) tally(quads, p, counts, 'patterned', depth > 0)
              if (masked) tally(quads, p, counts, 'masked', depth > 0)
            }
          if (filled) {
            const evenOdd = evenOddFills.has(paint)
            const shaded = Array.isArray(state.fill) && state.fill[0] === 'Shading'
            for (const p of inside(quads))
              if (
                insideRings(runs, p, evenOdd) &&
                state.clips.every((c) => insideRings(c.runs, p, c.evenOdd))
              ) {
                tally(quads, p, counts, shaded ? 'shading' : drawn, true)
                if (patterned) tally(quads, p, counts, 'patterned', true)
                if (masked) tally(quads, p, counts, 'masked', true)
              }
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
                tally(quads, [x, y], counts, depth > 0 ? 'cell' : 'shading', depth > 0)
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

/** A PDF.js text item's run and the corners of its box: its baseline, raised by its height. */
function textItem(item: {
  str: string
  transform: number[]
  width: number
  height: number
}): TextItem {
  const [a, b, c, d, e, f] = item.transform as Matrix
  const along = Math.hypot(a, b) || 1
  const up = Math.hypot(c, d) || 1
  const ux: Point = [(a / along) * item.width, (b / along) * item.width]
  const uy: Point = [(c / up) * item.height, (d / up) * item.height]
  return {
    str: item.str,
    corners: [
      [e, f],
      [e + ux[0], f + ux[1]],
      [e + uy[0], f + uy[1]],
      [e + ux[0] + uy[0], f + ux[1] + uy[1]],
    ],
  }
}

/** The corners of a box given as left, bottom, right and top. */
const boxCorners = ([l, b, r, t]: readonly number[]): Point[] => [
  [l as number, b as number],
  [r as number, b as number],
  [l as number, t as number],
  [r as number, t as number],
]

/** Whether a box (by its corners) and a region's quad share any area. */
function overlaps(corners: Point[], quad: number[]): boolean {
  const mid = (p: Point, q: Point): Point => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  const [p0, p1, p2, p3] = corners as [Point, Point, Point, Point]
  const probes = [
    ...corners,
    mid(p0, p1),
    mid(p0, p2),
    mid(p1, p3),
    mid(p2, p3),
    mid(p0, p3),
  ]
  if (probes.some((p) => insideQuad(quad, p, 0))) return true
  // The region's centre inside the box: the box contains the region.
  const centre: Point = [
    (quad[0]! + quad[2]! + quad[4]! + quad[6]!) / 4,
    (quad[1]! + quad[3]! + quad[5]! + quad[7]!) / 4,
  ]
  return insideQuad([p2[0], p2[1], p3[0], p3[1], p0[0], p0[1], p1[0], p1[1]], centre, 0)
}

/** Whether every corner of a box lies inside the region's quad. */
const within = (corners: Point[], quad: number[]) =>
  corners.every((p) => insideQuad(quad, p, 0))

/** What the readers find on every page of `bytes`. */
const readPages = (bytes: Uint8Array, regions: FixtureRegion[], password?: string) =>
  withPdfjs(bytes, password, async (pdf, lib) => {
    const pages: PageReading[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const items = content.items.flatMap((item) =>
        'str' in item && 'transform' in item
          ? [
              textItem(
                item as {
                  str: string
                  transform: number[]
                  width: number
                  height: number
                }
              ),
            ]
          : []
      )
      pages.push({
        text: content.items.map((item) => ('str' in item ? item.str : '')).join(''),
        items,
        ...(await paintedOn(page, lib, regionsOn(regions, i - 1))),
      })
    }
    return pages
  })

const sum = (pages: PageReading[], side: 'under' | 'beside', kind: Kind) =>
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
/** Refused before the apply: the engine rejects and changes nothing. */
const refusedBefore = rows.filter((name) => manifest[name].refused?.kinds !== undefined)
/** Refused after the apply: the strict check finds content left. */
const refusedAfter = rows.filter(
  (name) =>
    manifest[name].refused !== undefined && manifest[name].refused.kinds === undefined
)
const KINDS: Kind[] = ['image', 'drawing', 'cell', 'shading', 'patterned', 'masked']

describe('the fixtures', () => {
  test.each(rows)(
    '%s has content under its regions for the readers to find',
    async (name) => {
      const {
        secrets = [],
        regions = [],
        password,
        gone = [],
        placed = [],
      } = manifest[name]
      const source = await fixtureBytes(name)
      const pages = await readPages(source, regions, password)
      const plain = await plainBytes(source, password)
      // Content under a region, located by a reader: a secret in a run of PDF.js page text whose
      // box meets a region, or paint of any kind under a region. Text PDF.js does not read as page
      // text (in a pattern's cell, a mask's group, an annotation's appearance) is located from the
      // fixture's own geometry in `placed`, and the byte reader shows it is in the file.
      const inText = secrets.some((word) =>
        pages.some((page, i) =>
          page.items.some(
            (item) =>
              item.str.includes(word) &&
              regionsOn(regions, i).some((quad) => overlaps(item.corners, quad))
          )
        )
      )
      const byGeometry = placed.some((p) =>
        regions.some((r) => overlaps(boxCorners(p.box), r.quad))
      )
      if (placed.length)
        expect(
          secrets.some((word) => holdsText(plain, word)),
          'placed content is text PDF.js does not read as page text: the bytes hold it'
        ).toBe(true)
      const painted = KINDS.some((kind) => sum(pages, 'under', kind) > 0)
      expect(
        inText || byGeometry || painted,
        'a secret in page text under a region, placed text under one, or paint under one'
      ).toBe(true)
      for (const word of gone) expect(holdsText(plain, word), word).toBe(true)
    }
  )
})

test.runIf(qpdfAvailable)(
  'the bytes reader sees an object nothing refers to in an encrypted file',
  async () => {
    // redact-file-encrypted holds a content stream drawing ORPHAN-OMEGA that no page uses.
    const source = await fixtureBytes('redact-file-encrypted')
    expect(holdsText(await plainBytes(source, 'inkbar'), 'ORPHAN-OMEGA')).toBe(true)
    // Without asking for them, qpdf leaves such objects out, and the word with them.
    const dropped = await qpdfQdf(source, { password: 'inkbar' })
    expect(holdsText(Buffer.from(dropped, 'latin1'), 'ORPHAN-OMEGA')).toBe(false)
  }
)

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
      for (const kind of KINDS) expect(sum(after, 'under', kind), kind).toBe(0)
      for (const kind of ['image', 'drawing', 'shading'] as const)
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
        // Every image left in the file, used or not, on every row (an image inside a mask group
        // paints nothing the page reader counts): each must be one a page names. Where the page
        // painted no image beside the regions, every image left must be blank: one value.
        const images = await qpdfImages(bytes, password)
        expect(images.filter((i) => !i.namedOnPage).map((i) => i.ref)).toEqual([])
        if (sum(before, 'beside', 'image') === 0) {
          if (sum(before, 'under', 'image') > 0) {
            const source = await qpdfImages(await fixtureBytes(name), password)
            expect(source.some((i) => !flat(i.samples))).toBe(true)
          }
          for (const image of images) expect(flat(image.samples), image.ref).toBe(true)
        }
      }
    }
  )
})

/** Whether an image's samples are known and all one value. */
const flat = (samples: Uint8Array | undefined) =>
  samples !== undefined && samples.length > 0 && samples.every((b) => b === samples[0])

test.runIf(qpdfAvailable)('the image reader lists an image no page shows', async () => {
  // redact-copy-thumbnail holds its /Thumb, which no page names as an XObject, and an image
  // XObject nothing refers to at all.
  const source = await fixtureBytes('redact-copy-thumbnail')
  const images = await qpdfImages(source)
  expect(images.map((i) => i.namedOnPage)).toEqual([false, false])
  expect(images.every((i) => i.samples !== undefined && !flat(i.samples))).toBe(true)
  // The second is unreferenced: qpdf drops it when not asked to keep such objects.
  const kept = await qpdfQdf(source, { unreferenced: true })
  const dropped = await qpdfQdf(source)
  const count = (qdf: string) => qdf.match(/\/Width 64/g)?.length ?? 0
  expect([count(kept), count(dropped)]).toEqual([1, 0])
  // An image a page shows, its soft mask, and a stencil, which qpdf's own page list leaves out.
  for (const [name, count] of [
    ['redact-image-smask', 2],
    ['redact-image-stencil', 1],
    ['redact-image-jpeg', 1],
  ] as const) {
    const images = await qpdfImages(await fixtureBytes(name))
    expect(
      images.map((i) => i.namedOnPage),
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
 * What independent readers show, in the original file, for each refusal before the apply, by the
 * `need` its manifest entry gives.
 *
 * `shown`: content lies under the mark in something the apply cannot rewrite (`under`), and the
 * object that paints it reaches past the mark (`beyond`), so the apply would cut that object and
 * leave what it carries in the file.
 * - `cell`: PDF.js reads a tiling pattern's cell drawing under the mark.
 * - `hidden-text`: text PDF.js does not read as page text, in a pattern's cell or a mask's group.
 *   The byte reader shows it is in the file, and its place, worked out from the fixture's own
 *   geometry in `placed`, lies inside the mark.
 * - `shading`: PDF.js's operator list paints a shading under the mark (`sh`, or a path filled
 *   with a shading pattern).
 * - `beyond`: the paint, by what paints it, that PDF.js finds beside the mark: `patterned` for an
 *   object painted with a pattern, `masked` for one under a soft mask, `shading` for `sh`.
 */
const shownBy: Partial<
  Record<FixtureName, { under: 'cell' | 'hidden-text' | 'shading'; beyond: Kind }>
> = {
  'redact-text-pattern': { under: 'hidden-text', beyond: 'patterned' },
  'redact-drawing-pattern-past-mark': { under: 'cell', beyond: 'patterned' },
  'redact-drawing-pattern-side': { under: 'cell', beyond: 'patterned' },
  'redact-drawing-mesh': { under: 'shading', beyond: 'shading' },
  'redact-drawing-function-shading': { under: 'shading', beyond: 'shading' },
  'redact-drawing-sampled-axial': { under: 'shading', beyond: 'shading' },
  'redact-drawing-mesh-pattern': { under: 'shading', beyond: 'patterned' },
  'redact-mask-group-past-mark': { under: 'hidden-text', beyond: 'masked' },
}

/**
 * `covered`: the shape lies wholly inside the mark, so the apply would remove it, and the engine
 * refuses because it cannot show that nothing else keeps what it carries in the file. No reader
 * can show that for these files. What is asserted is that the shape does lie wholly inside the
 * mark: what paints with the carrier paints under the mark and nothing beside it. `masked-text`:
 * the masked object is text, so its runs of page text lie wholly inside the mark. The two files
 * that show why "wholly inside" is not enough have tests of their own below.
 */
const coveredBy: Partial<
  Record<FixtureName, 'patterned' | 'shading' | 'masked' | 'masked-text'>
> = {
  'redact-drawing-pattern': 'patterned',
  'check-pattern-text': 'patterned',
  'redact-drawing-hatch-under-mark': 'patterned',
  'redact-drawing-pattern-colour-kept': 'patterned',
  'redact-drawing-pattern-miter': 'patterned',
  'redact-drawing-mesh-under-mark': 'shading',
  'redact-drawing-function-under-mark': 'shading',
  'redact-mask-group-under-mark': 'masked',
  'redact-text-shaped-fade': 'masked-text',
}

/** The bytes a save gives of the fixture as opened, with nothing done to it, without its /ID. */
async function untouched(name: FixtureName): Promise<string> {
  const { password } = manifest[name]
  const doc = await engine.open(await fixtureBytes(name), password ? { password } : {})
  try {
    return withoutId(await doc.save())
  } finally {
    await doc.close()
  }
}

/** A saved file as Latin-1 with its /ID blanked: PDFium makes a new one on every save. */
const withoutId = (bytes: Uint8Array) =>
  Buffer.from(bytes)
    .toString('latin1')
    .replace(/\/ID\s*\[\s*<[0-9A-F]*>\s*<[0-9A-F]*>\s*\]/i, '/ID[]')

describe.runIf(refusedBefore.length)('refused before the apply', () => {
  test.each(refusedBefore.map((name) => [name, manifest[name].refused?.need] as const))(
    '%s (%s): the engine refuses the mark and changes nothing',
    async (name, need) => {
      const {
        secrets = [],
        regions = [],
        password,
        refused,
        placed = [],
      } = manifest[name]
      const expected = await untouched(name)
      const marks = marksOf(name)
      const doc = await engine.open(
        await fixtureBytes(name),
        password ? { password } : {}
      )
      try {
        const error: unknown = await doc.redact({ marks }).catch((e: unknown) => e)
        expect(error).toBeInstanceOf(EngineError)
        expect(error).toMatchObject({
          code: 'redaction-failed',
          reason: 'unremovable-content',
          marks: marks.map((m) => m.annotation.id),
          kinds: refused?.kinds,
        })
        expect(withoutId(await doc.save())).toBe(expected)
      } finally {
        await doc.close()
      }

      const source = await fixtureBytes(name)
      const pages = await readPages(source, regions, password)
      if (need === 'shown') {
        const shown = shownBy[name]
        expect(shown, 'shownBy says what the readers show').toBeDefined()
        const { under, beyond } = shown as NonNullable<typeof shown>
        if (under === 'cell')
          expect(sum(pages, 'under', 'cell'), 'cell').toBeGreaterThan(0)
        if (under === 'shading')
          expect(sum(pages, 'under', 'shading'), 'shading').toBeGreaterThan(0)
        if (under === 'hidden-text') {
          // PDF.js does not read text in a cell or a group as page text, so its place comes from
          // the fixture's geometry, and the byte reader shows the text is in the file.
          expect(placed.length, 'placed says where the text lies').toBeGreaterThan(0)
          for (const { what, box } of placed)
            expect(
              regions.some((r) => within(boxCorners(box), r.quad)),
              `${what} lies inside the mark`
            ).toBe(true)
          const plain = await plainBytes(source, password)
          for (const word of secrets) {
            expect(holdsText(plain, word), word).toBe(true)
            for (const page of pages) expect(page.text, word).not.toContain(word)
          }
        }
        expect(sum(pages, 'beside', beyond), `${beyond} beside the mark`).toBeGreaterThan(
          0
        )
      } else if (need === 'covered') {
        const kind = coveredBy[name]
        expect(kind, 'coveredBy says what paints with the carrier').toBeDefined()
        if (kind === 'masked-text') {
          // Every run of text shown under the soft mask, not only the secret's, lies wholly
          // inside the mark: none paints beside it.
          const quads = regionsOn(regions, 0)
          const origins = (await shownText(source))
            .filter((t) => t.masked)
            .map((t) => t.origin)
          const runs = (pages[0]?.items ?? []).filter((item) =>
            origins.some(
              ([x, y]) =>
                Math.abs((item.corners[0]?.[0] ?? NaN) - x) < 0.01 &&
                Math.abs((item.corners[0]?.[1] ?? NaN) - y) < 0.01
            )
          )
          expect(origins.length).toBeGreaterThan(0)
          expect(runs.length).toBe(origins.length)
          expect(
            runs.some((item) => secrets.some((word) => item.str.includes(word)))
          ).toBe(true)
          for (const item of runs)
            expect(
              quads.some((quad) => within(item.corners, quad)),
              `${item.str} lies inside the mark`
            ).toBe(true)
        } else {
          const painting = kind as Kind
          expect(
            sum(pages, 'under', painting),
            `${painting} under the mark`
          ).toBeGreaterThan(0)
          expect(sum(pages, 'beside', painting), `${painting} beside the mark`).toBe(0)
        }
      } else {
        // `cautious`: what lies under the mark repeats what stays in view; the readers show the
        // patterned shape reaching past the mark, and nothing position-specific under it.
        expect(need).toBe('cautious')
        expect(
          sum(pages, 'beside', 'patterned'),
          'patterned beside the mark'
        ).toBeGreaterThan(0)
      }
    }
  )
})

/**
 * For each fixture refused after the apply: the field the strict check reports, and what still
 * holds the secrets. The loupe's appearance is not page text to PDF.js, so with no secret in the
 * page text after the apply and every secret still in the bytes, the finding is the loupe's copy.
 */
const refusedAfterBy: Partial<
  Record<
    FixtureName,
    { field: 'text' | 'image' | 'drawing'; remains: 'secrets' | 'copy' }
  >
> = {
  'redact-annotation-loupe': { field: 'text', remains: 'secrets' },
  'redact-annotation-loupe-drawing': { field: 'drawing', remains: 'copy' },
  'redact-annotation-loupe-elsewhere': { field: 'drawing', remains: 'copy' },
}

/** The star's fill as the loupe rows' content streams write it: its colour and its first point. */
const STAR = ['0.9 0.1 0.6 rg', '150 180 m']

/**
 * The page copies in a saved file (forms tagged /INKB_PageCopy), each as the text of its object
 * in qpdf's QDF form, stream data uncompressed: the byte reader's view of a loupe's copy.
 */
async function pageCopies(bytes: Uint8Array): Promise<string[]> {
  return [...(await qdfObjects(bytes)).values()].filter((object) =>
    /\/INKB_PageCopy\s+true/.test(object)
  )
}

/** Every object of the file in qpdf's QDF form, unreferenced ones kept, by object number. */
async function qdfObjects(bytes: Uint8Array): Promise<Map<string, string>> {
  const qdf = await qpdfQdf(bytes, { unreferenced: true })
  const objects = new Map<string, string>()
  for (const found of qdf.matchAll(/\n(\d+) 0 obj\n([^]*?)\nendobj\n/g))
    objects.set(found[1] as string, found[2] as string)
  return objects
}

describe.runIf(refusedAfter.length)('refused after the apply', () => {
  test.each(refusedAfter.map((name) => [name, manifest[name].refused?.need] as const))(
    '%s (%s): the strict check fails, so the action refuses',
    async (name, need) => {
      expect(need).toBe('shown')
      const { secrets = [], regions = [], password } = manifest[name]
      const bytes = await redacted(name)
      const findings = await strictCheck(name, bytes)
      expect(findings).not.toBeInstanceOf(EngineError)
      const expected = refusedAfterBy[name]
      expect(expected, 'refusedAfterBy says what the check reports').toBeDefined()
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
      if (remains === 'secrets') {
        expect(secrets.length).toBeGreaterThan(0)
        const plain = await plainBytes(bytes, password)
        for (const word of secrets) expect(holdsText(plain, word), word).toBe(true)
      } else {
        // The byte reader, on qpdf's QDF form: the loupe's copy still draws the star, which the
        // page itself no longer does.
        const copies = await pageCopies(bytes)
        expect(copies).toHaveLength(1)
        for (const mark of STAR) expect(copies[0], mark).toContain(mark)
        expect(sum(after, 'under', 'drawing'), 'drawing under the mark on the page').toBe(
          0
        )
      }
    }
  )
})

/**
 * What a page's operator list paints, in order: each path with its paint operator, and each run
 * of shown text, each with the fill colour, line width, join and miter limit in effect.
 */
const pagePaints = (bytes: Uint8Array) =>
  withPdfjs(bytes, undefined, async (pdf, lib) => {
    const { OPS } = lib
    const list = await (await pdf.getPage(1)).getOperatorList()
    interface Paint {
      /** The path's paint operator, or `text`. */
      paint: number | 'text'
      /** Whether it fills: a fill operator, or text in a fill rendering mode. */
      fills: boolean
      fill: unknown
      lineWidth: number
      join: number
      miterLimit: number
      data: number[]
    }
    const paints: Paint[] = []
    const fillOps = new Set([
      OPS.fill,
      OPS.eoFill,
      OPS.fillStroke,
      OPS.eoFillStroke,
      OPS.closeFillStroke,
      OPS.closeEOFillStroke,
    ])
    const showOps = new Set([
      OPS.showText,
      OPS.showSpacedText,
      OPS.nextLineShowText,
      OPS.nextLineSetSpacingShowText,
    ])
    let fill: unknown = '#000000'
    let lineWidth = 1
    let join = 0
    let miterLimit = 10
    let mode = 0
    const stack: [unknown, number, number, number, number][] = []
    list.fnArray.forEach((op, i) => {
      const args = list.argsArray[i] as unknown[]
      if (op === OPS.save) stack.push([fill, lineWidth, join, miterLimit, mode])
      else if (op === OPS.restore)
        [fill, lineWidth, join, miterLimit, mode] = stack.pop() ?? [
          fill,
          lineWidth,
          join,
          miterLimit,
          mode,
        ]
      else if (op === OPS.setFillColorN) fill = args
      else if (op === OPS.setFillRGBColor) fill = args[0]
      else if (op === OPS.setLineWidth) lineWidth = args[0] as number
      else if (op === OPS.setLineJoin) join = args[0] as number
      else if (op === OPS.setMiterLimit) miterLimit = args[0] as number
      else if (op === OPS.setTextRenderingMode) mode = args[0] as number
      else if (op === OPS.constructPath) {
        const [paint, [data]] = args as [number, [ArrayLike<number>]]
        const fills = fillOps.has(paint)
        paints.push({
          paint,
          fills,
          fill,
          lineWidth,
          join,
          miterLimit,
          data: Array.from(data),
        })
      } else if (showOps.has(op)) {
        // Rendering modes 0, 2, 4 and 6 fill the glyphs.
        const fills = [0, 2, 4, 6].includes(mode % 8)
        paints.push({ paint: 'text', fills, fill, lineWidth, join, miterLimit, data: [] })
      }
    })
    return { paints, OPS }
  })

const isTiling = (colour: unknown) =>
  Array.isArray(colour) && colour[0] === 'TilingPattern'

/** The cell's drawing, as the pattern-gap fixtures' content stream holds it. */
const CELL_DRAWING = '130 130 m 170 135 l 160 170 l 135 165 l h f'

test('a later stroke whose fill colour still names the pattern keeps the cell in the file', async () => {
  const name = 'redact-drawing-pattern-colour-kept'
  const source = await fixtureBytes(name)
  // The byte reader: the cell holds the quadrilateral under the mark.
  expect(holdsText(source, CELL_DRAWING)).toBe(true)
  const { paints, OPS } = await pagePaints(source)
  const [square, ...later] = paints
  // The square under the mark fills with the pattern.
  expect(square?.paint).toBe(OPS.fill)
  expect(isTiling(square?.fill)).toBe(true)
  // After it, nothing that fills, path or text, fills with the pattern...
  expect(later.length).toBeGreaterThan(1)
  for (const paint of later)
    if (paint.fills)
      expect(isTiling(paint.fill), `paint ${String(paint.paint)}`).toBe(false)
  expect(later.some((p) => p.paint === 'text' && p.fills)).toBe(true)
  // ...but the stroke-only line's fill colour is still the pattern: the content names it after
  // the square is gone, though nothing paints with it.
  const line = later.find((p) => p.paint === OPS.stroke)
  expect(line).toBeDefined()
  expect(isTiling(line?.fill)).toBe(true)
  const [page] = await readPages(source, manifest[name].regions ?? [])
  expect(page?.under.cell).toBeGreaterThan(0)
})

test('a pattern-stroked triangle inside the mark has a mitred corner past it', async () => {
  const name = 'redact-drawing-pattern-miter'
  const source = await fixtureBytes(name)
  expect(holdsText(source, CELL_DRAWING)).toBe(true)
  const quad = manifest[name].regions?.[0]?.quad ?? []
  const box = boundsOf(quad)
  const [l, b, r, t] = [box.x, box.y, box.x + box.width, box.y + box.height]
  const { paints, OPS } = await pagePaints(source)
  const triangle = paints.find(
    (p) => p.paint === OPS.stroke || p.paint === OPS.closeStroke
  )
  expect(triangle).toBeDefined()
  const { data, lineWidth, join, miterLimit } = triangle as NonNullable<typeof triangle>
  // Mitred joins, under the limit in effect (10 when the content sets none).
  expect(join).toBe(0)
  // The vertices, from the path's move and line operators.
  const points: Point[] = []
  for (let at = 0; at < data.length;) {
    const code = data[at++] as number
    if (code === 0 || code === 1) {
      points.push([data[at] as number, data[at + 1] as number])
      at += 2
    } else if (code === 2) at += 6
    else if (code === 3) at += 4
  }
  expect(points).toHaveLength(3)
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const half = lineWidth / 2
  // The triangle's box grown by half the stroke width lies inside the region...
  expect(Math.min(...xs) - half).toBeGreaterThan(l)
  expect(Math.max(...xs) + half).toBeLessThan(r)
  expect(Math.min(...ys) - half).toBeGreaterThan(b)
  expect(Math.max(...ys) + half).toBeLessThan(t)
  // ...but the sharpest corner's miter reaches past it. At a vertex whose two edges meet at an
  // angle theta, the miter is 1 / sin(theta / 2) times the line width long, drawn when that ratio
  // is within the miter limit, its tip on the bisector of the edges, outward.
  const unit = ([x, y]: Point): Point => [x / Math.hypot(x, y), y / Math.hypot(x, y)]
  const corners = points.map((vertex, i) => {
    const prev = points[(i + 2) % 3] as Point
    const next = points[(i + 1) % 3] as Point
    const u = unit([prev[0] - vertex[0], prev[1] - vertex[1]])
    const v = unit([next[0] - vertex[0], next[1] - vertex[1]])
    const theta = Math.acos(u[0] * v[0] + u[1] * v[1])
    const ratio = 1 / Math.sin(theta / 2)
    const inward = unit([u[0] + v[0], u[1] + v[1]])
    const reach = half * ratio
    return {
      ratio,
      tip: [vertex[0] - inward[0] * reach, vertex[1] - inward[1] * reach] as Point,
    }
  })
  const sharpest = corners.reduce((a, c) => (c.ratio > a.ratio ? c : a))
  expect(sharpest.ratio).toBeLessThanOrEqual(miterLimit)
  expect(
    insideQuad(quad, sharpest.tip, 0),
    `miter tip at ${sharpest.tip.join(', ')}`
  ).toBe(false)
})

/**
 * Each run of text the first page shows, from its operator list: where its line starts (from
 * `Td` and `Tm` within its text object; these fixtures set no other transform around text) and
 * whether a soft mask is set.
 */
const shownText = (bytes: Uint8Array) =>
  withPdfjs(bytes, undefined, async (pdf, lib) => {
    const { OPS } = lib
    const list = await (await pdf.getPage(1)).getOperatorList()
    const shows = new Set([
      OPS.showText,
      OPS.showSpacedText,
      OPS.nextLineShowText,
      OPS.nextLineSetSpacingShowText,
    ])
    const runs: { origin: Point; masked: boolean }[] = []
    let masked = false
    const stack: boolean[] = []
    let line: Point = [0, 0]
    list.fnArray.forEach((op, i) => {
      const args = list.argsArray[i] as unknown[]
      if (op === OPS.save) stack.push(masked)
      else if (op === OPS.restore) masked = stack.pop() ?? masked
      else if (op === OPS.setGState) {
        for (const [key, value] of args[0] as [string, unknown][])
          if (key === 'SMask') masked = Boolean(value)
      } else if (op === OPS.beginText) line = [0, 0]
      else if (op === OPS.moveText)
        line = [line[0] + (args[0] as number), line[1] + (args[1] as number)]
      else if (op === OPS.setTextMatrix) {
        const m = args[0] as ArrayLike<number>
        line = [m[4] as number, m[5] as number]
      } else if (shows.has(op)) runs.push({ origin: line, masked })
    })
    return runs
  })

test('the drawing reader leaves out the overlay and nothing else', () => {
  // A region of x and y 110..190: the mark's appearance, and so its overlay, fills 107..193.
  const quad = [110, 190, 190, 190, 110, 110, 190, 110]
  const boxes = overlayBoxes([quad])
  const square = (l: number, h: number): Point[][] => [
    [
      [l, l],
      [h, l],
      [h, h],
      [l, h],
      [l, l],
    ],
  ]
  expect(isOverlay(square(107, 193), '#000000', boxes)).toBe(true)
  expect(isOverlay(square(108, 192), '#000000', boxes)).toBe(false)
  expect(isOverlay(square(106, 194), '#000000', boxes)).toBe(false)
  expect(isOverlay(square(107, 193), '#ff00ff', boxes)).toBe(false)
  expect(isOverlay(square(107, 193), '#000000', [])).toBe(false)
})

test("the lens-elsewhere loupe's window shows neither the region nor the star", async () => {
  const name = 'redact-annotation-loupe-elsewhere'
  const source = await fixtureBytes(name)
  // The loupe's appearance: a 90 by 90 box that clips a copy of the page drawn through the lens.
  const objects = await qdfObjects(source)
  const appearance = [...objects.values()].find((o) => o.includes('/Pg Do'))
  const found = /0 0 90 90 re W n ([-\d. ]+) cm \/Pg Do/.exec(appearance ?? '')
  expect(found).not.toBeNull()
  const [a, b, c, d, e, f] = (found?.[1] ?? '').trim().split(/\s+/).map(Number) as Matrix
  expect([b, c]).toEqual([0, 0])
  // The window: the box's corners taken back through the lens onto the page.
  const window = [(0 - e) / a, (0 - f) / d, (90 - e) / a, (90 - f) / d]
  const apart = (p: number[], q: number[]) =>
    (p[2] as number) <= (q[0] as number) ||
    (q[2] as number) <= (p[0] as number) ||
    (p[3] as number) <= (q[1] as number) ||
    (q[3] as number) <= (p[1] as number)
  const region = boundsOf(manifest[name].regions?.[0]?.quad ?? [])
  expect(
    apart(window, [region.x, region.y, region.x + region.width, region.y + region.height])
  ).toBe(true)
  // The star's bounds, from the first path the page fills.
  const { paints } = await pagePaints(source)
  const star = paints[0]?.data ?? []
  const xs: number[] = []
  const ys: number[] = []
  for (let at = 0; at < star.length;) {
    const code = star[at++] as number
    if (code === 0 || code === 1) {
      xs.push(star[at] as number)
      ys.push(star[at + 1] as number)
      at += 2
    } else if (code === 2) at += 6
    else if (code === 3) at += 4
  }
  expect(xs).toHaveLength(10)
  expect(
    apart(window, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
  ).toBe(true)
})

test('a loupe the engine writes after the apply copies the redacted page', async () => {
  const name = 'redact-annotation-loupe-rewritten'
  const regions = manifest[name].regions ?? []
  // A stamp marked as a loupe, at x 220..310, y 200..290, showing the region at 1.125 times its
  // size from a copy of page 0 that the engine takes when it writes the annotation.
  const bounds = { x: 220, y: 200, width: 90, height: 90 }
  const loupe: WriteAnnotation = {
    page: 0,
    annotation: {
      id: 'loupe-1',
      type: 'circle',
      page: 0,
      rect: bounds,
      color: '#0000ff',
      opacity: 1,
      width: 2,
      custom: { inkbar: { type: 'loupe' } },
    } satisfies GlossAnnotation,
    appearance: {
      bounds,
      content: ascii('q 220 200 90 90 re W n 1.125 0 0 1.125 96.25 76.25 cm /Pg Do Q'),
      pages: { Pg: 0 },
    },
    data: '{"id":"loupe-1"}',
  }
  const doc = await engine.open(await fixtureBytes(name))
  let bytes: Uint8Array
  try {
    await doc.redact({ marks: marksOf(name), annotations: [loupe] })
    bytes = await doc.save()
  } finally {
    await doc.close()
  }
  // The strict check reads the copy and finds nothing under the mark.
  const findings = await strictCheck(name, bytes)
  expect(findings).toMatchObject({ candidates: [{ verdict: 'clean' }] })
  // The byte reader: there is one copy, and it holds nothing of the star.
  const copies = await pageCopies(bytes)
  expect(copies).toHaveLength(1)
  for (const mark of STAR) expect(copies[0], mark).not.toContain(mark)
  // It was taken after the apply: among the objects it names is the overlay the apply drew, a
  // form tagged /INKB_Overlay. Objects are looked up in the same QDF form the copy came from.
  const objects = await qdfObjects(bytes)
  const named = [...(copies[0] ?? '').matchAll(/(\d+) 0 R/g)].map((m) => m[1] as string)
  expect(named.some((n) => /\/INKB_Overlay\s+true/.test(objects.get(n) ?? ''))).toBe(true)
  // PDF.js paints nothing under the mark on the page.
  const [page] = await readPages(bytes, regions)
  for (const kind of KINDS) expect(page?.under[kind], kind).toBe(0)
})

test('an axial shading under a mark is clipped away from it, and the one beside stays', async () => {
  const name = 'redact-drawing-shading'
  const regions = manifest[name].regions ?? []
  const [before] = await readPages(await fixtureBytes(name), regions)
  const [after] = await readPages(await redacted(name), regions)
  expect(before?.under.shading).toBeGreaterThan(0)
  expect(before?.beside.shading).toBeGreaterThan(0)
  // No point under the mark is painted by a shading any more; the blue one beside is whole.
  expect(after?.under.shading).toBe(0)
  expect(after?.beside.shading).toBe(before?.beside.shading)
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
