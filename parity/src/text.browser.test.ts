// Reads every fixture's first pages' text with PDF.js and with the engine and holds each fixture to
// the text verdict parity.json records for it.
import { createPageTransform } from '@inkbar/core/dom'
import { afterAll, describe, inject, it } from 'vitest'

import { drawPage } from './draw'
import { expectPages, opening, verdictOn, withBoth } from './parts'
import { writePng, writeText, textReportHtml, type TextReportPage } from './report'
import { charCentres, compareText, joinedText, type TextComparison } from './text'

import type { InkDocument, TextContent } from '@inkbar/core'

const reportMode = inject('parityReport')

/** Pages the text report lists. */
const reported: TextReportPage[] = []
/** Every page compared, for `.report/text-measures.json`. */
const measures: (TextComparison & { fixture: string; page: number })[] = []

afterAll(async () => {
  if (reportMode === 'off') return
  await writeText('.report/text.html', textReportHtml(reported, new Date().toISOString()))
  await writeText('.report/text-measures.json', JSON.stringify(measures, null, 1))
})

const describeText = (r: TextComparison, a: string, b: string) =>
  r.firstDifference !== undefined
    ? `the text differs from character ${r.firstDifference}: PDF.js ${JSON.stringify(a.slice(r.firstDifference, r.firstDifference + 40))}, engine ${JSON.stringify(b.slice(r.firstDifference, r.firstDifference + 40))}`
    : `worst character ${r.worstAt === undefined ? 'none' : JSON.stringify(a.slice(r.worstAt, r.worstAt + 1))} at ${r.worstAt ?? '-'}, ${r.worstOffset.toFixed(3)} of the font size apart`

/** The page drawn by the engine, with both readers' boxes and character centres in its pixels. */
async function record(
  name: string,
  page: number,
  engine: InkDocument,
  texts: [TextContent, TextContent],
  measured: TextComparison,
  state: string,
  reason: string
): Promise<void> {
  const info = await engine._reader.pageInfo(page)
  const image = `${name}-${page}-text.png`
  const drawn = await drawPage(engine, page, info)
  await writePng(`.report/${image}`, drawn)
  await writeText(
    `.report/${name}-${page}-text.json`,
    JSON.stringify({ pdfjs: texts[0], engine: texts[1] }, null, 1)
  )
  const t = createPageTransform(info, 2, 0)
  const marks = texts.map((content) => ({
    quads: content.items.map((it) => {
      const q = t.toCssQuad(it.quad)
      return [q.p1, q.p2, q.p4, q.p3]
    }),
    centres: charCentres(content).map((c) => t.toCss(c)),
  }))
  reported.push({
    fixture: name,
    page,
    state,
    reason,
    measured,
    strings: [joinedText(texts[0]), joinedText(texts[1])],
    image,
    width: drawn.width,
    height: drawn.height,
    pdfjs: marks[0]!,
    engine: marks[1]!,
  })
}

// Skipped: this compares two readers, and the comparison is being replaced by a comparison of the
// engine with committed results.
describe.skip.each(opening)('%s', (name) => {
  it('reads text as parity.json records', async () => {
    const verdict = verdictOn(name, 'text')
    const reason = verdict.state === 'different' ? verdict.reason : ''
    const results = await withBoth(name, async (pdfjs, engine, pages) => {
      const results: { measured: TextComparison; strings: [string, string] }[] = []
      for (let page = 0; page < pages; page++) {
        const a = await pdfjs._reader.text(page, { glyphs: true })
        const b = await engine._reader.text(page, { glyphs: true })
        const measured = compareText(a, b)
        results.push({ measured, strings: [joinedText(a), joinedText(b)] })
        measures.push({ fixture: name, page, ...measured })
        if (reportMode === 'all' || (reportMode === 'differences' && !measured.same)) {
          await record(name, page, engine, [a, b], measured, verdict.state, reason)
        }
      }
      return results
    })
    if (results === undefined) return
    expectPages(
      verdict,
      results.map((r) => r.measured.same),
      results.map((r) => describeText(r.measured, ...r.strings))
    )
  })
})
