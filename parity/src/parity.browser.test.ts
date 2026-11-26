// Draws every fixture's first pages with PDF.js and with the engine and holds each fixture to the
// verdict parity.json records for it.
import manifestJson from '@inkbar/fixtures/manifest.json'
import { FIXTURE_NAMES, type FixtureName } from '@inkbar/fixtures/urls'
import { afterAll, describe, expect, inject, it } from 'vitest'

import parityJson from '../parity.json'

import { compare, differenceImage, type Comparison } from './compare'
import {
  drawPage,
  geometryDifference,
  mountWithFields,
  openWith,
  pagesWithFields,
  PAGES_PER_FIXTURE,
  type ReaderKind,
} from './draw'
import { expectPages, verdictOn, withBoth } from './parts'
import {
  baselinePath,
  readPng,
  writePng,
  writeReport,
  writeText,
  type ReportPage,
} from './report'

import type { ParityFile } from './verdicts'
import type { InkDocument, PageInfo } from '@inkbar/core'
import type { FixtureMeta } from '@inkbar/fixtures'

const manifest = manifestJson as unknown as Record<FixtureName, FixtureMeta>
const verdicts = parityJson as Partial<ParityFile>
const reportMode = inject('parityReport')
/** Whether the report lists a page with this measure. */
const reports = (measured: Comparison) =>
  reportMode === 'all' || (reportMode === 'differences' && !measured.same)
/** The fixtures whose baselines this run writes, from `PARITY_BASELINE` (comma-separated). */
const baselineFor = inject('parityBaseline').split(',').filter(Boolean)

const opening = FIXTURE_NAMES.filter((name) => manifest[name].opens)

/** Pages the report lists; images are on disk, only these numbers stay in memory. */
const reported: ReportPage[] = []
/** Pages drawn with the form layer that the form layer report lists. */
const reportedLayer: ReportPage[] = []
/** Every page drawn with the form layer, for `.report/form-layer-measures.json`. */
const layerMeasures: (Comparison & {
  fixture: string
  page: number
  /** How many widgets, and which, were left out of both captures. */
  leftOut: number
  left: string[]
})[] = []
/** Every page compared, same or not, for `.report/measures.json`. */
const measures: (Omit<Comparison, 'same'> & {
  fixture: string
  page: number
  same: boolean
  /** Share of inked pixels in each image: PDF.js (or the baseline), then the engine. */
  inked: [number, number]
})[] = []

afterAll(async () => {
  if (reportMode === 'off') return
  await writeReport(reported)
  await writeReport(reportedLayer, '.report/form-layer.html', 'Form layer parity')
  await writeText(
    '.report/form-layer-measures.json',
    JSON.stringify(layerMeasures, null, 1)
  )
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

/** Whether every pixel of `img` is pure white. */
function blank(img: ImageData): boolean {
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] !== 255 || img.data[i + 1] !== 255 || img.data[i + 2] !== 255)
      return false
  }
  return true
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
  verdict: { state: string; reason?: string } | undefined,
  measured: Comparison,
  left: ImageData,
  leftLabel: string,
  right: ImageData,
  into: { list: ReportPage[]; stem: string; note?: string } = {
    list: reported,
    stem: `${name}-${page}`,
  }
): Promise<void> {
  const { stem } = into
  const files = {
    left: `${stem}-a.png`,
    right: `${stem}-engine.png`,
    diff: `${stem}-diff.png`,
  }
  await writePng(`.report/${files.left}`, left)
  await writePng(`.report/${files.right}`, right)
  await writePng(`.report/${files.diff}`, differenceImage(left, right))
  into.list.push({
    fixture: name,
    page,
    state: verdict?.state ?? 'none',
    reason: verdict?.reason ?? '',
    measured,
    ...files,
    leftLabel,
    ...(into.note === undefined ? {} : { note: into.note }),
  })
}

/**
 * Page `page` drawn with the form layer by `pdfjs` (when given) and by `engine`, captured in one
 * step, with the widgets left out of both. A widget either reader's form layer leaves to its HTML
 * control is left out of both: which those are depends on what the file's scripts have done by
 * then (form-timer's bumps a field every 50 ms), not on the reader. Without `pdfjs` (a fixture
 * compared with its baseline, a full page drawing) nothing is left out: a widget left to its
 * control then shows no appearance and differs from the baseline, as it should. Throws when
 * every widget on the page would be left out, which would compare the page without its fields.
 */
async function captureBoth(
  engine: InkDocument,
  pdfjs: InkDocument | undefined,
  page: number,
  info: PageInfo
): Promise<{ a: ImageData | undefined; b: ImageData; left: string[] }> {
  const b = await mountWithFields(engine, page, info)
  try {
    const a = pdfjs && (await mountWithFields(pdfjs, page, info))
    try {
      const leave = new Set(a ? [...b.leftToControls(), ...a.leftToControls()] : [])
      const widgets = new Set([...b.widgets(), ...(a?.widgets() ?? [])])
      if (widgets.size > 0 && [...widgets].every((id) => leave.has(id)))
        throw new Error(
          `page ${page + 1}: every widget is left to its control or hidden (${[...leave].join(', ')}), so the form layer draws nothing to compare`
        )
      return { a: a?.capture(leave), b: b.capture(leave), left: [...leave].sort() }
    } finally {
      a?.destroy()
    }
  } finally {
    b.destroy()
  }
}

