// Draws every fixture's first pages with PDF.js and with the engine and holds each fixture to the
// verdict parity.json records for it.
import manifestJson from '@inkbar/fixtures/manifest.json'
import { FIXTURE_NAMES, type FixtureName } from '@inkbar/fixtures/urls'
import { afterAll, describe, expect, inject, it } from 'vitest'

import parityJson from '../parity.json'

import { compare, differenceImage, type Comparison } from './compare'
import { drawPage, openWith, PAGES_PER_FIXTURE, type ReaderKind } from './draw'
import {
  baselinePath,
  readPng,
  writePng,
  writeReport,
  writeText,
  type ReportPage,
} from './report'

import type { InkDocument, PageInfo } from '@inkbar/core'
import type { FixtureMeta } from '@inkbar/fixtures'

export type Verdict =
  | { state: 'same' }
  | { state: 'different'; reason: string; accepted: boolean }
  /** Compared with parity/baselines/<fixture>-<page>.png. */
  | { state: 'baseline'; reason: string }
  /** Does not open in one reader, or the readers count its pages differently. */
  | { state: 'skipped'; reason: string }
export type ParityFile = Partial<Record<FixtureName, Verdict>>

const manifest = manifestJson as unknown as Record<FixtureName, FixtureMeta>
const verdicts = parityJson as ParityFile
const reportMode = inject('parityReport')
/** Whether the report lists a page with this measure. */
const reports = (measured: Comparison) =>
  reportMode === 'all' || (reportMode === 'differences' && !measured.same)
/** The fixtures whose baselines this run writes, from `PARITY_BASELINE` (comma-separated). */
const baselineFor = inject('parityBaseline').split(',').filter(Boolean)

const opening = FIXTURE_NAMES.filter((name) => manifest[name].opens)

/** Pages the report lists; images are on disk, only these numbers stay in memory. */
const reported: ReportPage[] = []
/** Every page compared, same or not, for `.report/measures.json`. */
const measures: {
  fixture: string
  page: number
  share: number
  worstBlock: number
  /** Share of inked pixels in each image: PDF.js (or the baseline), then the engine. */
  inked: [number, number]
}[] = []

afterAll(async () => {
  if (reportMode === 'off') return
  await writeReport(reported)
  await writeText('.report/measures.json', JSON.stringify(measures, null, 1))
})

/** Share of pixels with any channel under 250. */
function inked(img: ImageData): number {
  let n = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i]! < 250 || img.data[i + 1]! < 250 || img.data[i + 2]! < 250) n++
  }
  return n / (img.width * img.height)
}

