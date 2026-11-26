// Reads every fixture's annotations and Tab order on every page with PDF.js and with the engine,
// and holds each fixture to the annotations verdict parity.json records for it.
import { afterAll, describe, inject, it } from 'vitest'

import { annotationDifferences, tabOrderDifferences } from './annotations'
import { expectPages, opening, verdictOn, withBoth } from './parts'
import { dataReportHtml, writeText, type DataReportEntry } from './report'

const reportMode = inject('parityReport')

/** What the annotations report lists. */
const reported: DataReportEntry[] = []

afterAll(async () => {
  if (reportMode === 'off') return
  await writeText(
    '.report/annotations.html',
    dataReportHtml(reported, new Date().toISOString(), 'Annotation and tab order parity')
  )
})

const reports = (lines: string[]) =>
  reportMode === 'all' || (reportMode === 'differences' && lines.length > 0)

describe.each(opening)('%s', (name) => {
  it("reads each page's annotations and tab order as parity.json records", async () => {
    const verdict = verdictOn(name, 'annotations')
    const perPage = await withBoth(name, async (pdfjs, engine, _pages, pageCount) => {
      const out: string[][] = []
      for (let page = 0; page < pageCount; page++) {
        out.push([
          ...annotationDifferences(
            await pdfjs._reader.annotations(page),
            await engine._reader.annotations(page)
          ),
          ...tabOrderDifferences(
            await pdfjs._reader.tabOrder(page),
            await engine._reader.tabOrder(page)
          ),
        ])
      }
      return out
    })
    if (perPage === undefined) return
    perPage.forEach((lines, page) => {
      if (reports(lines))
        reported.push({
          fixture: name,
          part: 'annotations',
          page,
          state: verdict.state,
          reason: verdict.state === 'different' ? verdict.reason : '',
          lines,
        })
    })
    expectPages(
      verdict,
      perPage.map((lines) => lines.length === 0),
      perPage.map((lines) =>
        lines.length === 0 ? 'the same annotations' : lines.join('; ')
      )
    )
  })
})
