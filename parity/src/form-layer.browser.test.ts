// Draws every fixture's first pages that hold form fields as a person sees them, the form layer's
// appearances over the page, and holds each to its committed drawing.
import { afterAll, describe, expect, it } from 'vitest'

import { BaselineFiles, formLayerFile, reporting } from './baselines'
import { checkImage } from './check'
import {
  drawWithFields,
  OPENING,
  openFixture,
  pagesChecked,
  pagesWithFields,
} from './draw'
import { Report } from './report'

import type { FixtureName } from '@inkbar/fixtures/urls'

/**
 * Fixtures whose pages with the form layer depend on when they are captured, because a script
 * changes a field on a timer: these are not drawn with the form layer and have no such baseline.
 * Their pages alone still are.
 */
export const TIMED: Partial<Record<FixtureName, string>> = {
  'form-timer': 'a script bumps a field every 50 ms',
}

const files = new BaselineFiles('form-layer')
const report = new Report('form-layer.html', 'Pages with the form layer that differ')

afterAll(async () => {
  if (reporting) await report.write()
})

describe.each(OPENING)('%s', (name) => {
  it('draws its pages with fields, the form layer over them, as committed', async () => {
    const doc = await openFixture(name)
    try {
      const pages =
        TIMED[name] === undefined ? pagesWithFields(doc, pagesChecked(doc)) : []
      await files.expect(
        name,
        pages.map((page) => formLayerFile(name, page))
      )
      const problems: string[] = []
      for (const page of pages) {
        const problem = await checkImage(
          name,
          formLayerFile(name, page),
          `page ${page + 1} with the form layer`,
          await drawWithFields(doc, page),
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
  it('hold no form layer drawing the suite does not draw', async () => {
    expect(files.fixtures, 'fixtures checked').toBeGreaterThan(0)
    expect(await files.unused()).toEqual([])
  })
})
