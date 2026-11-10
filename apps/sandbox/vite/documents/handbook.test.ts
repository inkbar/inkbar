import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  openDocument,
  type InkDocument,
  type PageLink,
  type RawDestination,
} from '@inkbar/core'

import { makeHandbook } from './handbook.ts'

/** PDF.js's files from core's own copy, as file paths for Node. */
function nodeAssets() {
  const require = createRequire(fileURLToPath(import.meta.resolve('@inkbar/core')))
  const root = dirname(require.resolve('pdfjs-dist/package.json'))
  return {
    worker: require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    cMaps: join(root, 'cmaps') + '/',
    standardFonts: join(root, 'standard_fonts') + '/',
    wasm: join(root, 'wasm') + '/',
    icc: join(root, 'iccs') + '/',
  }
}

const opened: InkDocument[] = []
let cached: Promise<InkDocument> | undefined

/** The handbook, open and ready; shared by the tests that only read it. */
function handbook(): Promise<InkDocument> {
  cached ??= (async () => {
    const doc = await openDocument((await makeHandbook()).slice(), {
      assets: nodeAssets(),
    })
    opened.push(doc)
    await doc.ready
    return doc
  })()
  return cached
}

after(() => {
  for (const doc of opened) doc.destroy()
})

interface Item {
  str: string
  x: number
  /** The right edge. */
  end: number
  y: number
}

/** The text runs of a page with their left edge and vertical centre in user space. */
async function runs(doc: InkDocument, page: number): Promise<Item[]> {
  const { items } = await doc.text(page)
  return items.flatMap((i) =>
    'str' in i && i.str.trim()
      ? [
          {
            str: i.str,
            x: i.rect.x + 0.5,
            end: i.rect.x + i.rect.width,
            y: i.rect.y + i.rect.height / 2,
          },
        ]
      : []
  )
}

/** The runs drawn inside a link's rectangle. */
const within = (items: Item[], link: PageLink): Item[] =>
  items.filter(
    (i) =>
      i.x >= link.rect.x - 1 &&
      i.x <= link.rect.x + link.rect.width &&
      i.y >= link.rect.y &&
      i.y <= link.rect.y + link.rect.height
  )

/**
 * The runs that reach into a link's rectangle. PDF.js joins neighbouring text into one run,
 * so a link in the middle of a sentence is found by overlap rather than by where a run starts.
 */
const touching = (items: Item[], link: PageLink): Item[] =>
  items.filter(
    (i) =>
      i.end >= link.rect.x &&
      i.x <= link.rect.x + link.rect.width &&
      i.y >= link.rect.y &&
      i.y <= link.rect.y + link.rect.height
  )

/** The raw destination a link names. */
function rawOf(link: PageLink): RawDestination {
  assert.equal(link.target.kind, 'dest', `link target ${link.target.kind}`)
  return link.target.raw
}

async function pageOf(doc: InkDocument, link: PageLink): Promise<number> {
  const dest = await doc.resolveDestination(rawOf(link))
  assert.ok(dest, 'destination resolves')
  return dest.page
}

void test('has an outline with chapters and sections', async () => {
  const doc = await handbook()
  assert.ok(doc.pages.length >= 14 && doc.pages.length <= 18, `${doc.pages.length} pages`)
  const items = await doc.outline()
  assert.deepEqual(
    items.map((i) => i.title),
    [
      '1. Before you go out',
      '2. Setting out the site',
      '3. Recording and checking',
      '4. Staying safe and caring for kit',
      'Appendix: kit checklist',
      'Index',
    ]
  )
  const chapters = items.slice(0, 4)
  for (const c of chapters)
    assert.ok(c.children.length >= 2 && c.children.length <= 3, c.title)
  assert.deepEqual(
    chapters.map((c) => c.open),
    [true, true, false, true]
  )
  assert.equal(items[5]!.bold, true)
  assert.equal(items[4]!.italic, true)
  assert.equal(items[0]!.bold, false)
  // Every item names a page, and the chapters follow one another.
  const pages = items.map((i) => {
    assert.equal(i.target.kind, 'resolved', i.title)
    return (i.target as { dest: { page: number } }).dest.page
  })
  assert.deepEqual(
    pages,
    [...pages].sort((a, b) => a - b)
  )
  assert.equal(pages[5], doc.pages.length - 1)
})

void test('every contents line links to its heading', async () => {
  const doc = await handbook()
  const links = doc.links(1)
  const outline = await doc.outline()
  const sections = outline.slice(0, 4).reduce((n, c) => n + c.children.length, 0)
  assert.equal(links.length, 4 + sections + 2)
  const printed = await runs(doc, 1)
  let named = 0
  for (const link of links) {
    if (typeof rawOf(link) === 'string') named++
    const numbers = within(printed, link).filter((i) => /^\d+$/.test(i.str.trim()))
    const number = numbers.at(-1)
    assert.ok(number, `no page number on the line at y ${link.rect.y}`)
    assert.equal((await pageOf(doc, link)) + 1, Number(number.str), `line ${link.id}`)
    const dest = await doc.resolveDestination(rawOf(link))
    assert.equal(dest!.fit, 'xyz')
  }
  assert.equal(named, 4, 'chapters use names, sections explicit destinations')
})

void test('the body links its cross references and its footnote', async () => {
  const doc = await handbook()
  let see = 0
  let notes = 0
  for (let p = 2; p < doc.pages.length - 1; p++) {
    const printed = await runs(doc, p)
    for (const link of doc.links(p)) {
      if (link.target.kind !== 'dest') continue
      const text = touching(printed, link)
        .map((i) => i.str)
        .join(' ')
      if (/section \d\.\d/.test(text)) see++
      else if ((await pageOf(doc, link)) === p) notes++
    }
  }
  assert.ok(see >= 3, `${see} see-section links`)
  assert.equal(notes, 1)
})

void test('index page numbers link to their pages', async () => {
  const doc = await handbook()
  const last = doc.pages.length - 1
  const links = doc.links(last)
  assert.ok(links.length >= 30, `${links.length} index links`)
  const printed = await runs(doc, last)
  for (const link of links) {
    const text = within(printed, link)
      .map((i) => i.str)
      .join('')
      .replace(/[^\d]/g, '')
    assert.equal((await pageOf(doc, link)) + 1, Number(text), `link at y ${link.rect.y}`)
  }
})

void test('one external link', async () => {
  const doc = await handbook()
  const urls: string[] = []
  for (let p = 0; p < doc.pages.length; p++)
    for (const link of doc.links(p))
      if (link.target.kind === 'url') urls.push(link.target.url)
  // PDF.js writes the bare host with a trailing slash.
  assert.deepEqual(urls, ['https://inkbar.dev/'])
})

void test('at least two sections share a page', async () => {
  const doc = await handbook()
  const pages = (await doc.outline())
    .slice(0, 4)
    .flatMap((c) => c.children)
    .map((s) => (s.target as { dest: { page: number } }).dest.page)
  assert.ok(new Set(pages).size < pages.length)
})