/** Where `a` and `b` disagree on a page's box, rotation or user unit; empty when they agree. */
function geometryDifference(a: PageInfo, b: PageInfo): string[] {
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

/** Opens `name` with `kind`, or gives the reason it does not open. */
async function tryOpen(
  name: FixtureName,
  kind: ReaderKind
): Promise<InkDocument | string> {
  try {
    return await openWith(name, kind)
  } catch (err) {
    return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  }
}

async function record(
  name: FixtureName,
  page: number,
  verdict: Verdict | undefined,
  measured: Comparison,
  left: ImageData,
  leftLabel: string,
  right: ImageData
): Promise<void> {
  const stem = `${name}-${page}`
  const files = {
    left: `${stem}-a.png`,
    right: `${stem}-engine.png`,
    diff: `${stem}-diff.png`,
  }
  await writePng(`.report/${files.left}`, left)
  await writePng(`.report/${files.right}`, right)
  await writePng(`.report/${files.diff}`, differenceImage(left, right))
  reported.push({
    fixture: name,
    page,
    state: verdict?.state ?? 'none',
    reason: verdict && 'reason' in verdict ? verdict.reason : '',
    measured,
    ...files,
    leftLabel,
  })
}

const describeNumbers = (c: Comparison) =>
  `${(c.share * 100).toFixed(2)}% of pixels, worst block ${(c.worstBlock * 100).toFixed(0)}%`

describe('parity.json', () => {
  it('names only fixtures that open', () => {
    const stray = Object.keys(verdicts).filter(
      (name) => !(opening as readonly string[]).includes(name)
    )
    expect(stray, 'entries for fixtures that are gone or do not open').toEqual([])
  })
})

describe.each(opening)('%s', (name) => {
  const verdict = verdicts[name]

  it('draws as parity.json records', async () => {
    const pdfjs = await tryOpen(name, 'pdfjs')
    const engine = await tryOpen(name, 'engine')
    try {
      const counts =
        typeof pdfjs === 'string' || typeof engine === 'string'
          ? undefined
          : { pdfjs: pdfjs._reader.pageCount, engine: engine._reader.pageCount }

      if (verdict?.state === 'skipped') {
        const stillApart =
          typeof pdfjs === 'string' ||
          typeof engine === 'string' ||
          counts!.pdfjs !== counts!.engine
        expect(stillApart, 'now opens alike in both readers: update parity.json').toBe(
          true
        )
        return
      }
      if (typeof pdfjs === 'string') throw new Error(`PDF.js does not open it: ${pdfjs}`)
      if (typeof engine === 'string')
        throw new Error(`the engine does not open it: ${engine}`)
      expect(counts!.engine, 'page count, engine against PDF.js').toBe(counts!.pdfjs)

      const pages = Math.min(counts!.pdfjs, PAGES_PER_FIXTURE)

      // Geometry first, whatever the verdict.
      for (let page = 0; page < pages; page++) {
        const a = await pdfjs._reader.pageInfo(page)
        const b = await engine._reader.pageInfo(page)
        expect(geometryDifference(a, b), `page ${page + 1} geometry`).toEqual([])
      }

      if (verdict?.state === 'baseline') {
        for (let page = 0; page < pages; page++) {
          const drawn = await drawPage(engine, page)
          expect(
            inked(drawn),
            `page ${page + 1}: the engine draws a blank page`
          ).toBeGreaterThan(0.001)
          const path = baselinePath(name, page)
          if (baselineFor.includes(name)) await writePng(path, drawn)
          const committed = await readPng(path)
          if (committed === null) throw new Error(`no baseline at parity/${path}`)
          const measured = compare(committed, drawn)
          measures.push({
            fixture: name,
            page,
            share: measured.share,
            worstBlock: measured.worstBlock,
            inked: [inked(committed), inked(drawn)],
          })
          if (reports(measured)) {
            await record(name, page, verdict, measured, committed, 'Baseline', drawn)
          }
          expect(
            measured.same,
            `page ${page + 1} differs from its baseline: ${describeNumbers(measured)}`
          ).toBe(true)
        }
        return
      }

      const results: Comparison[] = []
      for (let page = 0; page < pages; page++) {
        const a = await drawPage(pdfjs, page)
        const b = await drawPage(engine, page)
        const measured = compare(a, b)
        results.push(measured)
        measures.push({
          fixture: name,
          page,
          share: measured.share,
          worstBlock: measured.worstBlock,
          inked: [inked(a), inked(b)],
        })
        if (reports(measured)) await record(name, page, verdict, measured, a, 'PDF.js', b)
      }
      const numbers = results.map((r, page) => `page ${page + 1}: ${describeNumbers(r)}`)

      if (verdict === undefined) {
        throw new Error(`no verdict recorded in parity.json (${numbers.join('; ')})`)
      }
      if (verdict.state === 'same') {
        results.forEach((r, page) => {
          expect(r.same, `page ${page + 1} differs: ${describeNumbers(r)}`).toBe(true)
        })
      } else {
        expect(
          results.some((r) => !r.same),
          `now the same: update parity.json (${numbers.join('; ')})`
        ).toBe(true)
      }
    } finally {
      if (typeof pdfjs !== 'string') pdfjs.destroy()
      if (typeof engine !== 'string') engine.destroy()
    }
  })
})