const describeNumbers = (c: Comparison) =>
  `${(c.share * 100).toFixed(2)}% of pixels, worst block ${(c.worstBlock * 100).toFixed(0)}%, ` +
  `longest unmatched run ${c.unmatchedRun} px, flat ${(c.flatShare * 100).toFixed(3)}% ` +
  `(worst block ${(c.flatBlock * 100).toFixed(0)}%)`

// Skipped: this compares two readers, and the comparison is being replaced by a comparison of the
// engine with committed results.
describe.skip.each(opening)('%s', (name) => {
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

      // Geometry first, whatever the verdict. Both readers then draw at the size and turn PDF.js's
      // page facts give, which the check has shown the engine's agree with.
      const infos: PageInfo[] = []
      for (let page = 0; page < pages; page++) {
        const a = await pdfjs._reader.pageInfo(page)
        const b = await engine._reader.pageInfo(page)
        expect(geometryDifference(a, b), `page ${page + 1} geometry`).toEqual([])
        infos.push(a)
      }

      if (verdict?.state === 'baseline') {
        for (let page = 0; page < pages; page++) {
          const drawn = await drawPage(engine, page, infos[page]!)
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
            ...measured,
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
      /** Pages both readers draw pure white. */
      const bothBlank: boolean[] = []
      for (let page = 0; page < pages; page++) {
        const a = await drawPage(pdfjs, page, infos[page]!)
        const b = await drawPage(engine, page, infos[page]!)
        const measured = compare(a, b)
        results.push(measured)
        bothBlank.push(blank(a) && blank(b))
        measures.push({ fixture: name, page, ...measured, inked: [inked(a), inked(b)] })
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
        bothBlank.forEach((isBlank, page) => {
          if (verdict.blank) {
            expect(
              isBlank,
              `page ${page + 1} is not blank: remove blank from parity.json`
            ).toBe(true)
          } else {
            expect(
              isBlank,
              `both readers draw page ${page + 1} blank, which proves nothing: record blank: true if the page is meant to be empty`
            ).toBe(false)
          }
        })
      } else {
        // The pages recorded as differing must still differ, and every other page must match.
        const differ = verdict.pages ?? results.map((_, page) => page + 1)
        results.forEach((r, page) => {
          if (differ.includes(page + 1)) {
            expect(
              r.same,
              `page ${page + 1} is now the same: update parity.json (${numbers.join('; ')})`
            ).toBe(false)
          } else {
            expect(r.same, `page ${page + 1} differs: ${describeNumbers(r)}`).toBe(true)
          }
        })
      }
    } finally {
      if (typeof pdfjs !== 'string') pdfjs.destroy()
      if (typeof engine !== 'string') engine.destroy()
    }
  })

  // The pages a person sees: the page canvas, which leaves the fields' widgets out, with the form
  // layer's appearance canvases over it. For a fixture compared with its baseline, the engine's
  // pages with the form layer are compared with that baseline, the engine's own page drawing.
  it('draws the pages with fields, the form layer over them, as parity.json records', async () => {
    const layer = verdictOn(name, 'formLayer')
    const results = await withBoth(name, async (pdfjs, engine, pages) => {
      const withFields = new Set([
        ...pagesWithFields(pdfjs, pages),
        ...pagesWithFields(engine, pages),
      ])
      const out: (Comparison | undefined)[] = []
      for (let page = 0; page < pages; page++) {
        if (!withFields.has(page)) {
          out.push(undefined)
          continue
        }
        const info = await pdfjs._reader.pageInfo(page)
        const baseline = verdict?.state === 'baseline'
        const committed = baseline ? await readPng(baselinePath(name, page)) : undefined
        if (committed === null)
          throw new Error(`no baseline at parity/${baselinePath(name, page)}`)
        const captured = await captureBoth(
          engine,
          baseline ? undefined : pdfjs,
          page,
          info
        )
        const { b, left } = captured
        const a = committed ?? captured.a!
        const measured = compare(a, b)
        out.push(measured)
        layerMeasures.push({
          fixture: name,
          page,
          ...measured,
          leftOut: left.length,
          left,
        })
        if (reports(measured))
          await record(
            name,
            page,
            layer,
            measured,
            a,
            baseline ? 'Baseline' : 'PDF.js',
            b,
            {
              list: reportedLayer,
              stem: `${name}-${page}-form`,
              note: `Widgets left out of both captures: ${left.length}${left.length > 0 ? ` (${left.join(', ')})` : ''}.`,
            }
          )
      }
      return out
    })
    if (results === undefined) return
    expectPages(
      layer,
      results.map((r) => r?.same ?? true),
      results.map((r) =>
        r === undefined ? 'no fields on the page, not drawn' : describeNumbers(r)
      )
    )
  })
})
