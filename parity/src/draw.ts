// Draws a fixture's pages with both readers, through core's internal reader, at one size.
import {
  openDocument,
  type EngineLoader,
  type InkDocument,
  type PageInfo,
} from '@inkbar/core'
import { createPageTransform } from '@inkbar/core/dom'
import manifest from '@inkbar/fixtures/manifest.json'
import { browserAssets, fixtureUrl, type FixtureName } from '@inkbar/fixtures/urls'
import { fontUrls } from '@inkbar/fonts'

export { PAGES_PER_FIXTURE } from './pages'
export const PIXELS_PER_POINT = 2

export type ReaderKind = 'pdfjs' | 'engine'

/** Where the test server serves the `@inkbar/fonts` files. */
const FONTS_BASE = '/inkbar-fonts/'

/** The real engine, with the fallback fonts the sandbox gives it. */
const engineWithFonts: EngineLoader = async () => {
  const real = await import('@inkbar/engine')
  return {
    createEngine: () => real.createEngine({ fallbackFonts: fontUrls(FONTS_BASE) }),
  }
}

/** The core switch that makes `openDocument` read with the engine. Never public. */
const flag = globalThis as { __INKBAR_READER__?: unknown }

/** Opens `name` with one reader, the manifest's password included. Rejects if it does not open. */
export async function openWith(
  name: FixtureName,
  kind: ReaderKind
): Promise<InkDocument> {
  const password = (manifest as Record<string, { password?: string }>)[name]?.password
  if (kind === 'engine') flag.__INKBAR_READER__ = 'engine'
  let doc: InkDocument
  try {
    doc = await openDocument(fixtureUrl(name), {
      assets: browserAssets(),
      engine: engineWithFonts,
      ...(password !== undefined && { password }),
    })
  } finally {
    delete flag.__INKBAR_READER__
  }
  try {
    await doc.ready
  } catch (err) {
    doc.destroy()
    throw err
  }
  if (doc._reader.kind !== kind) {
    doc.destroy()
    throw new Error(`${name} opened with ${doc._reader.kind}, not ${kind}`)
  }
  return doc
}

/** Where `a` and `b` disagree on a page's box, rotation or user unit; empty when they agree. */
export function geometryDifference(a: PageInfo, b: PageInfo): string[] {
  const out: string[] = []
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (Math.abs(a.box[key] - b.box[key]) > 0.01) {
      out.push(`box ${key}: PDF.js ${a.box[key]}, engine ${b.box[key]}`)
    }
  }
  if (a.rotate !== b.rotate) out.push(`rotate: PDF.js ${a.rotate}, engine ${b.rotate}`)
  if (Math.abs(a.userUnit - b.userUnit) > 1e-6) {
    out.push(`user unit: PDF.js ${a.userUnit}, engine ${b.userUnit}`)
  }
  return out
}

/**
 * The canvas size core gives a whole page at `PIXELS_PER_POINT` and pixel ratio 1: the page
 * transform's CSS size, /UserUnit and /Rotate included, rounded as the page canvas rounds it.
 */
export function canvasSize(info: PageInfo): { width: number; height: number } {
  const t = createPageTransform(info, PIXELS_PER_POINT, 0)
  return { width: Math.round(t.cssWidth), height: Math.round(t.cssHeight) }
}

/**
 * Page `page` of `doc`, drawn whole on white at `PIXELS_PER_POINT` with the /Rotate of `info`.
 * `info` is one reader's page facts, the same for both readers' draws, so both are asked for the
 * same canvas size and turn: the caller checks first that the two readers' facts agree.
 */
export async function drawPage(
  doc: InkDocument,
  page: number,
  info: PageInfo
): Promise<ImageData> {
  const { width, height } = canvasSize(info)
  const canvas = document.createElement('canvas')
  await doc._reader.draw(
    {
      page,
      rotation: info.rotate,
      zoom: PIXELS_PER_POINT,
      pixelRatio: 1,
      width,
      height,
      hide: [],
    },
    canvas
  )
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  // Free the canvas's backing store now rather than at the next collection.
  canvas.width = canvas.height = 0
  return data
}

/** Page `page` of fixture `name`, drawn by PDF.js and by the engine. Opens and closes both. */
export async function drawBoth(
  name: FixtureName,
  page: number
): Promise<{ pdfjs: ImageData; engine: ImageData }> {
  const pdfjsDoc = await openWith(name, 'pdfjs')
  try {
    const info = await pdfjsDoc._reader.pageInfo(page)
    const pdfjs = await drawPage(pdfjsDoc, page, info)
    const engineDoc = await openWith(name, 'engine')
    try {
      const apart = geometryDifference(info, await engineDoc._reader.pageInfo(page))
      if (apart.length > 0)
        throw new Error(`${name} page ${page + 1}: ${apart.join('; ')}`)
      return { pdfjs, engine: await drawPage(engineDoc, page, info) }
    } finally {
      engineDoc.destroy()
    }
  } finally {
    pdfjsDoc.destroy()
  }
}
