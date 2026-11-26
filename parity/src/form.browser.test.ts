// Reads every fixture's facts and form fields with PDF.js and with the engine, and holds each
// fixture to the facts and form verdicts parity.json records for it.
import { afterAll, describe, inject, it } from 'vitest'

import { factDifferences, formDifferences } from './form'
import { expectWhole, opening, verdictOn, withBoth } from './parts'
import { dataReportHtml, writeText, type DataReportEntry } from './report'

const reportMode = inject('parityReport')

/** What the form report lists. */
const reported: DataReportEntry[] = []

afterAll(async () => {
  if (reportMode === 'off') return
  await writeText(
    '.report/form.html',
    dataReportHtml(reported, new Date().toISOString(), 'Facts and form field parity')
  )
})

const reports = (lines: string[]) =>
  reportMode === 'all' || (reportMode === 'differences' && lines.length > 0)

describe.each(opening)('%s', (name) => {
  it('reads the facts and the form fields as parity.json records', async () => {
    const verdicts = { facts: verdictOn(name, 'facts'), form: verdictOn(name, 'form') }
    const read = await withBoth(name, async (pdfjs, engine) => ({
      facts: factDifferences(await pdfjs._reader.facts(), await engine._reader.facts()),
      form: formDifferences(await pdfjs._reader.form(), await engine._reader.form()),
    }))
    if (read === undefined) return
    for (const part of ['facts', 'form'] as const) {
      const verdict = verdicts[part]
      if (reports(read[part]))
        reported.push({
          fixture: name,
          part,
          state: verdict.state,
          reason: verdict.state === 'different' ? verdict.reason : '',
          lines: read[part],
        })
    }
    expectWhole(verdicts.facts, read.facts, 'the facts')
    expectWhole(verdicts.form, read.form, 'the fields')
  })
})
