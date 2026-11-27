// Reads every fixture's facts, text, links, outline, form fields, annotations and JavaScript and
// holds each part to its committed data.
import { afterAll, describe, expect, it } from 'vitest'

import { BaselineFiles, partFile, reporting } from './baselines'
import { checkData } from './check'
import { OPENING, openFixture } from './draw'
import { PARTS, readPart } from './read'
import { Report } from './report'

const files = new BaselineFiles('data')
const report = new Report('data.html', 'Data that differs from its baselines')

afterAll(async () => {
  if (reporting) await report.write()
})

describe.each(OPENING)('%s', (name) => {
  it('reads its facts, text, links, outline, fields, annotations and scripts as committed', async () => {
    const doc = await openFixture(name)
    try {
      const read = new Map<string, unknown>()
      for (const part of PARTS) read.set(part, await readPart(doc, part))
      await files.expect(
        name,
        PARTS.filter((part) => read.get(part) !== undefined).map((part) =>
          partFile(name, part)
        )
      )
      const problems: string[] = []
      for (const part of PARTS) {
        const problem = await checkData(
          name,
          partFile(name, part),
          part,
          read.get(part),
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
  it('hold no file the suite does not read', async () => {
    expect(files.fixtures, 'fixtures checked').toBeGreaterThan(0)
    expect(await files.unused()).toEqual([])
  })
})
