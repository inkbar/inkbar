// Draws the first pages of every fixture that opens and holds each to its committed drawing.
import { afterAll, describe, expect, it } from 'vitest'

import { BaselineFiles, pageFile, reporting } from './baselines'
import { checkImage } from './check'
import { drawPage, OPENING, openFixture, pagesChecked } from './draw'
import { Report } from './report'

const files = new BaselineFiles('pages')
const report = new Report('pages.html', 'Pages that differ from their baselines')

afterAll(async () => {
  if (reporting) await report.write()
})

describe.each(OPENING)('%s', (name) => {
  it('draws its pages as committed', async () => {
    const doc = await openFixture(name)
    try {
      const pages = [...Array(pagesChecked(doc)).keys()]
      await files.expect(
        name,
        pages.map((page) => pageFile(name, page))
      )
      const problems: string[] = []
      for (const page of pages) {
        const problem = await checkImage(
          name,
          pageFile(name, page),
          `page ${page + 1}`,
          await drawPage(doc, page),
          report
        )
        if (problem !== undefined) problems.push(problem)
      }
      if (problems.length > 0) throw new Error(problems.join('\n'))
    } finally {
      doc.destroy()
    }
  })
})

describe('the baselines', () => {
  it('hold no page drawing the suite does not draw', async () => {
    expect(files.fixtures, 'fixtures checked').toBeGreaterThan(0)
    expect(await files.unused()).toEqual([])
  })
})
