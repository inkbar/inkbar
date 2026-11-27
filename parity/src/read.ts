// What the suite reads from a fixture besides pixels, part by part, as plain data for its
// baseline. A part that holds nothing for a fixture reads as `undefined` and has no baseline file.

import { pagesChecked } from './draw'
import { resolveLinks } from './links'
import { joinedText } from './text'

import type { InkDocument } from '@inkbar/core'

/** The parts read, each the name of its baseline file without `.json`. */
export const PARTS = [
  'facts',
  'text',
  'links',
  'outline',
  'fields',
  'annotations',
  'scripts',
] as const
export type Part = (typeof PARTS)[number]

/** The text of the pages the suite draws: the joined string, then every item but its `rect`. */
async function text(doc: InkDocument): Promise<unknown> {
  const pages = []
  for (let page = 0; page < pagesChecked(doc); page++) {
    const content = await doc._reader.text(page, { glyphs: true })
    pages.push({
      page: page + 1,
      text: joinedText(content),
      // `rect` is the bounds of `quad`, so it says nothing more.
      items: content.items.map(({ rect: _rect, ...item }) => item),
    })
  }
  return pages.some((p) => p.items.length > 0) ? pages : undefined
}

/**
 * `read(page)` for every page of `doc`, listed with its page number (from 1), for the pages where
 * `has` says it holds something. `undefined` when no page does.
 */
async function everyPage<T>(
  doc: InkDocument,
  read: (page: number) => Promise<T>,
  has: (value: T) => boolean
): Promise<{ page: number; value: T }[] | undefined> {
  const out: { page: number; value: T }[] = []
  for (let page = 0; page < doc._reader.pageCount; page++) {
    const value = await read(page)
    if (has(value)) out.push({ page: page + 1, value })
  }
  return out.length > 0 ? out : undefined
}

/** Reads `part` of `doc`; `undefined` when the fixture holds none of it. */
export async function readPart(doc: InkDocument, part: Part): Promise<unknown> {
  const reader = doc._reader
  switch (part) {
    case 'facts':
      return reader.facts()
    case 'text':
      return text(doc)
    case 'links': {
      // Each destination as it resolves, through the document, which gives a lookup that fails
      // as one that goes nowhere.
      const pages = await everyPage(
        doc,
        async (page) =>
          resolveLinks(await reader.links(page), (raw) => doc.resolveDestination(raw)),
        (links) => links.length > 0
      )
      return pages?.map(({ page, value }) => ({ page, links: value }))
    }
    case 'outline': {
      const outline = await doc.outline()
      return outline.length > 0 ? outline : undefined
    }
    case 'fields': {
      const fields = await reader.form()
      return fields.length > 0 ? fields : undefined
    }
    case 'annotations': {
      const pages = await everyPage(
        doc,
        async (page) => ({
          annotations: await reader.annotations(page),
          tabOrder: await reader.tabOrder(page),
        }),
        (v) => v.annotations.length > 0 || v.tabOrder.length > 0
      )
      return pages?.map(({ page, value }) => ({ page, ...value }))
    }
    case 'scripts': {
      const scripts = await reader.scripts()
      const pages = await everyPage(
        doc,
        (page) => reader.pageScripts(page),
        (actions) => Object.keys(actions).length > 0
      )
      if (scripts === undefined && pages === undefined) return undefined
      return {
        file: scripts ?? null,
        pages: (pages ?? []).map(({ page, value }) => ({ page, actions: value })),
      }
    }
  }
}
