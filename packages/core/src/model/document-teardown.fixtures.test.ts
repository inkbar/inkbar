import { fixtureBytes } from '@inkbar/fixtures'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { nodeAssets } from '../pdfjs/node-assets'

import { openDocument } from './document'
import { InkError } from './errors'

afterEach(() => vi.restoreAllMocks())

/** What PDF.js printed about a read cut short, on either console method it uses. */
function cutShortWarnings() {
  const printed: string[] = []
  const keep = (...args: unknown[]) => void printed.push(args.join(' '))
  vi.spyOn(console, 'log').mockImplementation(keep)
  vi.spyOn(console, 'warn').mockImplementation(keep)
  return () => printed.filter((line) => line.includes('Worker task was terminated'))
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** How each read ended: `'read'`, or the code or name of what it rejected with. */
const outcome = (read: Promise<unknown>): Promise<string> =>
  read.then(
    () => 'read',
    (error: unknown) => (error instanceof InkError ? error.code : (error as Error).name)
  )

describe('destroying a document while PDF.js reads text', () => {
  it('prints no warning when reads are still running', async () => {
    const warnings = cutShortWarnings()
    for (let round = 0; round < 5; round++) {
      const doc = await openDocument(await fixtureBytes('outline'), {
        assets: nodeAssets(),
      })
      await doc.ready
      const reads = [0, 1, 2, 3].map((page) => outcome(doc.text(page)))
      // Destroyed at a different point in the reads each round.
      if (round > 0) await pause(round)
      doc.destroy()
      // Every read ends, and none gives text from a destroyed document.
      expect(await Promise.all(reads)).toEqual(Array(4).fill('DocumentDestroyed'))
      await pause(100)
    }
    expect(warnings()).toEqual([])
  })

  it('prints no warning when a search was aborted just before', async () => {
    const warnings = cutShortWarnings()
    for (let round = 0; round < 5; round++) {
      const doc = await openDocument(await fixtureBytes('outline'), {
        assets: nodeAssets(),
      })
      await doc.ready
      const abort = new AbortController()
      const search = outcome(doc.search('chapter', { signal: abort.signal }).all())
      if (round > 0) await pause(round)
      abort.abort()
      doc.destroy()
      expect(await search).toBe('AbortError')
      await pause(100)
    }
    expect(warnings()).toEqual([])
  })
})
