// Reads every fixture's links on every page, and its outline, with PDF.js and with the engine,
// and holds each fixture to the links and outline verdicts parity.json records for it.
import { afterAll, describe, expect, inject, it } from 'vitest'

import { linkDifferences, outlineDifferences, resolveLinks } from './links'
import { expectPages, opening, verdictOn, withBoth } from './parts'
import { linksReportHtml, writeText, type LinksReportEntry } from './report'

import type { InkDocument } from '@inkbar/core'

const reportMode = inject('parityReport')

/** What the links report lists. */
const reported: LinksReportEntry[] = []

afterAll(async () => {
  if (reportMode === 'off') return
  await writeText(
    '.report/links.html',
    linksReportHtml(reported, new Date().toISOString())
  )
})

/**
 * Page `page`'s links read by `doc`, each destination resolved by the same reader through the
 * document, which gives a lookup that fails as one that goes nowhere.
 */
const linksOf = async (doc: InkDocument, page: number) =>
  resolveLinks(await doc._reader.links(page), (raw) => doc.resolveDestination(raw))

const reports = (lines: string[]) =>
  reportMode === 'all' || (reportMode === 'differences' && lines.length > 0)

describe.each(opening)('%s', (name) => {
  it('reads links and the outline as parity.json records', async () => {
    const links = verdictOn(name, 'links')
    const outline = verdictOn(name, 'outline')
    const read = await withBoth(name, async (pdfjs, engine, _pages, pageCount) => {
      const perPage: string[][] = []
      for (let page = 0; page < pageCount; page++) {
        perPage.push(
          linkDifferences(await linksOf(pdfjs, page), await linksOf(engine, page))
        )
      }
      return {
        perPage,
        outline: outlineDifferences(await pdfjs.outline(), await engine.outline()),
      }
    })
    if (read === undefined) return

    read.perPage.forEach((lines, page) => {
      if (reports(lines))
        reported.push({
          fixture: name,
          part: 'links',
          page,
          state: links.state,
          reason: links.state === 'different' ? links.reason : '',
          lines,
        })
    })
    if (reports(read.outline))
      reported.push({
        fixture: name,
        part: 'outline',
        state: outline.state,
        reason: outline.state === 'different' ? outline.reason : '',
        lines: read.outline,
      })

    expectPages(
      links,
      read.perPage.map((lines) => lines.length === 0),
      read.perPage.map((lines) =>
        lines.length === 0 ? 'the same links' : lines.join('; ')
      )
    )
    if (outline.state === 'different') {
      expect(read.outline, 'the outline is now the same: update parity.json').not.toEqual(
        []
      )
    } else {
      expect(read.outline, 'the outline differs').toEqual([])
    }
  })
})
