// Shared by the text and link checks: which fixtures they read, how each opens both readers, and
// how a result is held to its verdict in parity.json, with the drawing check's messages.
import manifestJson from '@inkbar/fixtures/manifest.json'
import { FIXTURE_NAMES, type FixtureName } from '@inkbar/fixtures/urls'
import { expect } from 'vitest'

import parityJson from '../parity.json'

import { openWith } from './draw'
import { PAGES_PER_FIXTURE } from './pages'
import { partVerdict, type Part, type ParityFile, type PartVerdict } from './verdicts'

import type { InkDocument } from '@inkbar/core'
import type { FixtureMeta } from '@inkbar/fixtures'

const manifest = manifestJson as unknown as Record<FixtureName, FixtureMeta>
const verdicts = parityJson as Partial<ParityFile>

/** Every fixture that opens, as the drawing check reads them. */
export const opening = FIXTURE_NAMES.filter((name) => manifest[name].opens)

/** The verdict parity.json records on `part` of fixture `name`. */
export const verdictOn = (name: FixtureName, part: Part): PartVerdict =>
  partVerdict(verdicts[name], part)

/**
 * Opens `name` with both readers and passes them to `read`, with the number of pages whose text
 * and drawing are compared and the number of pages in the file; closes both after. Resolves to
 * `undefined` without opening anything for a fixture recorded as `skipped`, which the drawing
 * check holds to that verdict. Throws when the fixture has no verdict, when a reader does not
 * open it, or when the readers count its pages differently.
 */
export async function withBoth<T>(
  name: FixtureName,
  read: (
    pdfjs: InkDocument,
    engine: InkDocument,
    pages: number,
    pageCount: number
  ) => Promise<T>
): Promise<T | undefined> {
  const verdict = verdicts[name]
  if (verdict?.state === 'skipped') return undefined
  if (verdict === undefined) throw new Error('no verdict recorded in parity.json')
  const pdfjs = await openWith(name, 'pdfjs')
  try {
    const engine = await openWith(name, 'engine')
    try {
      const counts = [pdfjs._reader.pageCount, engine._reader.pageCount]
      expect(counts[1], 'page count, engine against PDF.js').toBe(counts[0])
      const pages = Math.min(counts[0]!, PAGES_PER_FIXTURE)
      return await read(pdfjs, engine, pages, counts[0]!)
    } finally {
      engine.destroy()
    }
  } finally {
    pdfjs.destroy()
  }
}

/**
 * Holds per-page results to a verdict: with `same`, every page must be the same; with `different`,
 * the pages it lists (every page without `pages`) must differ and every other page must be the
 * same. `details[page]` says how page `page` compares.
 */
export function expectPages(
  verdict: PartVerdict,
  same: readonly boolean[],
  details: readonly string[]
): void {
  const differ =
    verdict.state === 'different' ? (verdict.pages ?? same.map((_, i) => i + 1)) : []
  same.forEach((isSame, page) => {
    if (differ.includes(page + 1)) {
      expect(
        isSame,
        `page ${page + 1} is now the same: update parity.json (${details.map((d, i) => `page ${i + 1}: ${d}`).join('; ')})`
      ).toBe(false)
    } else {
      expect(isSame, `page ${page + 1} differs: ${details[page]}`).toBe(true)
    }
  })
}
