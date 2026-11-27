// Reads every fixture's JavaScript, and each page's actions, with PDF.js and with the engine, and
// holds each fixture to the scripts verdict parity.json records for it.
import { afterAll, describe, inject, it } from 'vitest'

import { expectWhole, opening, verdictOn, withBoth } from './parts'
import { dataReportHtml, writeText, type DataReportEntry } from './report'
import { scriptDifferences, type ScriptRead } from './scripts'

import type { InkDocument } from '@inkbar/core'

const reportMode = inject('parityReport')

/** What the scripts report lists. */
const reported: DataReportEntry[] = []

afterAll(async () => {
  if (reportMode === 'off') return
  await writeText(
    '.report/scripts.html',
    dataReportHtml(reported, new Date().toISOString(), 'Script parity')
  )
})

/** The file's JavaScript and every page's actions, as `doc`'s reader gives them. */
async function scriptsOf(doc: InkDocument, pageCount: number): Promise<ScriptRead> {
  const pages: ScriptRead['pages'] = []
  for (let page = 0; page < pageCount; page++)
    pages.push(await doc._reader.pageScripts(page))
  return { scripts: await doc._reader.scripts(), pages }
}

// Skipped: this compares two readers, and the comparison is being replaced by a comparison of the
// engine with committed results.
describe.skip.each(opening)('%s', (name) => {
  it('reads the JavaScript as parity.json records', async () => {
    const verdict = verdictOn(name, 'scripts')
    const lines = await withBoth(name, async (pdfjs, engine, _pages, pageCount) =>
      scriptDifferences(
        await scriptsOf(pdfjs, pageCount),
        await scriptsOf(engine, pageCount)
      )
    )
    if (lines === undefined) return
    if (reportMode === 'all' || (reportMode === 'differences' && lines.length > 0))
      reported.push({
        fixture: name,
        part: 'scripts',
        state: verdict.state,
        reason: verdict.state === 'different' ? verdict.reason : '',
        lines,
      })
    expectWhole(verdict, lines, 'the scripts')
  })
})
